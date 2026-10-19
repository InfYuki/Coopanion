/**
 * DSH 的只读数据源：读 `~/.dsh/storages/session_projcache/sessions/*.json`。
 *
 * 每个文件是一个会话的投影缓存（`{ version, record: { rows: { <key>: { ver, seq, val } } } }`），
 * 本模块只做三件事：找到文件、解析出需要的行、归一成一个稳定的快照结构。
 * 不写任何文件，不依赖 Cortico——World 层与测试都只通过这里取数。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 投影缓存里本模块用到的行，别的行一律忽略。 */
const ROWS = {
  title: 'title',
  tokenUsage: 'tokenUsage',
  sessionStats: 'sessionStats',
  contextPressure: 'contextPressure',
  goal: 'goal',
  todos: 'todos',
  subagentCatalog: 'subagentCatalog',
  subagentTiming: 'subagentTiming',
  modelSelection: 'modelSelection',
  turnOutline: 'turnOutline',
  turnBoundary: 'turnBoundary',
  sessionListMetadata: 'sessionListMetadata',
} as const;

/** 一个会话的 token 账本；字段名照搬 DSH 的 `tokenUsage.totals`。 */
export interface TokenTotals {
  uncachedInputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** 上下文占用：DSH 自己的 surfaceTokens 与窗口大小的比值口径。 */
export interface ContextPressure {
  surfaceTokens: number;
  contextWindow: number;
  pressureTokens: number;
}

/** `goal.current.goal` 的形状；`phase` 是 DSH 的目标状态机（active / complete / blocked）。 */
export interface GoalInfo {
  id: string;
  revision: number;
  objective: string;
  phase: string;
  maxGoalRounds?: number;
  roundsStarted?: number;
}

/** 一条 todo（DSH 的 todos 行是数组）。 */
export interface TodoInfo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | string;
}

/** 子代理目录里的一条；`childId` 与它自己的投影文件名（去掉 `.json`）相同。 */
export interface SubagentInfo {
  childId: string;
  label: string;
  childCreatedAt: number;
  mode?: string;
}

/** 一个会话的归一化快照。 */
export interface SessionSnapshot {
  /** 投影缓存文件名去掉 `.json`。 */
  id: string;
  /** 该文件最后一次写盘的毫秒时间戳。 */
  mtimeMs: number;
  title: string;
  tokenTotals: TokenTotals;
  /**
   * 这份投影已应用到的最后一个事件序号。DSH 自己保证单调递增，
   * 因此是比 mtime 更可靠的「新鲜度」依据（同一个文件可能被重复写成同样的 seq）。
   */
  seq: number;
  /** 最后一次采样到的一步账本；没有跑过模型时为 null。 */
  lastStep: { turn: number; step: number; buckets: TokenTotals } | null;
  stats: {
    turns: number;
    steps: number;
    decodeTokens: number;
    llmMs: number;
    toolMs: number;
    /** 有值表示会话正在某一步里，即「在跑」。 */
    openStep: { turn: number; step: number; startTime: number } | null;
  };
  /**
   * 轮次边界：`openTurnStartSeq` 是打开中那轮的起始事件序号，没有打开的轮时为 null。
   * 与 `openStep` 一起给出「在跑 / 已结算」的双重判据。
   */
  turnBoundary: {
    openTurnStartSeq: number | null;
    lastTurn: number;
    lastStepKind: string | null;
  };
  context: ContextPressure;
  goal: GoalInfo | null;
  todos: TodoInfo[];
  subagents: SubagentInfo[];
  model: { provider: string; model: string } | null;
}

/** 读取结果：快照加上读不到的文件的计数，便于向使用者报告「有多少没读到」。 */
export interface ReadResult {
  sessions: SessionSnapshot[];
  /** 解析失败或读不到的文件数。 */
  unreadable: number;
}

/** 家目录兜底：与 account.ts 的 `homedirFallback()` 同一策略（USERPROFILE → HOME → `.`）。 */
function homedirFallback(env: NodeJS.ProcessEnv): string {
  return env.USERPROFILE || env.HOME || '.';
}

/**
 * DSH 把投影缓存放在这里。
 *
 * 与 `account.ts` 的两个目录函数一致：`DSH_HOME` 有值时跟着走，缺失时回退到 `~/.dsh`。
 * 从开始菜单 / 普通 shell 启动的进程没有 `DSH_HOME`，以前这里返回空串，
 * 让 `readSessions('')` 直接给空结果、进度气泡与 `dsh_*` 工具静默失效；现在总有可读的默认路径。
 */
export function defaultCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim();
  return join(home || join(homedirFallback(env), '.dsh'), 'storages', 'session_projcache', 'sessions');
}

/** 数字字段的宽容读取：DSH 的行可能缺字段，缺了算 0。 */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function totals(raw: unknown): TokenTotals {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    uncachedInputTokens: num(r.uncachedInputTokens),
    outputTokens: num(r.outputTokens),
    cacheReadTokens: num(r.cacheReadTokens),
    cacheWriteTokens: num(r.cacheWriteTokens),
  };
}

/** 把一行 `{ ver, seq, val }` 的 `val` 取出来。 */
function val(rows: Record<string, unknown>, key: string): unknown {
  const row = rows[key] as { val?: unknown } | undefined;
  return row?.val;
}

/** 解析一个投影文件；结构不符时返回 null 而不是抛错。 */
export function parseProjection(raw: string): SessionSnapshot | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const rows = (json as { record?: { rows?: Record<string, unknown> } })?.record?.rows;
  if (!rows || typeof rows !== 'object') return null;

  const usage = val(rows, ROWS.tokenUsage) as Record<string, unknown> | undefined;
  const stats = val(rows, ROWS.sessionStats) as Record<string, unknown> | undefined;
  const pressure = val(rows, ROWS.contextPressure) as Record<string, unknown> | undefined;
  const goalRow = val(rows, ROWS.goal) as { current?: { goal?: Record<string, unknown>; roundsStarted?: unknown } } | undefined;
  const goal = goalRow?.current?.goal;
  const subagentRow = val(rows, ROWS.subagentCatalog) as { head?: { values?: unknown[] } } | undefined;
  const model = (val(rows, ROWS.modelSelection) as { lastUsed?: { provider?: unknown; model?: unknown } } | undefined)?.lastUsed;

  const openStep = stats?.openStep as { turn?: unknown; step?: unknown; startTime?: unknown } | null | undefined;
  const lastStep = usage?.last as { turn?: unknown; step?: unknown; buckets?: unknown } | null | undefined;
  const boundary = val(rows, ROWS.turnBoundary) as Record<string, unknown> | undefined;
  const lastStepBoundary = boundary?.lastStepBoundary as Record<string, unknown> | undefined;
  // 行的 seq 是「这份投影应用到的最后一个事件序号」，取几个关键行里最大的那个
  const seq = Math.max(
    num((rows[ROWS.tokenUsage] as { seq?: unknown } | undefined)?.seq),
    num((rows[ROWS.sessionStats] as { seq?: unknown } | undefined)?.seq),
    num((rows[ROWS.turnBoundary] as { seq?: unknown } | undefined)?.seq),
  );

  return {
    id: '',
    mtimeMs: 0,
    title: typeof val(rows, ROWS.title) === 'string' ? (val(rows, ROWS.title) as string) : '',
    seq,
    tokenTotals: totals(usage?.totals),
    lastStep: lastStep && typeof lastStep === 'object'
      ? { turn: num(lastStep.turn), step: num(lastStep.step), buckets: totals(lastStep.buckets) }
      : null,
    stats: {
      turns: num(stats?.turns),
      steps: num(stats?.steps),
      decodeTokens: num(stats?.decodeTokens),
      llmMs: num(stats?.llmMs),
      toolMs: num(stats?.toolMs),
      openStep: openStep && typeof openStep === 'object'
        ? { turn: num(openStep.turn), step: num(openStep.step), startTime: num(openStep.startTime) }
        : null,
    },
    turnBoundary: {
      openTurnStartSeq: typeof boundary?.openTurnStartSeq === 'number' ? boundary.openTurnStartSeq : null,
      lastTurn: num(boundary?.lastTurn),
      lastStepKind: typeof lastStepBoundary?.kind === 'string' ? lastStepBoundary.kind : null,
    },
    context: {
      surfaceTokens: num(pressure?.surfaceTokens),
      contextWindow: num(pressure?.contextWindow),
      pressureTokens: num(pressure?.pressureTokens),
    },
    goal: goal && typeof goal === 'object'
      ? {
        id: String(goal.id ?? ''),
        revision: num(goal.revision),
        objective: String(goal.objective ?? ''),
        phase: String(goal.phase ?? ''),
        maxGoalRounds: typeof goal.maxGoalRounds === 'number' ? goal.maxGoalRounds : undefined,
        roundsStarted: typeof goalRow?.current?.roundsStarted === 'number' ? goalRow.current.roundsStarted : undefined,
      }
      : null,
    todos: Array.isArray(val(rows, ROWS.todos))
      ? (val(rows, ROWS.todos) as unknown[])
        .map((t) => t as Record<string, unknown>)
        .filter((t) => t && typeof t.content === 'string')
        .map((t) => ({ content: String(t.content), status: String(t.status ?? 'pending') }))
      : [],
    subagents: Array.isArray(subagentRow?.head?.values)
      ? (subagentRow.head.values as unknown[])
        .map((s) => s as Record<string, unknown>)
        .filter((s) => s && typeof s.childId === 'string')
        .map((s) => ({
          childId: String(s.childId),
          label: String(s.label ?? ''),
          childCreatedAt: num(s.childCreatedAt),
          mode: typeof s.mode === 'string' ? s.mode : undefined,
        }))
      : [],
    model: model && typeof model === 'object'
      ? { provider: String(model.provider ?? ''), model: String(model.model ?? '') }
      : null,
  };
}

/**
 * 读一个目录下的全部投影缓存。
 * - 文件按 mtime 倒序处理，调用方可以只取前 N 个；
 * - 单个文件坏掉只让 `unreadable` 加一，不影响其余；
 * - 目录不存在（DSH 没装或没跑过）时返回空结果而不是抛错。
 */
export function readSessions(dir: string, opts: { sinceMs?: number } = {}): ReadResult {
  const result: ReadResult = { sessions: [], unreadable: 0 };
  if (!dir) return result;
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return result;
  }
  for (const name of names) {
    const path = join(dir, name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch {
      result.unreadable += 1;
      continue;
    }
    if (opts.sinceMs !== undefined && mtimeMs < opts.sinceMs) continue;
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      result.unreadable += 1;
      continue;
    }
    const parsed = parseProjection(raw);
    if (!parsed) {
      result.unreadable += 1;
      continue;
    }
    parsed.id = name.slice(0, -'.json'.length);
    parsed.mtimeMs = mtimeMs;
    result.sessions.push(parsed);
  }
  result.sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return result;
}

/** 把四个桶加成一个「总计」；报告里最常用的口径。 */
export function sumTokens(t: TokenTotals): number {
  return t.uncachedInputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens;
}

/** 跨会话求和；`sessions` 为空时全为 0。 */
export function aggregate(sessions: readonly SessionSnapshot[]): TokenTotals {
  return sessions.reduce<TokenTotals>(
    (acc, s) => ({
      uncachedInputTokens: acc.uncachedInputTokens + s.tokenTotals.uncachedInputTokens,
      outputTokens: acc.outputTokens + s.tokenTotals.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + s.tokenTotals.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + s.tokenTotals.cacheWriteTokens,
    }),
    { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
}

/** 会话是否「在跑」：有 openStep 且投影文件刚被写过。 */
export function isLive(s: SessionSnapshot, nowMs: number, idleMs: number): boolean {
  return s.stats.openStep !== null && nowMs - s.mtimeMs <= idleMs;
}

/**
 * 更严的「在跑」判据，用会话自己的两份投影交叉验证（两组信号都来自 DSH 的写入节奏，
 * 而不是我们对 mtime 的猜测）：
 * - `sessionStats.openStep`：正在某一步里；
 * - `turnBoundary.openTurnStartSeq`：有一轮尚未收尾。
 * 两者同时成立才算在跑。已结算的会话这三项会一起归位（实测多个会话验证过）。
 */
export function isRunning(s: SessionSnapshot): boolean {
  return s.stats.openStep !== null && s.turnBoundary.openTurnStartSeq !== null;
}

/** 已结算：没有打开的步、没有打开的轮，且最后一步以 end 收尾。 */
export function isSettled(s: SessionSnapshot): boolean {
  return s.stats.openStep === null
    && s.turnBoundary.openTurnStartSeq === null
    && (s.turnBoundary.lastStepKind === null || s.turnBoundary.lastStepKind === 'end');
}
