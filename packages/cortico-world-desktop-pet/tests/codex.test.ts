import { describe, expect, it } from 'vitest';
import { codexAccountLines, codexLimits, codexMilestoneLine, type CodexView } from '../src/codex.ts';
import { codexText } from '../src/i18n/codex.ts';
import type { CodexSnapshot } from 'cortico-world-codex-monitor';

const now = Date.parse('2026-10-21T08:00:00Z');
const local = (): CodexSnapshot => ({
  home: '/fixture', available: true, sessions: [], usage: { totalTokens: 400, todayTokens: 100, partial: false },
  rateLimits: [], milestones: [], warnings: [],
});

describe('Codex account and reminder presentation', () => {
  it('labels local coverage and account totals separately and preserves an unknown account limit', () => {
    const view: CodexView = { local: local(), account: { stale: true, error: 'codex_unavailable', rateLimits: [], usage: { summary: { lifetimeTokens: 900 }, dailyUsageBuckets: [{ startDate: '2026-10-21', tokens: 200 }] } } };
    const t = codexText('zh').account;
    const lines = codexAccountLines(view, 'zh', String, true, now, 'Asia/Shanghai');
    expect(lines).toContain(t.todayTokens('100'));
    expect(lines).toContain(t.accountTodayTokens('200'));
    expect(lines).toContain(t.accountTokens('900'));
    expect(lines).toContain(t.limitedCoverage);
    expect(lines).toContain(t.missing);
    expect(lines.join('\n')).not.toContain('0%');
  });

  it('keeps the newest quota bucket and marks an expired window stale without resetting it', () => {
    const snapshot = local();
    snapshot.rateLimits.push({ limitId: 'codex', primary: { usedPercent: 81, windowMinutes: 300, resetsAt: now - 1 }, observedAt: now - 1000, source: 'log' });
    const view: CodexView = { local: snapshot, account: { stale: true, rateLimits: [{ limitId: 'codex', primary: { usedPercent: 65 }, observedAt: now - 2000, source: 'app-server' }] } };
    expect(codexLimits(view)[0].primary?.usedPercent).toBe(81);
    const t = codexText('en').account;
    const lines = codexAccountLines(view, 'en', String, true, now, 'UTC');
    expect(lines).toContain(t.quota(`codex · ${t.window(300)}`, 81, 19));
    expect(lines).toContain(t.stale);
    expect(lines.filter(line => line === t.stale)).toHaveLength(1);
  });

  it('distinguishes a completed turn, completed goal, failure and interruption', () => {
    const snapshot = local();
    snapshot.sessions.push({ id: 'task', title: 'fixture task', cwd: '', status: 'idle', updatedAt: now, totalTokens: 0, todayTokens: 0, plan: [] });
    const line = (kind: 'turn_complete' | 'goal_complete' | 'failed' | 'interrupted') => codexMilestoneLine({ id: kind, sessionId: 'task', kind, timestamp: now }, snapshot, 'en');
    expect(new Set([line('turn_complete'), line('goal_complete'), line('failed'), line('interrupted')]).size).toBe(4);
    expect(line('turn_complete')).toContain('turn');
    expect(line('failed')).not.toBe(line('turn_complete'));
  });
});
