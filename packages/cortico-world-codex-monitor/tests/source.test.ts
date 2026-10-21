import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, appendFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { CodexSource } from '../src/source.ts';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const homes: string[] = [];
const NOW = Date.parse('2026-10-21T03:00:00Z');
const SESSION_ID = '00000000-0000-0000-0000-000000000001';
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'session-monitor-'));
  homes.push(home);
  const directory = join(home, 'sessions', '2026', '10', '21');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'rollout-00000000-0000-0000-0000-000000000001.jsonl');
  const source = new CodexSource({ home, timezone: 'Asia/Shanghai' });
  return { home, directory, path, source };
}
function event(type: string, payload: object, timestamp = NOW) { return JSON.stringify({ timestamp: new Date(timestamp).toISOString(), type, payload }) + '\n'; }
function msg(type: string, timestamp = NOW) { return event('event_msg', { type }, timestamp); }
function usage(total: number, timestamp: number, extra = {}) {
  return event('event_msg', { type: 'token_count', info: { total_token_usage: { total_tokens: total }, last_token_usage: { total_tokens: 10 } }, ...extra }, timestamp);
}
afterEach(async () => { await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true }))); });

describe('local rollout monitoring', () => {
  it('establishes a baseline and settles only explicit turns without inferring a completed goal', async () => {
    const { path, source } = await fixture();
    await writeFile(path, msg('task_started', NOW - 1000));
    const initial = await source.scan(NOW);
    expect(initial.sessions[0].status).toBe('running');
    expect(initial.milestones).toEqual([]);
    expect((await source.scan(NOW + 500000)).sessions[0].status).toBe('running');
    await appendFile(path, msg('task_complete', NOW + 500001));
    const settled = await source.scan(NOW + 500002);
    expect(settled.sessions[0].status).toBe('idle');
    expect(settled.milestones.map(item => item.kind)).toEqual(['turn_complete']);
    expect((await source.scan(NOW + 500003)).milestones).toEqual([]);
  });

  it('deduplicates cumulative usage records and attributes UTC timestamps to the configured local day', async () => {
    const { path, source } = await fixture();
    const yesterday = Date.parse('2026-10-20T15:59:00Z');
    const today = Date.parse('2026-10-20T16:01:00Z');
    await writeFile(path, usage(100, yesterday) + event('token_usage_record', { thread_token_usage: { total_tokens: 130 }, usage: { total_tokens: 30 } }, today) + usage(130, today));
    const scan = await source.scan(NOW);
    expect(scan.usage).toEqual({ totalTokens: 130, todayTokens: 30, partial: false });
    expect((await source.scan(NOW + 86400000)).usage.todayTokens).toBe(0);
  });

  it('keeps quota buckets independently with snapshot age and reset timestamps', async () => {
    const { path, source } = await fixture();
    const rate = (limit_id: string, used_percent: number) => ({ rate_limits: { limit_id, primary: { used_percent, window_minutes: 300, resets_at: 2000000000 } } });
    await writeFile(path, usage(1, NOW - 2, rate('shared', 10)) + usage(2, NOW - 1, rate('other', 20)) + usage(3, NOW, rate('shared', 30)));
    const scan = await source.scan(NOW);
    expect(scan.rateLimits).toHaveLength(2);
    expect(scan.rateLimits.find(rate => rate.limitId === 'shared')).toMatchObject({ primary: { usedPercent: 30, resetsAt: 2000000000000 }, observedAt: NOW, source: 'log' });
  });

  it('ignores old history in newly discovered files while reporting events since monitoring started', async () => {
    const { directory, source } = await fixture();
    await source.scan(NOW);
    await writeFile(join(directory, 'old.jsonl'), msg('task_complete', NOW - 1000));
    await writeFile(join(directory, 'new.jsonl'), msg('task_complete', NOW + 1000));
    const scan = await source.scan(NOW + 2000);
    expect(scan.milestones).toHaveLength(1);
    expect(scan.milestones[0].sessionId).toBe('new');
  });

  it('preserves incomplete lines across scans, handles malformed records and file truncation', async () => {
    const { path, source } = await fixture();
    await writeFile(path, msg('task_started'));
    await source.scan(NOW);
    const complete = msg('task_complete', NOW + 1000);
    await appendFile(path, complete.slice(0, -2));
    expect((await source.scan(NOW + 1000)).milestones).toEqual([]);
    await appendFile(path, complete.slice(-2) + 'broken-json\n');
    const scan = await source.scan(NOW + 2000);
    expect(scan.milestones.map(item => item.kind)).toEqual(['turn_complete']);
    expect(scan.usage.partial).toBe(true);
    await writeFile(path, msg('turn_aborted', NOW + 3000));
    expect((await source.scan(NOW + 4000)).sessions[0].status).toBe('interrupted');
  });

  it('reports plan milestones, approval and subagent completion from structured records', async () => {
    const { path, source } = await fixture();
    const meta = event('session_meta', { id: SESSION_ID, source: { subagent: { thread_spawn: { parent_thread_id: 'parent', agent_path: '/root/task' } } } });
    await writeFile(path, meta + msg('task_started'));
    await source.scan(NOW);
    const plan = (status: string, timestamp: number) => event('response_item', { type: 'function_call', name: 'functions.update_plan', call_id: status, arguments: JSON.stringify({ plan: [{ step: 'Verify', status }] }) }, timestamp);
    await appendFile(path, plan('in_progress', NOW + 1) + plan('completed', NOW + 2) + event('response_item', { type: 'function_call', name: 'functions.exec_command', call_id: 'approve', arguments: JSON.stringify({ sandbox_permissions: 'require_escalated' }) }, NOW + 3));
    const waiting = await source.scan(NOW + 4);
    expect(waiting.sessions[0]).toMatchObject({ id: SESSION_ID, parentId: 'parent', status: 'waiting_approval' });
    expect(waiting.milestones.map(item => item.kind)).toEqual(['plan_updated', 'step_complete', 'approval']);
    await appendFile(path, event('response_item', { type: 'function_call_output', call_id: 'approve', output: '{}' }, NOW + 5) + msg('task_complete', NOW + 6));
    expect((await source.scan(NOW + 7)).milestones[0].kind).toBe('agent_complete');
  });

  it('reads titles and explicit goal transitions from read-only SQLite metadata', async () => {
    const { home, path, source } = await fixture();
    const state = new DatabaseSync(join(home, 'state_5.sqlite'));
    state.exec('CREATE TABLE threads(id TEXT,title TEXT,cwd TEXT,agent_path TEXT)');
    state.prepare('INSERT INTO threads VALUES(?,?,?,?)').run(SESSION_ID, 'Example task', '/workspace', null);
    state.close();
    const goals = new DatabaseSync(join(home, 'goals_1.sqlite'));
    goals.exec('CREATE TABLE thread_goals(thread_id TEXT,goal_id TEXT,status TEXT,tokens_used INTEGER,token_budget INTEGER,updated_at_ms INTEGER)');
    try {
    goals.prepare('INSERT INTO thread_goals VALUES(?,?,?,?,?,?)').run(SESSION_ID, 'goal', 'active', 1, 100, NOW);
    await writeFile(path, event('session_meta', { id: SESSION_ID }) + msg('task_started'));
    expect((await source.scan(NOW)).sessions[0]).toMatchObject({ title: 'Example task', goal: { status: 'active' } });
    goals.prepare('UPDATE thread_goals SET status=?, updated_at_ms=?').run('blocked', NOW + 1000);
    const blocked = await source.scan(NOW + 1001);
    expect(blocked.sessions[0].status).toBe('blocked');
    expect(blocked.milestones[0].kind).toBe('blocked');
    goals.prepare('UPDATE thread_goals SET status=?, updated_at_ms=?').run('complete', NOW + 2000);
    const complete = await source.scan(NOW + 2001);
    expect(complete.sessions[0].status).toBe('completed');
    expect(complete.milestones[0].kind).toBe('goal_complete');
    expect((await source.scan(NOW + 2002)).milestones).toEqual([]);
    await appendFile(path, msg('task_started', NOW + 3000));
    expect((await source.scan(NOW + 3001)).sessions[0].status).toBe('running');
    } finally { goals.close(); }
  });

  it('bounds file selection and first reads and declares incomplete usage coverage', async () => {
    const { home, path, directory } = await fixture();
    await writeFile(path, event('response_item', { type: 'message', body: 'x'.repeat(10000) }) + usage(200, NOW));
    await writeFile(join(directory, 'other.jsonl'), msg('task_started'));
    const source = new CodexSource({ home, maxFiles: 1, maxReadBytes: 512 });
    const scan = await source.scan(NOW);
    expect(scan.sessions).toHaveLength(1);
    expect(scan.usage.partial).toBe(true);
  });

  it('keeps the child identity and excludes inherited fork history from its usage and milestones', async () => {
    const { path, source } = await fixture();
    await source.scan(NOW);
    const line = (type: string, payload: object, ordinal: number) => JSON.stringify({ timestamp: new Date(NOW + ordinal).toISOString(), ordinal, type, payload }) + '\n';
    await writeFile(path,
      line('session_meta', { id: '00000000-0000-0000-0000-000000000001', forked_from_id: 'parent', parent_thread_id: 'parent', subagent_history_start_ordinal: 3 }, 0) +
      line('session_meta', { id: 'parent' }, 1) +
      line('event_msg', { type: 'token_count', info: { total_token_usage: { total_tokens: 9000 } } }, 2) +
      line('event_msg', { type: 'task_complete' }, 3) +
      line('token_usage_record', { thread_id: '00000000-0000-0000-0000-000000000001', thread_token_usage: { total_tokens: 50 }, usage: { total_tokens: 50 } }, 4) +
      line('event_msg', { type: 'task_complete' }, 5));
    const scan = await source.scan(NOW + 100);
    expect(scan.sessions[0]).toMatchObject({ id: '00000000-0000-0000-0000-000000000001', parentId: 'parent', totalTokens: 50 });
    expect(scan.milestones.map(item => item.kind)).toEqual(['agent_complete']);
  });

  it('accumulates usage after counter resets and marks the discontinuous coverage', async () => {
    const { path, source } = await fixture();
    await writeFile(path, usage(1000, NOW));
    await source.scan(NOW);
    await appendFile(path, usage(100, NOW + 1) + usage(200, NOW + 2));
    const scan = await source.scan(NOW + 3);
    expect(scan.usage.totalTokens).toBe(1110);
    expect(scan.usage.partial).toBe(true);
  });

  it('discards counters and quota from a replaced rollout inode', async () => {
    const { path, source } = await fixture();
    await writeFile(path, usage(10000, NOW, { rate_limits: { limit_id: 'shared', primary: { used_percent: 40 } } }));
    expect((await source.scan(NOW)).rateLimits).toHaveLength(1);
    await rename(path, path + '.old');
    await writeFile(path, usage(5, NOW + 1));
    const scan = await source.scan(NOW + 2);
    expect(scan.usage.totalTokens).toBe(5);
    expect(scan.rateLimits).toEqual([]);
  });

  it('rejects quota percentages outside their valid range and incomplete credit flags', async () => {
    const { path, source } = await fixture();
    await writeFile(path, usage(1, NOW, { rate_limits: { primary: { used_percent: 130 }, secondary: { used_percent: -5 }, credits: { balance: '0' } } }));
    const scan = await source.scan(NOW);
    expect(scan.rateLimits[0]).toMatchObject({ primary: undefined, secondary: undefined, credits: undefined });
  });

  it('reads owning fork metadata before a bounded tail and excludes inherited records there', async () => {
    const { path, home } = await fixture();
    const line = (payload: object, ordinal: number, type = 'event_msg') => JSON.stringify({ timestamp: new Date(NOW).toISOString(), type, ordinal, payload }) + '\n';
    await writeFile(path,
      line({ id: SESSION_ID, forked_from_id: 'parent', parent_thread_id: 'parent', subagent_history_start_ordinal: 100 }, 0, 'session_meta') +
      event('response_item', { type: 'message', body: 'x'.repeat(10000) }) +
      line({ type: 'token_count', info: { total_token_usage: { total_tokens: 9000 } } }, 90) +
      line({ type: 'task_complete' }, 91) +
      line({ thread_id: SESSION_ID, thread_token_usage: { total_tokens: 50 }, usage: { total_tokens: 50 } }, 101, 'token_usage_record') +
      line({ type: 'task_complete' }, 102));
    const scan = await new CodexSource({ home, maxReadBytes: 1024 }).scan(NOW);
    expect(scan.sessions[0]).toMatchObject({ id: SESSION_ID, parentId: 'parent', totalTokens: 50 });
    expect(scan.usage.partial).toBe(true);
  });

  it('marks failed session-directory discovery as unavailable and incomplete', async () => {
    const { home } = await fixture();
    await rm(join(home, 'sessions'), { recursive: true });
    await writeFile(join(home, 'sessions'), 'not a directory');
    const scan = await new CodexSource({ home }).scan(NOW);
    expect(scan.available).toBe(false);
    expect(scan.usage.partial).toBe(true);
    expect(scan.warnings).toContain('session_directory_unreadable');
  });

  it('preserves rollout tokens and reports unavailable goal metadata on each scan', async () => {
    const { home, path, source } = await fixture();
    await writeFile(path, usage(15, NOW));
    await writeFile(join(home, 'goals_1.sqlite'), 'invalid sqlite');
    for (let index = 0; index < 2; index++) {
      const scan = await source.scan(NOW + index);
      expect(scan.usage.totalTokens).toBe(15);
      expect(scan.warnings).toContain('metadata_unavailable');
    }
  });
});
