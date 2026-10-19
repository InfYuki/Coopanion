/** 测试用的事实样本：与 DSH 真实投影缓存同构（字段名照搬，值取真实量级）。 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectionFixture {
  title?: string;
  /** 累计 token。 */
  totals?: { uncachedInputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  turns?: number;
  steps?: number;
  /** 是否正在跑：true 时 openStep 与 openTurnStartSeq 都有值。 */
  running?: boolean;
  openTurnStartSeq?: number | null;
  lastStepKind?: 'start' | 'end' | null;
  seq?: number;
  context?: { surfaceTokens?: number; contextWindow?: number; pressureTokens?: number };
  goal?: { id?: string; revision?: number; objective?: string; phase?: string; maxGoalRounds?: number; roundsStarted?: number } | null;
  todos?: Array<{ content: string; status: string }>;
  subagents?: Array<{ childId: string; label: string; childCreatedAt?: number; mode?: string }>;
  model?: { provider: string; model: string };
}

/** 把样本拼成 DSH 的 `{ version, record: { rows } }` 结构。 */
export function projectionJson(f: ProjectionFixture): string {
  const totals = {
    uncachedInputTokens: f.totals?.uncachedInputTokens ?? 0,
    outputTokens: f.totals?.outputTokens ?? 0,
    cacheReadTokens: f.totals?.cacheReadTokens ?? 0,
    cacheWriteTokens: f.totals?.cacheWriteTokens ?? 0,
  };
  const seq = f.seq ?? 100;
  const running = f.running ?? false;
  const rows: Record<string, unknown> = {
    title: { ver: 1, seq, val: f.title ?? '' },
    tokenUsage: {
      ver: 2,
      seq,
      val: { totals, last: { turn: f.turns ?? 1, step: f.steps ?? 1, buckets: totals } },
    },
    contextPressure: {
      ver: 5,
      seq,
      val: {
        surfaceTokens: f.context?.surfaceTokens ?? 0,
        contextWindow: f.context?.contextWindow ?? 1_000_000,
        pressureTokens: f.context?.pressureTokens ?? 0,
      },
    },
    sessionStats: {
      ver: 1,
      seq,
      val: {
        turns: f.turns ?? 0,
        steps: f.steps ?? 0,
        decodeTokens: totals.outputTokens,
        llmMs: 1000,
        toolMs: 2000,
        openStep: running ? { turn: f.turns ?? 1, step: f.steps ?? 1, startTime: 1 } : null,
      },
    },
    turnBoundary: {
      ver: 2,
      seq,
      val: {
        openTurnStartSeq: f.openTurnStartSeq !== undefined ? f.openTurnStartSeq : (running ? 50 : null),
        lastTurn: f.turns ?? 0,
        lastStepBoundary: { kind: f.lastStepKind ?? (running ? 'start' : 'end'), seq },
      },
    },
  };
  if (f.goal !== null && f.goal !== undefined) {
    rows.goal = {
      ver: 6,
      seq,
      val: { current: { goal: f.goal, roundsStarted: f.goal.roundsStarted ?? 0 }, seenGoalIds: [] },
    };
  } else if (f.goal === null) {
    rows.goal = { ver: 6, seq, val: { current: null, seenGoalIds: [], failure: null } };
  }
  if (f.todos) rows.todos = { ver: 2, seq, val: f.todos };
  if (f.subagents) rows.subagentCatalog = { ver: 3, seq, val: { head: { values: f.subagents } } };
  if (f.model) rows.modelSelection = { ver: 2, seq, val: { lastUsed: f.model, pending: null } };
  return JSON.stringify({ version: 7, record: { identity: { cwd: 'D:\\DSH-personal' }, rows } });
}

/** 在临时目录里放一组投影文件，返回目录路径。 */
export function writeProjections(dir: string, sessions: Record<string, ProjectionFixture>): string {
  mkdirSync(dir, { recursive: true });
  for (const [id, fixture] of Object.entries(sessions)) {
    writeFileSync(join(dir, `${id}.json`), projectionJson(fixture), 'utf8');
  }
  return dir;
}
