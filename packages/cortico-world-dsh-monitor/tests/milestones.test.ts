import { describe, it, expect } from 'vitest';
import {
  detectMilestones,
  emptyMilestoneState,
  sessionLabel,
} from '../src/milestones.ts';
import type { GoalInfo, SessionSnapshot, SubagentInfo } from '../src/dsh-source.ts';

const T0 = 2_000_000;
const IDLE = 90_000;

interface SnapOver {
  id?: string;
  title?: string;
  mtimeMs?: number;
  turns?: number;
  steps?: number;
  totals?: { input?: number; output?: number; read?: number; write?: number };
  running?: boolean;
  goal?: GoalInfo | null;
  todos?: Array<{ content: string; status: string }>;
  subagents?: SubagentInfo[];
  lastStepKind?: string | null;
}

/** 手写的 SessionSnapshot；默认「已结算、安静了很久」，这样单个字段就能造出目标场景。 */
function snap(over: SnapOver = {}): SessionSnapshot {
  const running = over.running ?? false;
  const turns = over.turns ?? 1;
  const steps = over.steps ?? 1;
  const totals = {
    uncachedInputTokens: over.totals?.input ?? 0,
    outputTokens: over.totals?.output ?? 0,
    cacheReadTokens: over.totals?.read ?? 0,
    cacheWriteTokens: over.totals?.write ?? 0,
  };
  return {
    id: over.id ?? 'sess-1',
    mtimeMs: over.mtimeMs ?? T0 - 10 * 60_000,
    title: over.title ?? '',
    seq: 100,
    tokenTotals: totals,
    lastStep: { turn: turns, step: steps, buckets: totals },
    stats: {
      turns,
      steps,
      decodeTokens: totals.outputTokens,
      llmMs: 1000,
      toolMs: 2000,
      openStep: running ? { turn: turns, step: steps, startTime: 1 } : null,
    },
    turnBoundary: {
      openTurnStartSeq: running ? 50 : null,
      lastTurn: turns,
      lastStepKind: over.lastStepKind !== undefined ? over.lastStepKind : (running ? 'start' : 'end'),
    },
    context: { surfaceTokens: 1000, contextWindow: 1_000_000, pressureTokens: 0 },
    goal: over.goal ?? null,
    todos: over.todos ?? [],
    subagents: over.subagents ?? [],
    model: { provider: 'provider', model: 'model' },
  };
}

describe('会话显示名', () => {
  it('标题优先，空则 id 前 8 位', () => {
    expect(sessionLabel(snap({ title: '  重构认证  ' }))).toBe('重构认证');
    expect(sessionLabel(snap({ id: 'abcdef1234567' }))).toBe('abcdef12');
  });
});

describe('首次见到会话', () => {
  it('只记基线，不产出任何东西', () => {
    const s = snap({
      turns: 4,
      todos: [{ content: '写解析器', status: 'completed' }],
      goal: { id: 'g1', revision: 1, objective: '把手头的活做完', phase: 'active' },
    });
    const { state, milestones, completions } = detectMilestones([s], emptyMilestoneState(), {
      nowMs: T0,
      idleMs: IDLE,
    });
    expect(milestones).toEqual([]);
    expect(completions).toEqual([]);
    expect(state.lastTurns['sess-1']).toBe(4);
    expect(state.lastTodos['sess-1']).toBe(1);
    expect(state.lastGoalPhase['sess-1']).toBe('active');
    expect(state.lastSettled['sess-1']).toBe(true);
    expect(state.reported).toEqual({});
  });
});

describe('子代理完成', () => {
  it('从「在跑」变「已结算」→ 一条 subagent-done，label 来自父会话 catalog', () => {
    const parent = snap({
      id: 'parent-1',
      title: '父会话',
      turns: 1,
      subagents: [{ childId: 'child-1', label: '重构认证模块', childCreatedAt: 1 }],
    });
    const child = snap({
      id: 'child-1',
      turns: 2,
      totals: { input: 100, output: 500, read: 1_000 },
    });
    const state = {
      ...emptyMilestoneState(),
      lastTurns: { 'child-1': 1 },
      lastSettled: { 'child-1': false },
    };
    const { milestones, completions } = detectMilestones([parent, child], state, {
      nowMs: T0,
      idleMs: IDLE,
    });
    expect(milestones).toHaveLength(1);
    const m = milestones[0];
    expect(m.kind).toBe('subagent-done');
    expect(m.sessionId).toBe('child-1');
    expect(m.session).toBe('child-1');
    expect(m.data).toEqual({ label: '重构认证模块', turns: 2, tokens: 1_600 });
    // 子代理自己的完成不弹汇报，汇报归父会话
    expect(completions).toEqual([]);
  });

  it('父会话不在列表里 → 查不到 label，仍按 turn-done 产出', () => {
    const child = snap({ id: 'child-1', turns: 2, totals: { output: 10 } });
    const state = {
      ...emptyMilestoneState(),
      lastTurns: { 'child-1': 1 },
      lastSettled: { 'child-1': false },
    };
    const { milestones, completions } = detectMilestones([child], state, { nowMs: T0, idleMs: IDLE });
    expect(milestones).toHaveLength(1);
    expect(milestones[0].kind).toBe('turn-done');
    expect(milestones[0].data.label ?? '').toBe('');
    expect(milestones[0].data).toEqual({ turns: 2, tokens: 10, steps: 1 });
    expect(completions).toHaveLength(1);
    expect(completions[0].key).toBe('done:child-1:2');
  });
});

describe('一轮做完', () => {
  it('turns 增长且已结算 → turn-done + 一条 completion', () => {
    const s = snap({ turns: 3, steps: 12, totals: { input: 200, output: 300, read: 500 } });
    const state = { ...emptyMilestoneState(), lastTurns: { 'sess-1': 2 } };
    const { milestones, completions } = detectMilestones([s], state, { nowMs: T0, idleMs: IDLE });
    expect(milestones).toHaveLength(1);
    expect(milestones[0].kind).toBe('turn-done');
    expect(milestones[0].data).toEqual({ turns: 3, tokens: 1_000, steps: 12 });
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({
      key: 'done:sess-1:3',
      sessionId: 'sess-1',
      turns: 3,
      tokens: 1_000,
      goalCompleted: false,
      objective: '',
    });
  });

  it('turns 增长但仍「在跑」→ 什么都不产出，基线照旧更新', () => {
    const s = snap({ turns: 3, running: true });
    const state = { ...emptyMilestoneState(), lastTurns: { 'sess-1': 2 } };
    const { state: next, milestones, completions } = detectMilestones([s], state, {
      nowMs: T0,
      idleMs: IDLE,
    });
    expect(milestones).toEqual([]);
    expect(completions).toEqual([]);
    expect(next.lastTurns['sess-1']).toBe(3);
    expect(next.lastSettled['sess-1']).toBe(false);
  });

  it('投影刚写过（还没安静够久）→ 不产出', () => {
    const s = snap({ turns: 3, mtimeMs: T0 - 1_000 });
    const state = { ...emptyMilestoneState(), lastTurns: { 'sess-1': 2 } };
    const { milestones, completions } = detectMilestones([s], state, { nowMs: T0, idleMs: IDLE });
    expect(milestones).toEqual([]);
    expect(completions).toEqual([]);
  });
});

describe('待办完成', () => {
  it('已完成数变多 → 一条 todo-done，带最新完成的那条', () => {
    const s = snap({
      turns: 2,
      todos: [
        { content: '写解析器', status: 'completed' },
        { content: '写测试', status: 'completed' },
        { content: '接线', status: 'pending' },
      ],
    });
    const state = {
      ...emptyMilestoneState(),
      lastTurns: { 'sess-1': 2 },
      lastTodos: { 'sess-1': 1 },
    };
    const { milestones, completions } = detectMilestones([s], state, { nowMs: T0, idleMs: IDLE });
    expect(milestones).toHaveLength(1);
    expect(milestones[0].kind).toBe('todo-done');
    expect(milestones[0].data).toEqual({ completed: 2, total: 3, latest: '写测试' });
    expect(completions).toEqual([]);
  });
});

describe('目标状态变化', () => {
  it('active 变 complete → goal-phase + completion（goalCompleted: true）', () => {
    const s = snap({
      turns: 3,
      title: '部署脚本',
      goal: { id: 'g1', revision: 2, objective: '把两个扩展做完', phase: 'complete' },
    });
    const state = {
      ...emptyMilestoneState(),
      lastTurns: { 'sess-1': 3 },
      lastGoalPhase: { 'sess-1': 'active' },
    };
    const { milestones, completions } = detectMilestones([s], state, { nowMs: T0, idleMs: IDLE });
    expect(milestones).toHaveLength(1);
    expect(milestones[0].kind).toBe('goal-phase');
    expect(milestones[0].data).toEqual({ from: 'active', to: 'complete', objective: '把两个扩展做完' });
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({
      key: 'done:sess-1:3',
      session: '部署脚本',
      turns: 3,
      goalCompleted: true,
      objective: '把两个扩展做完',
    });
  });

  it('之前没有目标，这一轮出现了 → goal-phase 的 from 为空串', () => {
    const s = snap({
      turns: 2,
      goal: { id: 'g2', revision: 1, objective: '新目标', phase: 'active' },
    });
    const state = {
      ...emptyMilestoneState(),
      lastTurns: { 'sess-1': 2 },
      lastTodos: { 'sess-1': 0 },
    };
    const { milestones } = detectMilestones([s], state, { nowMs: T0, idleMs: IDLE });
    const goal = milestones.find((m) => m.kind === 'goal-phase');
    expect(goal?.data).toEqual({ from: '', to: 'active', objective: '新目标' });
  });
});

describe('去重与纯函数', () => {
  it('同一个 key 在 repeatAfterMs 内不重复产出', () => {
    const sessions = [snap({ turns: 3 })];
    const state = { ...emptyMilestoneState(), lastTurns: { 'sess-1': 2 } };

    const first = detectMilestones(sessions, state, { nowMs: T0, idleMs: IDLE });
    expect(first.milestones).toHaveLength(1);
    expect(first.completions).toHaveLength(1);

    const replay = { ...emptyMilestoneState(), lastTurns: { 'sess-1': 2 }, reported: { ...first.state.reported } };
    const second = detectMilestones(sessions, replay, { nowMs: T0 + 60_000, idleMs: IDLE });
    expect(second.milestones).toEqual([]);
    expect(second.completions).toEqual([]);

    // 超过重复间隔后允许再报
    const later = detectMilestones(sessions, replay, { nowMs: T0 + 31 * 60_000, idleMs: IDLE });
    expect(later.milestones).toHaveLength(1);
    expect(later.completions).toHaveLength(1);
  });

  it('reported 只留最近 500 条', () => {
    const reported: Record<string, number> = {};
    for (let i = 0; i < 600; i += 1) reported[`old:${i}`] = i;
    const state = { ...emptyMilestoneState(), reported };
    const { state: next } = detectMilestones([], state, { nowMs: T0, idleMs: IDLE });
    const kept = Object.keys(next.reported);
    expect(kept).toHaveLength(500);
    expect(next.reported['old:599']).toBe(599);
    expect(next.reported['old:0']).toBeUndefined();
  });

  it('目标刚 complete 且这一轮也做完 → 该会话只有一条 completion', () => {
    const s = snap({
      turns: 4,
      goal: { id: 'g1', revision: 2, objective: '把扩展做完', phase: 'complete' },
    });
    const state = {
      ...emptyMilestoneState(),
      lastTurns: { 'sess-1': 3 },
      lastGoalPhase: { 'sess-1': 'active' },
    };
    const { milestones, completions } = detectMilestones([s], state, { nowMs: T0, idleMs: IDLE });
    expect(milestones.map((m) => m.kind)).toEqual(['turn-done', 'goal-phase']);
    expect(completions).toHaveLength(1);
    expect(completions[0].goalCompleted).toBe(true);
  });

  it('返回的 state 是新的，原 state 没被改', () => {
    const before = {
      ...emptyMilestoneState(),
      reported: { 'old:key': 1 },
      lastTurns: { 'sess-1': 2, 'other-1': 7 },
      lastTodos: { 'other-1': 0 },
      lastGoalPhase: { 'other-1': 'active' },
      lastSettled: { 'other-1': true },
    };
    const frozen = structuredClone(before);
    const { state: next } = detectMilestones([snap({ turns: 3 })], before, { nowMs: T0, idleMs: IDLE });
    expect(before).toEqual(frozen);
    expect(next).not.toBe(before);
    expect(next.lastTurns).not.toBe(before.lastTurns);
    expect(next.lastTodos).not.toBe(before.lastTodos);
    expect(next.lastGoalPhase).not.toBe(before.lastGoalPhase);
    expect(next.lastSettled).not.toBe(before.lastSettled);
    expect(next.reported).not.toBe(before.reported);
    expect(next.lastTurns['sess-1']).toBe(3);
  });
});
