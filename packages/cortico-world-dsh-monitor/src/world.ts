/** DSH 监控 World：轮询 DSH 的会话投影缓存，把任务完成与 token 用量推给 Coo。只读，不改 DSH 的任何东西。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDef, World, WorldHost, WorldWebUiDecl } from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { DSH_MONITOR_CONFIG_GROUP, DSH_MONITOR_ID, parseThresholds, type DshMonitorConfigSection } from './config.ts';
import {
  defaultBridgeDir,
  defaultSessionsDir,
  humanMoney,
  humanTokens,
  readAccount,
  readTodayUsage,
  type AccountSnapshot,
  type TodayUsageResult,
} from './account.ts';
import { defaultCacheDir, readSessions, sumTokens, type SessionSnapshot } from './dsh-source.ts';
import { emptyState, evaluate, formatTokens, labelOf, overview, type MonitorState, type Notice } from './monitor.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

/** World 使用的工具声明；定义里的 describe 与 `tools()` 取同一份。 */
export const DSH_MONITOR_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'dsh_status',
    description:
      'Report what DeepSeek Harness is doing right now: which sessions are running, the token totals across them, and the current goal. Read-only.',
    tags: ['read', 'snapshot'],
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'dsh_usage',
    description:
      'Report token usage from DeepSeek Harness, in total or per session. Input, output and cache-read tokens are reported separately.',
    tags: ['read', 'snapshot'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scope: {
          type: 'string',
          enum: ['total', 'sessions'],
          description: 'total: one line for everything. sessions: one line per session.',
        },
        sinceMinutes: {
          type: 'number',
          description: 'Only sessions whose projection was written within this many minutes. Omit for all.',
        },
      },
    },
  },
  {
    name: 'dsh_tasks',
    description:
      'List the DeepSeek Harness tasks that are running or just finished, with their goals and todo progress.',
    tags: ['read', 'snapshot'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        includeIdle: {
          type: 'boolean',
          description: 'Also list sessions that are not running right now. Defaults to false.',
        },
      },
    },
  },
  {
    name: 'dsh_balance',
    description:
      "Report today's token usage (bucketed) and, when the account bridge has published it, the signed-in DeepSeek account's balance.",
    tags: ['read', 'snapshot'],
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
];

/** 事件类型；与 describe.json 一致。 */
export const EVENT_TASK_COMPLETED = 'dsh.task.completed';
export const EVENT_GOAL_SETTLED = 'dsh.goal.settled';
export const EVENT_USAGE_THRESHOLD = 'dsh.usage.threshold';
export const EVENT_USAGE_SPIKE = 'dsh.usage.spike';

/** 这些事件要抢在一轮之前投递：它们是使用者该立刻知道的结果。 */
const PREEMPT_KINDS = new Set<Notice['kind']>(['task-completed', 'goal-changed']);

export interface DshMonitorWorldOptions {
  /** `worlds.dsh-monitor` 的活引用。 */
  cfg: DshMonitorConfigSection;
  timezone: string;
  /** 读写的持久化补丁；状态存在 World 自己的数据目录里。 */
  persist: (patch: Partial<DshMonitorConfigSection>) => void;
  /** 持久状态文件所在目录。 */
  stateFile: string;
  /** 现在（毫秒）；测试可注入。 */
  now?: () => number;
  /** 读文件的实现；测试可注入。 */
  readState?: (file: string) => MonitorState | null;
  /** 写文件的实现；测试可注入。 */
  writeState?: (file: string, state: MonitorState) => void;
  /** 默认的 DSH 目录解析；测试可注入。 */
  cacheDir?: () => string;
  /** 会话日志根目录解析；测试与宿主可注入。 */
  sessionsDir?: () => string;
  /** 桥接插件产物目录解析；测试与宿主可注入。 */
  bridgeDir?: () => string;
}

/** 一次采样后的结果，工具与事件都用它。 */
interface Sample {
  sessions: SessionSnapshot[];
  unreadable: number;
  dir: string;
  at: number;
}

/** 最近一次采样缓存的时长：工具调用不该每次重新读盘。 */
const SAMPLE_TTL_MS = 2_000;

export class DshMonitorWorld implements World {
  readonly id = DSH_MONITOR_ID;

  private host: WorldHost | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: MonitorState = emptyState();
  private lastNotice: string = '';
  private lastSample: Sample | null = null;
  private today: TodayUsageResult | null = null;
  private todayAt = 0;
  private stopped = false;

  constructor(private readonly opts: DshMonitorWorldOptions) {
    const read = opts.readState ?? DshMonitorWorld.readStateFile;
    this.state = read(opts.stateFile) ?? emptyState();
  }

  /** 环境提示词里的变量：每次前缀重建都重算，所以是「此刻」的事实。 */
  envPromptVars(): Record<string, string> {
    const sample = this.sample();
    const agg = overview(sample.sessions, this.now());
    const running = agg.sessions.filter((s) => s.live);
    const today = this.todayUsage();
    const account = this.account();
    return {
      'dsh.cacheDir': sample.dir || '（未配置，读不到）',
      'dsh.live': String(agg.live),
      'dsh.sessions': String(sample.sessions.length),
      'dsh.inputTokens': formatTokens(agg.total.uncachedInputTokens),
      'dsh.outputTokens': formatTokens(agg.total.outputTokens),
      'dsh.cacheReadTokens': formatTokens(agg.total.cacheReadTokens),
      'dsh.lastActivity': this.lastActivityText(sample),
      'dsh.lastNotice': this.lastNotice || '（还没有）',
      'dsh.runningTitles': running.length
        ? running.map((s) => s.label).slice(0, 5).join('、')
        : '（没有在跑的）',
      'dsh.today': today.ok && today.usage
        ? `输出 ${humanTokens(today.usage.output)}、未缓存输入 ${humanTokens(today.usage.input)}、缓存命中 ${humanTokens(today.usage.cacheRead)}（${today.usage.requests} 次请求 / ${today.usage.sessions} 个会话）`
        : `读不到（${today.reason ?? '未知原因'}）`,
      'dsh.balance': account
        ? (account.status === 'ready'
          ? [...account.wallets, ...account.bonusWallets].map(humanMoney).join(' + ') || '（余额为空）'
          : `未拿到（${account.status}${account.error ? `：${account.error}` : ''}）`)
        : '未拿到（桥接插件还没发布，重启 DSH 后可用）',
    };
  }

  tools(): ToolDef[] {
    const status = DSH_MONITOR_TOOL_DECLS[0];
    const usage = DSH_MONITOR_TOOL_DECLS[1];
    const tasks = DSH_MONITOR_TOOL_DECLS[2];
    const balance = DSH_MONITOR_TOOL_DECLS[3];
    return [
      { ...status, handler: async () => this.reportStatus() },
      {
        ...usage,
        handler: async (args) => {
          const scope = args.scope === 'sessions' ? 'sessions' : 'total';
          const since = typeof args.sinceMinutes === 'number' ? this.now() - args.sinceMinutes * 60_000 : undefined;
          return this.reportUsage(scope, since);
        },
      },
      {
        ...tasks,
        handler: async (args) => this.reportTasks(args.includeIdle === true),
      },
      {
        ...balance,
        handler: async () => this.reportBalance(),
      },
    ];
  }

  webUi(): WorldWebUiDecl {
    return {
      config: [DSH_MONITOR_CONFIG_GROUP],
      promptDocs: [
        {
          key: 'worlds.dsh-monitor.envPrompt',
          title: 'DSH 监控 · 环境提示词',
          description: '告诉 Coo 这个扩展能看到什么、什么时候该说话。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            { name: 'dsh.cacheDir', description: '此刻在用的投影缓存目录。' },
            { name: 'dsh.live', description: '正在跑的会话数。' },
            { name: 'dsh.sessions', description: '可见的会话数。' },
            { name: 'dsh.inputTokens', description: '累计未命中缓存的输入 token。' },
            { name: 'dsh.outputTokens', description: '累计输出 token。' },
            { name: 'dsh.cacheReadTokens', description: '累计缓存命中 token。' },
            { name: 'dsh.lastActivity', description: '最近一次会话写盘距今多久。' },
            { name: 'dsh.lastNotice', description: '上一次汇报给 Coo 的那句话。' },
            { name: 'dsh.runningTitles', description: '正在跑的会话标题,用顿号连接。' },
            { name: 'dsh.today', description: '今天(本地时区)的 token 用量,四项分列。' },
            { name: 'dsh.balance', description: '账号余额与赠金,来自 DSH 侧桥接插件;拿不到时写明原因。' },
          ],
        },
      ],
      lamps: [
        {
          label: 'DSH 会话',
          state: overview(this.sample().sessions, this.now()).live > 0 ? 'online' : 'offline',
          hint: `${overview(this.sample().sessions, this.now()).live} 个会话在跑，共 ${overview(this.sample().sessions, this.now()).sessions.length} 个可见`,
        },
      ],
    };
  }

  /** 挂载：先做一次评估（把长时间没跑时的变化补报出来），再开始轮询。 */
  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.stopped = false;
    await this.tick({ first: true });
    const seconds = Math.max(5, Math.min(600, Number(this.opts.cfg.pollSeconds) || 20));
    this.timer = setInterval(() => { void this.tick({}); }, seconds * 1000);
    // 轮询器不该拖住进程退出
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.host = null;
  }

  /** 一轮采样 + 评估 + 投递。`first` 时只建基线，不投递（避免刚装好就念一堆旧账）。 */
  async tick(opts: { first?: boolean }): Promise<Notice[]> {
    if (this.stopped) return [];
    const sample = this.sample({ fresh: true });
    const idleMs = Math.max(10, Number(this.opts.cfg.idleSeconds) || 90) * 1000;
    const repeatAfterMs = Math.max(1, Number(this.opts.cfg.repeatMinutes) || 30) * 60_000;
    const thresholds = parseThresholds(String(this.opts.cfg.thresholds ?? ''));

    const { state, notices } = evaluate(sample.sessions, this.state, {
      nowMs: sample.at,
      idleMs,
      thresholds,
      repeatAfterMs,
      sessionIds: undefined,
    });
    this.state = state;
    this.save();

    const deliver = notices.filter((n) => {
      if (!this.opts.cfg.enabled) return false;
      if (!this.opts.cfg.reportCompleted && n.kind === 'task-completed') return false;
      return true;
    });
    if (deliver.length) this.lastNotice = deliver[deliver.length - 1].text;
    if (opts.first) return deliver;

    for (const notice of deliver) await this.push(notice);
    return deliver;
  }

  // ---- 下面是对外工具的实现 ----

  private reportStatus(): string {
    const sample = this.sample();
    const agg = overview(sample.sessions, this.now());
    if (!sample.sessions.length) return this.emptyText(sample);
    const lines: string[] = [];
    lines.push(`DSH 现在 ${agg.live} 个会话在跑，共看到 ${agg.sessions.length} 个。`);
    lines.push(`token 合计 ${formatTokens(agg.totalTokens)}（输入 ${formatTokens(agg.total.uncachedInputTokens)}、输出 ${formatTokens(agg.total.outputTokens)}、缓存命中 ${formatTokens(agg.total.cacheReadTokens)}）。`);
    const running = agg.sessions.filter((s) => s.live);
    if (running.length) {
      lines.push('正在跑：');
      for (const s of running.slice(0, 8)) {
        const goal = s.goal ? `，目标：${s.goal.slice(0, 60)}` : '';
        lines.push(`- 「${s.label}」轮到第 ${s.turns} 轮、${s.steps} 步，占上下文 ${s.contextPct ?? '?'}%${goal}`);
      }
    } else {
      lines.push('现在没有会话在跑。');
    }
    if (sample.unreadable) lines.push(`（有 ${sample.unreadable} 个投影文件没读到。）`);
    return lines.join('\n');
  }

  private reportUsage(scope: 'total' | 'sessions', sinceMs?: number): string {
    const sample = this.sample();
    const pool = sinceMs === undefined ? sample.sessions : sample.sessions.filter((s) => s.mtimeMs >= sinceMs);
    if (!pool.length) return this.emptyText(sample);
    const agg = overview(pool, this.now());
    if (scope === 'total') {
      const t = agg.total;
      return [
        `token 总量 ${formatTokens(agg.totalTokens)}（${pool.length} 个会话）：`,
        `- 未命中缓存的输入 ${formatTokens(t.uncachedInputTokens)}`,
        `- 输出 ${formatTokens(t.outputTokens)}`,
        `- 缓存命中 ${formatTokens(t.cacheReadTokens)}`,
        `- 缓存写入 ${formatTokens(t.cacheWriteTokens)}`,
      ].join('\n');
    }
    const rows = agg.sessions
      .slice()
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 20)
      .map((s) => `- 「${s.label}」${formatTokens(s.tokens)}（输出 ${formatTokens(s.output)}，${s.turns} 轮）`);
    return [`共 ${pool.length} 个会话，token 合计 ${formatTokens(agg.totalTokens)}：`, ...rows].join('\n');
  }

  private reportTasks(includeIdle: boolean): string {    const sample = this.sample();
    const agg = overview(sample.sessions, this.now());
    const picked = includeIdle ? agg.sessions : agg.sessions.filter((s) => s.live);
    if (!picked.length) return this.emptyText(sample);
    const lines: string[] = [];
    for (const row of picked.slice(0, 12)) {
      const snapshot = sample.sessions.find((s) => s.id === row.id);
      const state = row.live ? '在跑' : '已停';
      lines.push(`- [${state}]「${row.label}」${row.turns} 轮 / ${row.steps} 步，${formatTokens(row.tokens)} tokens`);
      if (snapshot?.goal) {
        const rounds = snapshot.goal.roundsStarted !== undefined && snapshot.goal.maxGoalRounds !== undefined
          ? `（${snapshot.goal.roundsStarted}/${snapshot.goal.maxGoalRounds} 轮）`
          : '';
        lines.push(`  目标[${snapshot.goal.phase}]${rounds}：${snapshot.goal.objective.slice(0, 100)}`);
      }
      if (snapshot?.todos.length) {
        const done = snapshot.todos.filter((t) => t.status === 'completed').length;
        const current = snapshot.todos.find((t) => t.status === 'in_progress');
        lines.push(`  待办 ${done}/${snapshot.todos.length}${current ? `，正在做：${current.content.slice(0, 50)}` : ''}`);
      }
      if (snapshot?.subagents.length) {
        lines.push(`  子代理 ${snapshot.subagents.length} 个：${snapshot.subagents.map((a) => a.label).join('、').slice(0, 80)}`);
      }
    }
    return lines.join('\n');
  }

  /** 今日用量 + 余额合成的一句话；工具的完整回执也走这里。 */
  private reportBalance(): string {
    const today = this.todayUsage();
    const account = this.account();
    const lines: string[] = [];
    if (today.ok && today.usage) {
      const u = today.usage;
      lines.push(`${u.date}（今天）用量：`);
      lines.push(`- 输出 ${humanTokens(u.output)}`);
      lines.push(`- 未命中缓存的输入 ${humanTokens(u.input)}`);
      lines.push(`- 缓存命中 ${humanTokens(u.cacheRead)}`);
      if (u.cacheWrite) lines.push(`- 缓存写入 ${humanTokens(u.cacheWrite)}`);
      lines.push(`- 合计 ${humanTokens(u.total)}，${u.requests} 次请求 / ${u.sessions} 个会话`);
    } else {
      lines.push(`今天用量读不到：${today.reason ?? '未知原因'}`);
    }
    lines.push('');
    if (!account) {
      lines.push('账号余额未拿到：DSH 侧的账号桥接插件还没有发布数据（装好后需要重启 DSH）。');
    } else if (account.status === 'ready') {
      const name = account.profile?.name ? `（${account.profile.name}）` : '';
      lines.push(`账号余额${name}：`);
      if (account.wallets.length) for (const w of account.wallets) lines.push(`- 充值余额 ${humanMoney(w)}`);
      else lines.push('- 充值余额 0');
      if (account.bonusWallets.length) for (const w of account.bonusWallets) lines.push(`- 赠金 ${humanMoney(w)}`);
      const age = Math.max(0, Math.round((this.now() - account.at) / 60_000));
      lines.push(`（${age} 分钟前从 DSH 读到）`);
    } else if (account.status === 'signed-out') {
      lines.push('账号余额未拿到：DSH 里没有登录的 DeepSeek 账号。');
    } else if (account.status === 'failed') {
      lines.push('账号余额未拿到：Platform 拒绝或超时（DSH 不会伪造成 0）。');
    } else {
      lines.push(`账号余额未拿到：${account.error ?? account.status}`);
    }
    return lines.join('\n');
  }

  /** 今日用量（带缓存，默认 30 秒）；扫日志约 300~500 ms，连点不该重扫。 */
  private todayUsage(): TodayUsageResult {
    const at = this.now();
    const ttl = Math.max(0, Number(this.opts.cfg.todayCacheSeconds) || 30) * 1000;
    if (this.today && at - this.todayAt < ttl) return this.today;
    const dir = String(this.opts.cfg.sessionsDir ?? '').trim() || this.sessionsDir();
    const result = readTodayUsage(dir, at);
    this.today = result;
    this.todayAt = at;
    return result;
  }

  /** 账号快照；桥接插件没装就返回 null，调用方照实说。 */
  private account(): AccountSnapshot | null {
    const dir = String(this.opts.cfg.bridgeDir ?? '').trim() || this.bridgeDir();
    return readAccount(dir);
  }

  private sessionsDir(): string {
    return this.opts.sessionsDir ? this.opts.sessionsDir() : defaultSessionsDir();
  }

  private bridgeDir(): string {
    return this.opts.bridgeDir ? this.opts.bridgeDir() : defaultBridgeDir();
  }

  // ---- 内部 ----

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private dir(): string {
    const configured = String(this.opts.cfg.cacheDir ?? '').trim();
    if (configured) return configured;
    if (this.opts.cacheDir) return this.opts.cacheDir();
    return defaultCacheDir();
  }

  /** 读一次投影缓存，带很短的缓存，避免一轮里被工具与提示词重复读。 */
  private sample(opts: { fresh?: boolean } = {}): Sample {
    const at = this.now();
    if (!opts.fresh && this.lastSample && at - this.lastSample.at < SAMPLE_TTL_MS) return this.lastSample;
    const dir = this.dir();
    const maxSessions = Math.max(1, Number(this.opts.cfg.maxSessions) || 40);
    const read = readSessions(dir);
    const sessions = read.sessions.slice(0, maxSessions);
    this.lastSample = { sessions, unreadable: read.unreadable, dir, at };
    return this.lastSample;
  }

  private lastActivityText(sample: Sample): string {
    if (!sample.sessions.length) return '（还没有看到会话）';
    const newest = sample.sessions[0];
    const age = this.now() - newest.mtimeMs;
    const minutes = Math.max(0, Math.round(age / 60_000));
    return minutes < 1 ? `刚刚（「${labelOf(newest)}」）` : `${minutes} 分钟前（「${labelOf(newest)}」）`;
  }

  private emptyText(sample: Sample): string {
    const where = sample.dir || '（未配置）';
    return `读不到 DSH 的会话：${where}。可能 DSH 没装、还没跑过会话，或者配置里的目录不对。`;
  }

  /** 把一条提醒变成 DSH 侧能看见的事件，推给 Coo。 */
  private async push(notice: Notice): Promise<void> {
    if (!this.host) return;
    const trigger = PREEMPT_KINDS.has(notice.kind) ? 'preempt' : 'flush';
    await this.host.pushEvent(
      {
        type: notice.kind === 'task-completed' ? EVENT_TASK_COMPLETED
          : notice.kind === 'goal-changed' ? EVENT_GOAL_SETTLED
            : notice.kind === 'usage-threshold' ? EVENT_USAGE_THRESHOLD
              : EVENT_USAGE_SPIKE,
        ts: nowIso(this.opts.timezone),
        source: this.id,
        origin: 'internal',
        senderKey: this.id,
        text: notice.text,
        meta: notice.data,
        tags: notice.kind === 'task-completed' || notice.kind === 'goal-changed' ? ['snapshot'] : undefined,
      },
      { trigger },
    );
  }

  private save(): void {
    try {
      if (this.opts.writeState) {
        this.opts.writeState(this.opts.stateFile, this.state);
        return;
      }
      mkdirSync(dirname(this.opts.stateFile), { recursive: true });
      writeFileSync(this.opts.stateFile, JSON.stringify(this.state), 'utf8');
    } catch {
      // 存不下就下轮再试；状态丢了最多重复报一次
    }
  }

  /** 读持久状态；文件不存在或坏掉一律当空状态，不影响挂载。 */
  private static readStateFile(file: string): MonitorState | null {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<MonitorState>;
      return {
        reported: parsed.reported && typeof parsed.reported === 'object' ? parsed.reported : {},
        lastTotals: parsed.lastTotals ?? null,
        lastTurns: parsed.lastTurns && typeof parsed.lastTurns === 'object' ? parsed.lastTurns : {},
        crossedThresholds: Array.isArray(parsed.crossedThresholds) ? parsed.crossedThresholds : [],
        lastEvaluatedAt: typeof parsed.lastEvaluatedAt === 'number' ? parsed.lastEvaluatedAt : 0,
      };
    } catch {
      return null;
    }
  }
}
