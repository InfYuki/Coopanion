import type { ConfigGroup } from 'cortico/core/types.ts';

/** config.json 的 `worlds.dsh-monitor` 段。 */
export interface DshMonitorConfigSection {
  /** 关掉时不投递任何事件，工具仍可回答「现在什么状态」。 */
  enabled: boolean;
  /**
   * DSH 的投影缓存目录；留空时按 `DSH_HOME` 推出默认值。
   * 指向一个不存在的目录不会报错，只是查不到会话。
   */
  cacheDir: string;
  /** 桥接插件发布的账号文件目录；留空时用 `$DSH_HOME/storages/coopanion-bridge`。 */
  bridgeDir: string;
  /** 会话事件日志根目录；留空时用 `$DSH_HOME/sessions`。 */
  sessionsDir: string;
  /** 轮询间隔（秒）。太短会白读盘，太长会发现得慢。 */
  pollSeconds: number;
  /** 会话安静多久算「任务结束」（秒）。 */
  idleSeconds: number;
  /** 任务结束时主动说话。 */
  reportCompleted: boolean;
  /** token 用量越过这些档位时说话；逗号分隔，空串关闭。 */
  thresholds: string;
  /** 一条同样的事最短重复间隔（分钟），防止抖动刷屏。 */
  repeatMinutes: number;
  /** 每次评估最多看多少个最近的会话文件。 */
  maxSessions: number;
  /** 今日用量的缓存时长（秒）：点一次就扫 4~5 MB 日志，短时间重复点不该重扫。 */
  todayCacheSeconds: number;
}

export const DSH_MONITOR_ID = 'dsh-monitor';

export const DSH_MONITOR_DEFAULTS: DshMonitorConfigSection = {
  // 框架惯例：定义里恒为 false，由 Bot 的 declares 或部署决定是否启用（dryMountWorld 会检查这一条）
  enabled: false,
  cacheDir: '',
  bridgeDir: '',
  sessionsDir: '',
  pollSeconds: 20,
  idleSeconds: 90,
  // 进度/完成由桌宠自己弹气泡，这个开关默认关，避免同一件事被说两遍；需要模型旁白时再打开
  reportCompleted: false,
  // 50 万 / 100 万 / 200 万：够用又不至于天天响
  thresholds: '500000, 1000000, 2000000',
  repeatMinutes: 30,
  maxSessions: 40,
  todayCacheSeconds: 30,
};

/** 把逗号分隔的档位解析成数字并排序去重；解析不出的项忽略。 */
export function parseThresholds(raw: string): number[] {
  const out = new Set<number>();
  for (const piece of raw.split(/[,，\s]+/)) {
    const n = Number(piece);
    if (Number.isFinite(n) && n > 0) out.add(Math.round(n));
  }
  return [...out].sort((a, b) => a - b);
}

/** World 配置的 JSON Schema 声明；键是 `worlds.dsh-monitor.*` 的点分路径。 */
export const DSH_MONITOR_CONFIG_GROUP: ConfigGroup = {
  id: 'world:dsh-monitor',
  owner: 'world:dsh-monitor',
  schema: {
    type: 'object',
    title: 'DSH 监控',
    description: '读取 DeepSeek Harness 的会话投影缓存，向 Coo 报告任务进度与 token 用量。只读。',
    properties: {
      'worlds.dsh-monitor.enabled': {
        type: 'boolean',
        title: '启用监控',
        description: '关掉后不再主动汇报；工具仍然可用。',
        'x-hot': true,
      },
      'worlds.dsh-monitor.cacheDir': {
        type: 'string',
        title: '投影缓存目录',
        description: '留空则用 $DSH_HOME/storages/session_projcache/sessions。',
        'x-hot': true,
      },
      'worlds.dsh-monitor.bridgeDir': {
        type: 'string',
        title: '账号桥接目录',
        description: '桥接插件写 account.json 的地方；留空则用 $DSH_HOME/storages/coopanion-bridge。',
        'x-hot': true,
      },
      'worlds.dsh-monitor.sessionsDir': {
        type: 'string',
        title: '会话日志目录',
        description: '今日用量从这里的 session.v4.jsonl.zstd 现算；留空则用 $DSH_HOME/sessions。',
        'x-hot': true,
      },
      'worlds.dsh-monitor.pollSeconds': {
        type: 'number',
        title: '轮询间隔（秒）',
        description: '每多少秒读一次投影缓存。',
        minimum: 5,
        maximum: 600,
        'x-hot': true,
      },
      'worlds.dsh-monitor.idleSeconds': {
        type: 'number',
        title: '判定结束的空闲时长（秒）',
        description: '会话投影文件安静这么久之后，才把这一轮当作结束。',
        minimum: 10,
        maximum: 3600,
        'x-hot': true,
      },
      'worlds.dsh-monitor.reportCompleted': {
        type: 'boolean',
        title: '任务结束时主动汇报',
        description: 'DSH 有会话跑完一轮或目标结束时，让 Coo 主动说话。',
        'x-hot': true,
      },
      'worlds.dsh-monitor.thresholds': {
        type: 'string',
        title: 'token 用量档位',
        description: '逗号分隔的 token 数；越过时说话。留空关闭。',
        'x-hot': true,
      },
      'worlds.dsh-monitor.repeatMinutes': {
        type: 'number',
        title: '同一提醒的最短重复间隔（分钟）',
        minimum: 1,
        maximum: 1440,
        'x-hot': true,
      },
      'worlds.dsh-monitor.maxSessions': {
        type: 'number',
        title: '最多看多少个会话',
        description: '按最近写盘时间取前 N 个。',
        minimum: 1,
        maximum: 500,
        'x-hot': true,
      },
      'worlds.dsh-monitor.todayCacheSeconds': {
        type: 'number',
        title: '今日用量缓存（秒）',
        description: '同一份「今日用量」在这段时间内复用，避免连续点击重复扫日志。',
        minimum: 0,
        maximum: 3600,
        'x-hot': true,
      },
    },
  },
};
