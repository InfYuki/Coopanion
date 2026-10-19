/**
 * 监控引擎：把「上一轮看到的 DSH 状态」与「这一轮看到的」做差，得出该向使用者汇报什么。
 *
 * 这里不碰 Cortico 也不碰定时器，只做纯计算，因此可以单独测：
 * `evaluate()` 收一份快照集合 + 一份已汇报记录，回一组 `Notice`。
 */
import type { SessionSnapshot, TokenTotals } from './dsh-source.ts';
import { aggregate, isLive, isRunning, isSettled, sumTokens } from './dsh-source.ts';

/** 一条待汇报的事。`key` 用于去重：同一个 key 只汇报一次，除非 `repeatable`。 */
export interface Notice {
  key: string;
  kind: 'task-completed' | 'goal-changed' | 'usage-threshold' | 'usage-spike';
  /** 给模型看的一句话；模型自己组织成 Coo 的语气。 */
  text: string;
  /** 结构化数据，供工具回执与调试。 */
  data: Record<string, unknown>;
}

/** 跨轮次保留的「已经汇报过什么」。 */
export interface MonitorState {
  /** 已汇报的 key → 汇报时刻。 */
  reported: Record<string, number>;
  /** 上次的跨会话 token 合计，用来算增量与尖峰。 */
  lastTotals: TokenTotals | null;
  /** 上次看到每个会话的 turns，用来判断「新开了一轮」。 */
  lastTurns: Record<string, number>;
  /** 已经因为阈值越过而报过的档位（例如 50 / 80 / 100 万）。 */
  crossedThresholds: number[];
  /** 上次评估的时刻。 */
  lastEvaluatedAt: number;
}

export function emptyState(): MonitorState {
  return { reported: {}, lastTotals: null, lastTurns: {}, crossedThresholds: [], lastEvaluatedAt: 0 };
}

/** 已汇报记录最多留这么多条，避免文件无限长。 */
const KEEP_REPORTED = 500;

/** 一个会话多久没写盘就算「停了」。 */
export const DEFAULT_IDLE_MS = 90_000;

export interface EvaluateOptions {
  /** 现在。 */
  nowMs: number;
  /** 超过这个空闲时长就认为任务已停。 */
  idleMs?: number;
  /** token 用量越过这些档位时汇报（单位：token）。空数组表示不报。 */
  thresholds?: number[];
  /** 窗口内只看这些会话；undefined 表示全部。 */
  sessionIds?: readonly string[];
  /** 一条汇报在同一 key 上最短重复间隔，避免抖动刷屏。 */
  repeatAfterMs?: number;
}

/** 人读的 token 数：1234 → 1.2k，1234567 → 1.23M。 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** 会话的显示名：标题优先，其次 id 前 8 位。 */
export function labelOf(s: SessionSnapshot): string {
  const title = s.title.trim();
  return title ? title.slice(0, 60) : s.id.slice(0, 8);
}

/**
 * 比较两份快照，得出该汇报的事。
 * 纯函数：不改 `state`，返回新的 `state` 与 `notices`。
 */
export function evaluate(
  sessions: readonly SessionSnapshot[],
  state: MonitorState,
  opts: EvaluateOptions,
): { state: MonitorState; notices: Notice[] } {
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const repeatAfterMs = opts.repeatAfterMs ?? 30 * 60_000;
  const now = opts.nowMs;
  const pool = opts.sessionIds ? sessions.filter((s) => opts.sessionIds!.includes(s.id)) : sessions;
  const notices: Notice[] = [];

  const reported: Record<string, number> = { ...state.reported };
  const lastTurns: Record<string, number> = { ...state.lastTurns };

  /** 同一个 key 在 repeatAfterMs 内不重复报。 */
  const shouldReport = (key: string): boolean => {
    const last = reported[key];
    if (last === undefined) return true;
    return now - last >= repeatAfterMs;
  };
  const markReported = (key: string): void => { reported[key] = now; };

  // ---- 1. 目标（goal）：phase 从 active 走到别的值 = 目标结束 ----
  for (const s of pool) {
    const goal = s.goal;
    if (!goal?.id) continue;
    const prevKey = `goal:${goal.id}:r${goal.revision}`;
    const finished = goal.phase !== 'active';
    if (finished) {
      const key = `${prevKey}:${goal.phase}`;
      if (shouldReport(key)) {
        markReported(key);
        notices.push({
          key,
          kind: 'goal-changed',
          text: `目标${goal.phase === 'complete' ? '已完成' : `已停在「${goal.phase}」`}：${goal.objective.slice(0, 120)}`,
          data: {
            sessionId: s.id,
            session: labelOf(s),
            goalId: goal.id,
            phase: goal.phase,
            rounds: goal.roundsStarted ?? null,
            maxRounds: goal.maxGoalRounds ?? null,
          },
        });
      }
    }
  }

  // ---- 2. 会话：turns 增加过、并且已经结算 = 这一轮任务结束了 ----
  for (const s of pool) {
    const prevTurns = lastTurns[s.id];
    const turns = s.stats.turns;
    const live = isLive(s, now, idleMs);
    // 两条判据都要：投影里的 openStep/openTurnStartSeq 已归位，且文件确实安静下来了
    const settled = !isRunning(s) && isSettled(s) && now - s.mtimeMs >= idleMs;
    // 只有「之前见过这个会话、且它已经停下来」才判断结束；首次看到不算
    if (settled && prevTurns !== undefined && turns > prevTurns) {
      const key = `session:${s.id}:turn${turns}`;
      if (shouldReport(key)) {
        markReported(key);
        const usage = sumTokens(s.tokenTotals);
        notices.push({
          key,
          kind: 'task-completed',
          text: `会话「${labelOf(s)}」完成了第 ${turns} 轮（累计 ${formatTokens(usage)} tokens）`,
          data: {
            sessionId: s.id,
            session: labelOf(s),
            turns,
            steps: s.stats.steps,
            tokens: s.tokenTotals,
            contextSurface: s.context.surfaceTokens,
            contextWindow: s.context.contextWindow,
          },
        });
      }
    }
    lastTurns[s.id] = turns;
  }

  // ---- 3. token 用量：跨会话合计的档位 ----
  const total = aggregate(pool);
  const totalTokens = sumTokens(total);
  const crossed = new Set(state.crossedThresholds);
  for (const t of opts.thresholds ?? []) {
    if (totalTokens >= t && !crossed.has(t)) {
      const key = `usage:${t}`;
      if (shouldReport(key)) {
        markReported(key);
        crossed.add(t);
        notices.push({
          key,
          kind: 'usage-threshold',
          text: `累计 token 用量越过 ${formatTokens(t)}（现在 ${formatTokens(totalTokens)}）`,
          data: { threshold: t, total: total, totalTokens },
        });
      }
    }
    // 用量掉回档位以下（例如换了目录）时允许下次再报
    if (totalTokens < t) crossed.delete(t);
  }

  // ---- 4. 尖峰：本次评估的增量明显偏大 ----
  const prev = state.lastTotals;
  if (prev) {
    const delta = sumTokens(total) - sumTokens(prev);
    const spike = Math.max(50_000, sumTokens(prev) * 0.25);
    if (delta > spike) {
      const key = `spike:${Math.round(totalTokens / 10_000)}`;
      if (shouldReport(key)) {
        markReported(key);
        notices.push({
          key,
          kind: 'usage-spike',
          text: `这一轮用量冲了一波：新增 ${formatTokens(delta)} tokens`,
          data: { delta, before: prev, after: total },
        });
      }
    }
  }

  // 大字典裁剪：保留最近的 KEEP_REPORTED 条
  const entries = Object.entries(reported).sort((a, b) => b[1] - a[1]).slice(0, KEEP_REPORTED);

  return {
    state: {
      reported: Object.fromEntries(entries),
      lastTotals: total,
      lastTurns,
      crossedThresholds: [...crossed].sort((a, b) => a - b),
      lastEvaluatedAt: now,
    },
    notices,
  };
}

/** 供工具回执用的概览：跨会话合计 + 每个会话一行。 */
export function overview(sessions: readonly SessionSnapshot[], nowMs: number, idleMs = DEFAULT_IDLE_MS): {
  total: TokenTotals;
  totalTokens: number;
  live: number;
  sessions: Array<{ id: string; label: string; live: boolean; turns: number; steps: number; tokens: number; output: number; contextPct: number | null; goal: string | null; mtimeMs: number }>;
} {
  const total = aggregate(sessions);
  return {
    total,
    totalTokens: sumTokens(total),
    live: sessions.filter((s) => isLive(s, nowMs, idleMs)).length,
    sessions: sessions.map((s) => ({
      id: s.id,
      label: labelOf(s),
      live: isLive(s, nowMs, idleMs),
      turns: s.stats.turns,
      steps: s.stats.steps,
      tokens: sumTokens(s.tokenTotals),
      output: s.tokenTotals.outputTokens,
      contextPct: s.context.contextWindow > 0
        ? Math.round((s.context.surfaceTokens / s.context.contextWindow) * 1000) / 10
        : null,
      goal: s.goal?.objective ?? null,
      mtimeMs: s.mtimeMs,
    })),
  };
}
