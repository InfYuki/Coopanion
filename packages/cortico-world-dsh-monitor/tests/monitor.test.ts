import { describe, it, expect } from 'vitest';
import { emptyState, evaluate, formatTokens, overview } from '../src/monitor.ts';
import { parseProjection } from '../src/dsh-source.ts';
import { projectionJson } from './helpers/fixtures.ts';
import type { SessionSnapshot } from '../src/dsh-source.ts';

/** 造一个快照；默认「已结算」。 */
function snap(over: Parameters<typeof projectionJson>[0], opts: { id?: string; mtimeMs?: number } = {}): SessionSnapshot {
  const parsed = parseProjection(projectionJson(over))!;
  parsed.id = opts.id ?? 'sess-1';
  parsed.mtimeMs = opts.mtimeMs ?? 1_000_000;
  return parsed;
}

const T0 = 2_000_000;
const IDLE = 90_000;

describe('token 用量格式化', () => {
  it('按量级给人读的数', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1_500)).toBe('1.5k');
    expect(formatTokens(1_500_000)).toBe('1.50M');
  });
});

describe('任务完成判定', () => {
  it('首次看到会话不报完成（只建基线）', () => {
    const sessions = [snap({ turns: 3, totals: { outputTokens: 100 } }, { mtimeMs: T0 - 10 * 60_000 })];
    const { notices, state } = evaluate(sessions, emptyState(), { nowMs: T0, idleMs: IDLE });
    expect(notices).toEqual([]);
    expect(state.lastTurns['sess-1']).toBe(3);
  });

  it('轮数增加且会话已结算 → 报一条 task-completed', () => {
    const state = { ...emptyState(), lastTurns: { 'sess-1': 2 } };
    const sessions = [snap({ turns: 3, totals: { outputTokens: 500 } }, { mtimeMs: T0 - 10 * 60_000 })];
    const { notices } = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE });
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe('task-completed');
    expect(notices[0].text).toContain('第 3 轮');
  });

  it('会话还在跑（openStep 有值）时不报完成', () => {
    const state = { ...emptyState(), lastTurns: { 'sess-1': 2 } };
    const sessions = [snap({ turns: 3, running: true, openTurnStartSeq: 900 }, { mtimeMs: T0 - 10 * 60_000 })];
    const { notices } = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE });
    expect(notices).toEqual([]);
  });

  it('投影刚写过（还没安静够久）时不报完成', () => {
    const state = { ...emptyState(), lastTurns: { 'sess-1': 2 } };
    const sessions = [snap({ turns: 3 }, { mtimeMs: T0 - 1_000 })];
    const { notices } = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE });
    expect(notices).toEqual([]);
  });

  it('同一个 key 在重复间隔内不重复报', () => {
    const state = { ...emptyState(), lastTurns: { 'sess-1': 2 } };
    const sessions = [snap({ turns: 3 }, { mtimeMs: T0 - 10 * 60_000 })];
    const first = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE });
    expect(first.notices).toHaveLength(1);
    const second = evaluate(sessions, first.state, { nowMs: T0 + 60_000, idleMs: IDLE, repeatAfterMs: 30 * 60_000 });
    expect(second.notices).toEqual([]);
  });
});

describe('目标结束判定', () => {
  it('phase 从 active 变成 complete → 报一条 goal-changed', () => {
    const sessions = [snap({
      goal: { id: 'goal-1', revision: 2, objective: '把两个扩展做完', phase: 'complete', roundsStarted: 4, maxGoalRounds: 40 },
      turns: 5,
    })];
    const state = { ...emptyState(), lastTurns: { 'sess-1': 5 } };   // 不触发会话完成
    const { notices } = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE });
    const goal = notices.find((n) => n.kind === 'goal-changed');
    expect(goal).toBeDefined();
    expect(goal!.text).toContain('已完成');
  });

  it('phase 仍是 active 时不报', () => {
    const sessions = [snap({ goal: { id: 'goal-1', revision: 1, objective: 'x', phase: 'active' }, turns: 1 })];
    const state = { ...emptyState(), lastTurns: { 'sess-1': 1 } };
    const { notices } = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE });
    expect(notices.filter((n) => n.kind === 'goal-changed')).toEqual([]);
  });
});

describe('token 档位', () => {
  it('越过档位时报一次，并在之后不重复', () => {
    const sessions = [snap({ turns: 1, totals: { uncachedInputTokens: 300_000, outputTokens: 250_000 } })];
    const state = { ...emptyState(), lastTurns: { 'sess-1': 1 } };
    const first = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE, thresholds: [500_000] });
    const threshold = first.notices.find((n) => n.kind === 'usage-threshold');
    expect(threshold).toBeDefined();
    expect(threshold!.text).toContain('500.0k');
    const again = evaluate(sessions, first.state, { nowMs: T0 + 1_000, idleMs: IDLE, thresholds: [500_000] });
    expect(again.notices.filter((n) => n.kind === 'usage-threshold')).toEqual([]);
  });

  it('没到档位不报', () => {
    const sessions = [snap({ turns: 1, totals: { outputTokens: 1_000 } })];
    const state = { ...emptyState(), lastTurns: { 'sess-1': 1 } };
    const { notices } = evaluate(sessions, state, { nowMs: T0, idleMs: IDLE, thresholds: [500_000] });
    expect(notices.filter((n) => n.kind === 'usage-threshold')).toEqual([]);
  });

  it('用量掉回档位以下后允许下次再报', () => {
    const over = [snap({ turns: 1, totals: { outputTokens: 600_000 } })];
    const state = { ...emptyState(), lastTurns: { 'sess-1': 1 } };
    const first = evaluate(over, state, { nowMs: T0, idleMs: IDLE, thresholds: [500_000] });
    expect(first.notices.some((n) => n.kind === 'usage-threshold')).toBe(true);
    // 换成一个很空的会话集合：合计掉回档位以下
    const under = [snap({ turns: 1, totals: { outputTokens: 1 } }, { id: 'sess-2' })];
    const second = evaluate(under, first.state, { nowMs: T0 + 1_000, idleMs: IDLE, thresholds: [500_000] });
    expect(second.state.crossedThresholds).toEqual([]);
  });
});

describe('用量尖峰', () => {
  it('两次采样之间涨得特别多 → 报 spike', () => {
    const state = { ...emptyState(), lastTurns: { 'sess-1': 1 } };
    const before = [snap({ turns: 1, totals: { outputTokens: 100_000 } })];
    const first = evaluate(before, state, { nowMs: T0, idleMs: IDLE });
    const after = [snap({ turns: 1, totals: { outputTokens: 400_000 } })];
    const second = evaluate(after, first.state, { nowMs: T0 + 60_000, idleMs: IDLE });
    expect(second.notices.some((n) => n.kind === 'usage-spike')).toBe(true);
  });
});

describe('概览', () => {
  it('给出在跑数量、逐会话 token 与上下文占比', () => {
    const running = snap({ turns: 2, running: true, totals: { outputTokens: 200 }, context: { surfaceTokens: 50_000, contextWindow: 1_000_000 } }, { id: 'a', mtimeMs: T0 - 1_000 });
    const settled = snap({ turns: 1, totals: { outputTokens: 100 } }, { id: 'b', mtimeMs: T0 - 10 * 60_000 });
    const view = overview([running, settled], T0, IDLE);
    expect(view.live).toBe(1);
    expect(view.totalTokens).toBe(300);
    expect(view.sessions.find((s) => s.id === 'a')!.contextPct).toBe(5);
  });
});
