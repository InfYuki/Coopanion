import { join } from 'node:path';
import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { DSH_MONITOR_DEFAULTS, DSH_MONITOR_ID, type DshMonitorConfigSection } from './config.ts';
import {
  DSH_MONITOR_TOOL_DECLS,
  DshMonitorWorld,
  EVENT_GOAL_SETTLED,
  EVENT_TASK_COMPLETED,
  EVENT_USAGE_SPIKE,
  EVENT_USAGE_THRESHOLD,
} from './world.ts';

/** 每次前缀重建都会读的提示词模板；`promptDocs` 与 `describe.json` 指向同一份文件。 */
export const DSH_MONITOR: WorldDefinition<DshMonitorConfigSection> = {
  id: DSH_MONITOR_ID,
  label: 'DSH 监控',
  defaults: () => ({ ...DSH_MONITOR_DEFAULTS }),
  create: (ctx) => new DshMonitorWorld({
    cfg: ctx.cfg,
    timezone: ctx.timezone,
    persist: (patch) => ctx.persist(patch),
    stateFile: join(ctx.dataDir, 'monitor-state.json'),
  }),
  describe: {
    tools: describeTools(DSH_MONITOR_TOOL_DECLS, {
      dsh_status: {
        zh: '报告 DeepSeek Harness 此刻在做什么:哪些会话在跑、token 合计、当前目标。',
        en: 'Reports what DeepSeek Harness is doing right now: running sessions, token totals, the current goal.',
      },
      dsh_usage: {
        zh: '报告 DeepSeek Harness 的 token 用量,可分总会话或逐会话,输入/输出/缓存分列。',
        en: 'Reports token usage from DeepSeek Harness, in total or per session, with input, output and cache split out.',
      },
      dsh_tasks: {
        zh: '列出在跑或刚结束的任务,含目标与待办进度。',
        en: 'Lists running and recently finished tasks with their goals and todo progress.',
      },
      dsh_balance: {
        zh: '报告今天的 token 用量与账号余额(余额由 DSH 侧桥接插件提供)。',
        en: "Reports today's token usage and the signed-in account's balance, when the DSH account bridge has published it.",
      },
    }),
    events: [
      {
        type: EVENT_TASK_COMPLETED,
        description: { zh: 'DSH 的一个会话做完了一轮(投影文件安静下来且轮数增加)。', en: 'A DeepSeek Harness session finished a turn: its projection went quiet after the turn count grew.' },
        trigger: 'preempt',
      },
      {
        type: EVENT_GOAL_SETTLED,
        description: { zh: 'DSH 的一个目标离开了活跃状态(完成、阻塞或换新)。', en: 'A DeepSeek Harness goal left the active phase: completed, blocked or replaced.' },
        trigger: 'preempt',
      },
      {
        type: EVENT_USAGE_THRESHOLD,
        description: { zh: '累计 token 用量越过了配置里的一个档位。', en: 'Cumulative token usage crossed one of the configured thresholds.' },
        trigger: 'flush',
      },
      {
        type: EVENT_USAGE_SPIKE,
        description: { zh: '两次采样之间 token 用量涨得异常快。', en: 'Token usage grew unusually fast between two samples.' },
        trigger: 'flush',
      },
    ],
  },
};
