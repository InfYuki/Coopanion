/** 包入口：默认导出 `WorldDefinition`，加载器按 `cortico.kind === 'world'` 认它。 */
import { DSH_MONITOR } from './definition.ts';

export default DSH_MONITOR;
export { DSH_MONITOR };
export type { DshMonitorConfigSection } from './config.ts';
export { DSH_MONITOR_CONFIG_GROUP, DSH_MONITOR_DEFAULTS, DSH_MONITOR_ID, parseThresholds } from './config.ts';
export { DshMonitorWorld } from './world.ts';
export { readSessions, parseProjection, aggregate, sumTokens, isLive, isRunning, isSettled, defaultCacheDir } from './dsh-source.ts';
export { evaluate, emptyState, overview, formatTokens } from './monitor.ts';
export { detectMilestones, emptyMilestoneState, sessionLabel } from './milestones.ts';
export {
  readAccount,
  readTodayUsage,
  defaultBridgeDir,
  defaultSessionsDir,
  splitZstdFrames,
  decodeSessionLog,
  usageSamples,
  startOfLocalDay,
  localDate,
  humanTokens,
  humanMoney,
} from './account.ts';
export type { SessionSnapshot, TokenTotals, GoalInfo, SubagentInfo } from './dsh-source.ts';
export type { MonitorState, Notice } from './monitor.ts';
export type { Milestone, MilestoneKind, MilestoneState, Completion, DetectOptions, DetectResult } from './milestones.ts';
export type { AccountSnapshot, Wallet, TodayUsageResult, DayUsage, UsageBuckets } from './account.ts';
