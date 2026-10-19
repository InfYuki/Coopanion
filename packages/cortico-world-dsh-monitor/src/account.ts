/**
 * 账号与「今日用量」的只读数据源。
 *
 * 两个来源，都是文件，都不需要任何凭据：
 * - **余额**：由 DSH 侧的小插件 `coopanion-account-bridge` 写到
 *   `$DSH_HOME/storages/coopanion-bridge/account.json`（宿主自己用官方 `deepseekAccount` 服务查的，
 *   凭据从不离开 DSH）。本模块只读那个文件。
 * - **今日用量**：DSH 的会话事件日志 `$DSH_HOME/sessions/**\/session.v4.jsonl.zstd`。
 *   每条 `assistant/message` 带 `data.usage`，按本地日期落桶。日志是**多帧 zstd 拼接**，
 *   必须按魔数切片后逐帧解压——`zstdDecompressSync` 一次只解第一帧。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as zlib from 'node:zlib';

/** 一个钱包；金额保持字符串，因为 Platform 会发 `0E-16` 这类科学计数法。 */
export interface Wallet {
  currency: string;
  balance: string;
}

/** 桥接插件发布的账号快照。 */
export interface AccountSnapshot {
  /** 发布时刻（毫秒）。 */
  at: number;
  status: 'ready' | 'signed-out' | 'failed' | 'error' | string;
  wallets: Wallet[];
  bonusWallets: Wallet[];
  profile: { id: string | null; name: string | null } | null;
  error?: string;
}

/** 某一天的 token 账本，四项分开（缓存命中占绝对多数，混算会错）。 */
export interface UsageBuckets {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** 一天的用量。 */
export interface DayUsage extends UsageBuckets {
  /** 本地日期，`2026-10-19`。 */
  date: string;
  /** 结算过的请求数（`assistant/message` 条数，按 turn+step 去重）。 */
  requests: number;
  /** 涉及的会话数。 */
  sessions: number;
  /** 四项之和，给人看的「一共多少」。 */
  total: number;
}

/** 读不到时返回的原因，供工具与界面照实说。 */
export interface TodayUsageResult {
  ok: boolean;
  usage: DayUsage | null;
  /** `ok` 为 false 时的一句话原因。 */
  reason?: string;
  /** 扫了多少个日志文件、多少字节，便于判断成本。 */
  scanned?: { files: number; bytes: number };
}

/** zstd 帧的魔数。 */
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** 解压后最多读多少字节，防止一次点击把内存吃光。 */
const MAX_DECODED_BYTES = 256 * 1024 * 1024;

/** 桥接插件写出的目录。 */
export function defaultBridgeDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim();
  return join(home || join(homedirFallback(), '.dsh'), 'storages', 'coopanion-bridge');
}

/** DSH 的会话日志根目录。 */
export function defaultSessionsDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim();
  return join(home || join(homedirFallback(), '.dsh'), 'sessions');
}

function homedirFallback(): string {
  return process.env.USERPROFILE || process.env.HOME || '.';
}

/** 读账号快照；文件不存在、坏掉或结构不符时返回 null（调用方照实说「没拿到」）。 */
export function readAccount(bridgeDir: string): AccountSnapshot | null {
  let raw: string;
  try {
    raw = readFileSync(join(bridgeDir, 'account.json'), 'utf8');
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = json as Record<string, unknown>;
  if (!r || typeof r !== 'object' || typeof r.status !== 'string') return null;
  const wallets = (v: unknown): Wallet[] => (Array.isArray(v) ? v : [])
    .map((w) => w as Record<string, unknown>)
    .filter((w) => w && typeof w.currency === 'string')
    .map((w) => ({ currency: String(w.currency), balance: String(w.balance ?? '') }));
  const profile = r.profile as Record<string, unknown> | null | undefined;
  return {
    at: typeof r.at === 'number' ? r.at : 0,
    status: String(r.status),
    wallets: wallets(r.wallets),
    bonusWallets: wallets(r.bonusWallets),
    profile: profile && typeof profile === 'object'
      ? { id: profile.id ? String(profile.id) : null, name: profile.name ? String(profile.name) : null }
      : null,
    error: typeof r.error === 'string' ? r.error : undefined,
  };
}

/** 本地零点的毫秒时间戳。 */
export function startOfLocalDay(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 本地日期串 `YYYY-MM-DD`。 */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 把一段多帧 zstd 按魔数切成单帧。 */
export function splitZstdFrames(bytes: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    if (bytes[i] === ZSTD_MAGIC[0] && bytes[i + 1] === ZSTD_MAGIC[1]
      && bytes[i + 2] === ZSTD_MAGIC[2] && bytes[i + 3] === ZSTD_MAGIC[3]) {
      starts.push(i);
      i += 3;
    }
  }
  return starts.map((start, i) => bytes.subarray(start, i + 1 < starts.length ? starts[i + 1] : bytes.length));
}

/** 解一段多帧 zstd 文本；坏帧跳过，不因一帧坏就整份放弃。 */
export function decodeSessionLog(bytes: Uint8Array): string {
  const decompress = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Uint8Array }).zstdDecompressSync;
  if (typeof decompress !== 'function') {
    throw new Error('zstdDecompressSync is unavailable in this Node build');
  }
  const parts: string[] = [];
  let budget = MAX_DECODED_BYTES;
  for (const frame of splitZstdFrames(bytes)) {
    try {
      const out = decompress(frame);
      parts.push(Buffer.from(out).toString('utf8'));
      budget -= out.length;
      if (budget <= 0) break;
    } catch {
      // a truncated tail frame is normal while DSH is appending
    }
  }
  return parts.join('');
}

/** 从会话日志里按 `(turn, step)` 取每个 step 的最终 usage，只留今天的。 */
export interface UsageSample extends UsageBuckets {
  session: string;
  time: number;
}

/** 解析一份日志文本，回调每个 usage 样本（后写覆盖同 turn+step）。 */
export function usageSamples(sessionId: string, text: string): Map<string, UsageSample> {
  const out = new Map<string, UsageSample>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== '{') continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type !== 'assistant/message') continue;
    const data = event.data as Record<string, unknown> | undefined;
    const usage = data?.usage as Record<string, unknown> | undefined;
    if (!usage || typeof event.time !== 'number') continue;
    const key = `${String(data?.turn ?? '')}:${String(data?.step ?? '')}`;
    out.set(key, {
      session: sessionId,
      time: Number(event.time),
      input: num(usage.inputTokens),
      output: num(usage.outputTokens),
      cacheRead: num(usage.cacheReadTokens),
      cacheWrite: num(usage.cacheWriteTokens),
    });
  }
  return out;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 递归找全部会话日志。 */
function sessionLogs(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string, depth: number): void => {
    if (depth > 4) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith('.jsonl.zstd')) found.push(full);
    }
  };
  walk(dir, 0);
  return found;
}

/**
 * 今天（本地时区）的用量。
 *
 * 精度口径与 DSH 自己的 `tokenUsage` 投影一致：只算 `assistant/message` 的 usage，
 * 同 `turn+step` 后写覆盖。实测 33 个会话里 31 个与该投影逐字段相等（另两个的差异是
 * compaction 摘要调用，DSH 自己也不计）。
 *
 * 成本：先按文件 mtime 剪掉今天之前没动过的日志，实测约 300 ms。
 */
export function readTodayUsage(
  sessionsDir: string,
  nowMs: number,
  opts: { maxFiles?: number; maxBytes?: number } = {},
): TodayUsageResult {
  const day = localDate(nowMs);
  const start = startOfLocalDay(nowMs);
  const maxFiles = opts.maxFiles ?? 400;
  const maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
  let exists = false;
  try {
    exists = statSync(sessionsDir).isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) return { ok: false, usage: null, reason: `读不到会话日志目录：${sessionsDir}` };
  const logs = sessionLogs(sessionsDir);
  if (!logs.length) return { ok: false, usage: null, reason: `没有找到会话日志：${sessionsDir}` };

  const buckets: UsageBuckets = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let requests = 0;
  let bytes = 0;
  let files = 0;
  const sessions = new Set<string>();
  let firstError: string | undefined;

  for (const file of logs.slice(0, maxFiles)) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    // 剪枝：今天之前就没再写过的日志，不可能含今天的事件
    if (stat.mtimeMs < start) continue;
    if (bytes + stat.size > maxBytes) break;
    let raw: Uint8Array;
    try {
      raw = readFileSync(file);
    } catch {
      continue;
    }
    bytes += stat.size;
    files += 1;
    const sessionId = file.split(/[\\/]/).slice(-2)[0] ?? file;
    let text: string;
    try {
      text = decodeSessionLog(raw);
    } catch (error) {
      firstError = firstError ?? (error instanceof Error ? error.message : String(error));
      continue;
    }
    for (const sample of usageSamples(sessionId, text).values()) {
      if (localDate(sample.time) !== day) continue;
      buckets.input += sample.input;
      buckets.output += sample.output;
      buckets.cacheRead += sample.cacheRead;
      buckets.cacheWrite += sample.cacheWrite;
      requests += 1;
      sessions.add(sample.session);
    }
  }

  if (!files) {
    return { ok: false, usage: null, reason: firstError ?? `${day} 还没有会话日志活动`, scanned: { files, bytes } };
  }
  return {
    ok: true,
    usage: {
      date: day,
      ...buckets,
      requests,
      sessions: sessions.size,
      total: buckets.input + buckets.output + buckets.cacheRead + buckets.cacheWrite,
    },
    scanned: { files, bytes },
  };
}

/** 把 `1234567` 读成 `1.23M`。 */
export function humanTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** 把 `12.34` 读成 `¥12.34`；认不出币种就原样给。 */
export function humanMoney(wallet: Wallet): string {
  const sign = wallet.currency === 'CNY' ? '¥' : wallet.currency === 'USD' ? '$' : '';
  const amount = Number(wallet.balance);
  const shown = Number.isFinite(amount) ? amount.toFixed(2) : wallet.balance;
  return sign ? `${sign}${shown}` : `${shown} ${wallet.currency}`.trim();
}
