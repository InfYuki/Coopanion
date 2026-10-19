/**
 * 关键节点判定：比较前后两份会话快照，得出桌宠该弹气泡的节点（`Milestone`）与任务完成汇报（`Completion`）。
 *
 * 纯计算：不生成文案、不读文件、不碰定时器。`detectMilestones()` 返回新的 state，不改传入的 state。
 * 首次见到的会话只记基线，否则进程刚起来就会把旧账重念一遍。
 */
import type { SessionSnapshot } from './dsh-source.ts';
import { isRunning, isSettled, sumTokens } from './dsh-source.ts';

export type MilestoneKind = 'subagent-done' | 'turn-done' | 'todo-done' | 'goal-phase';

export interface Milestone {
  /** 去重键：同一件事只报一次。 */
  key: string;
  kind: MilestoneKind;
  sessionId: string;
  /** 会话显示名（标题优先，空则 id 前 8 位）。 */
  session: string;
  data: Record<string, unknown>;
}

export interface Completion {
  key: string;
  sessionId: string;
  session: string;
  /** 一轮做完了（turns 增长且已结算）。 */
  turns: number;
  /** 该会话累计 token（四项之和）。 */
  tokens: number;
  /** 目标是否走到 complete。 */
  goalCompleted: boolean;
  /** 目标原文（没有目标时为空串）。 */
  objective: string;
  data: Record<string, unknown>;
}

export interface MilestoneState {
  /** 已报过的 key → 时刻。 */
  reported: Record<string, number>;
  /** 上一轮看到的 turns。 */
  lastTurns: Record<string, number>;
  /** 上一轮看到的「已完成待办数」。 */
  lastTodos: Record<string, number>;
  /** 上一轮看到的 goal.phase。 */
  lastGoalPhase: Record<string, string>;
  /** 上一轮看到「已结算」的会话。 */
  lastSettled: Record<string, boolean>;
}

export function emptyMilestoneState(): MilestoneState {
  return { reported: {}, lastTurns: {}, lastTodos: {}, lastGoalPhase: {}, lastSettled: {} };
}

export interface DetectOptions {
  nowMs: number;
  /** 会话安静多久算「停了」，默认 90_000。 */
  idleMs?: number;
  /** 同一个 key 最短重复间隔，默认 30 * 60_000。 */
  repeatAfterMs?: number;
}

export interface DetectResult {
  state: MilestoneState;
  /** 关键节点：该弹提醒气泡。按发生顺序。 */
  milestones: Milestone[];
  /** 任务完成：该弹简洁汇报。 */
  completions: Completion[];
}

/** 会话安静多久算「停了」。 */
const DEFAULT_IDLE_MS = 90_000;

/** 同一个 key 最短重复间隔。 */
const DEFAULT_REPEAT_AFTER_MS = 30 * 60_000;

/** `reported` 最多留这么多条，按时刻取最近的。 */
const KEEP_REPORTED = 500;

/** 会话显示名：标题优先，空则 id 前 8 位。（与 monitor.ts 的 labelOf 同义，但单独导出，避免耦合） */
export function sessionLabel(s: SessionSnapshot): string {
  const title = s.title.trim();
  return title ? title.slice(0, 60) : s.id.slice(0, 8);
}

export function detectMilestones(
  sessions: readonly SessionSnapshot[],
  state: MilestoneState,
  opts: DetectOptions,
): DetectResult {
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const repeatAfterMs = opts.repeatAfterMs ?? DEFAULT_REPEAT_AFTER_MS;
  const now = opts.nowMs;

  const reported: Record<string, number> = { ...state.reported };
  const lastTurns: Record<string, number> = { ...state.lastTurns };
  const lastTodos: Record<string, number> = { ...state.lastTodos };
  const lastGoalPhase: Record<string, string> = { ...state.lastGoalPhase };
  const lastSettled: Record<string, boolean> = { ...state.lastSettled };

  const milestones: Milestone[] = [];
  const completions: Completion[] = [];

  // 子代理身份只在父会话的 catalog 里，而父会话可能已经结束、不在这一轮的列表里，
  // 所以先跨全部会话收集 childId → label；查不到 label 的会话按普通会话处理。
  const childLabels = new Map<string, string>();
  for (const s of sessions) {
    for (const sub of s.subagents) {
      const known = childLabels.get(sub.childId);
      if (known === undefined || (known === '' && sub.label !== '')) childLabels.set(sub.childId, sub.label);
    }
  }

  /** 抢占一个 key：repeatAfterMs 内已被报过就返回 false。 */
  const claim = (key: string): boolean => {
    const last = reported[key];
    if (last !== undefined && now - last < repeatAfterMs) return false;
    reported[key] = now;
    return true;
  };

  /** 已结算：两条判据都要——投影里的 openStep/openTurnStartSeq 已归位，且文件确实安静下来了。 */
  const settledOf = (s: SessionSnapshot): boolean =>
    !isRunning(s) && isSettled(s) && now - s.mtimeMs >= idleMs;

  for (const s of sessions) {
    const label = sessionLabel(s);
    const tokens = sumTokens(s.tokenTotals);
    const turns = s.stats.turns;
    const settled = settledOf(s);
    const completedTodos = s.todos.filter((t) => t.status === 'completed').length;

    const prevTurns = lastTurns[s.id];
    const prevTodos = lastTodos[s.id];
    const prevPhase = lastGoalPhase[s.id];
    const prevSettled = lastSettled[s.id];
    const seenBefore = prevTurns !== undefined || prevTodos !== undefined
      || prevPhase !== undefined || prevSettled !== undefined;
    const isChild = childLabels.has(s.id);
    const goal = s.goal;

    // ---- 子代理完成 / 会话做完一轮 ----
    let turnDone = false;
    if (settled && isChild) {
      // 没有 lastSettled 记录也算：子代理可能在两次采样之间整段跑完
      if (prevSettled !== true && turns > 0) {
        const key = `subagent:${s.id}:turn${turns}`;
        if (claim(key)) {
          milestones.push({
            key,
            kind: 'subagent-done',
            sessionId: s.id,
            session: label,
            data: { label: childLabels.get(s.id) ?? '', turns, tokens },
          });
        }
      }
    } else if (settled && prevTurns !== undefined && turns > prevTurns) {
      turnDone = true;
      const key = `turn:${s.id}:turn${turns}`;
      if (claim(key)) {
        milestones.push({
          key,
          kind: 'turn-done',
          sessionId: s.id,
          session: label,
          data: { turns, tokens, steps: s.stats.steps },
        });
      }
    }

    // ---- 待办完成数增加 ----
    if (prevTodos !== undefined && completedTodos > prevTodos) {
      let latest = '';
      for (const t of s.todos) if (t.status === 'completed') latest = t.content;
      const key = `todo:${s.id}:${completedTodos}`;
      if (claim(key)) {
        milestones.push({
          key,
          kind: 'todo-done',
          sessionId: s.id,
          session: label,
          data: { completed: completedTodos, total: s.todos.length, latest },
        });
      }
    }

    // ---- 目标 phase 变化 ----
    let goalJustCompleted = false;
    if (goal) {
      if (seenBefore && prevPhase !== goal.phase) {
        goalJustCompleted = prevPhase !== undefined && prevPhase !== 'complete' && goal.phase === 'complete';
        const key = `goal:${s.id}:${goal.id}:${goal.phase}`;
        if (claim(key)) {
          milestones.push({
            key,
            kind: 'goal-phase',
            sessionId: s.id,
            session: label,
            data: { from: prevPhase ?? '', to: goal.phase, objective: goal.objective },
          });
        }
      }
      lastGoalPhase[s.id] = goal.phase;
    }

    // ---- 任务完成：目标刚走到 complete，或做完一轮且没有未完成的目标 ----
    const goalCompleted = goal?.phase === 'complete';
    if (goalJustCompleted || (turnDone && (goal === null || goalCompleted))) {
      const key = `done:${s.id}:${turns}`;
      if (claim(key)) {
        completions.push({
          key,
          sessionId: s.id,
          session: label,
          turns,
          tokens,
          goalCompleted,
          objective: goal?.objective ?? '',
          data: { goalId: goal?.id ?? null, goalPhase: goal?.phase ?? null, steps: s.stats.steps },
        });
      }
    }

    // 基线无条件更新：去重只决定报不报，不决定「上一轮看到过什么」
    lastTurns[s.id] = turns;
    lastTodos[s.id] = completedTodos;
    lastSettled[s.id] = settled;
  }

  const kept = Object.entries(reported).sort((a, b) => b[1] - a[1]).slice(0, KEEP_REPORTED);

  return {
    state: {
      reported: Object.fromEntries(kept),
      lastTurns,
      lastTodos,
      lastGoalPhase,
      lastSettled,
    },
    milestones,
    completions,
  };
}
