import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';

interface ProgressDriver {
  tickProgress(): Promise<void>;
  tickCodexProgress(): Promise<void>;
  codexTick: Promise<void> | null;
  busyUntil: number;
}
const driver = (world: DesktopPetWorld) => world as unknown as ProgressDriver;
let root = '';
let rollout = '';
let savedDsh: string | undefined;
let cleanup: Array<() => Promise<void>> = [];
const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pet-codex-'));
  mkdirSync(join(root, 'codex', 'sessions'), { recursive: true });
  mkdirSync(join(root, 'dsh', 'storages', 'session_projcache', 'sessions'), { recursive: true });
  savedDsh = process.env.DSH_HOME;
  process.env.DSH_HOME = join(root, 'dsh');
  rollout = join(root, 'codex', 'sessions', `rollout-${sessionId}.jsonl`);
  writeFileSync(rollout, '');
  append('session_meta', { id: sessionId, cwd: '/fixture' }, Date.now() - 60_000);
});

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  if (savedDsh === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = savedDsh;
  rmSync(root, { recursive: true, force: true });
});

function append(type: string, payload: Record<string, unknown>, at = Date.now() + 1): void {
  appendFileSync(rollout, `${JSON.stringify({ timestamp: new Date(at).toISOString(), type, payload })}\n`);
}
function event(type: string): void { append('event_msg', { type }); }
function plan(status: string): void {
  append('response_item', { type: 'function_call', name: 'update_plan', call_id: `plan-${status}`, arguments: JSON.stringify({ plan: [{ step: 'Inspect input', status }, { step: 'Apply change', status: 'pending' }] }) });
}
async function mounted() {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  cfg.progress.enabled = true;
  cfg.progress.reportCompletion = true;
  cfg.progress.coalesceSeconds = 0;
  cfg.codex = { ...cfg.codex, enabled: true, home: join(root, 'codex'), executable: join(root, 'not-installed.exe') };
  const host = new FakeHost();
  const world = new DesktopPetWorld({ cfg, timezone: 'Asia/Shanghai', persist() {}, runtimesRoot: () => join(root, 'runtimes'), modelsDir: () => join(root, 'models') });
  await world.start(host);
  cleanup.push(() => world.stop());
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  return { world, host, page };
}
async function tick(world: DesktopPetWorld): Promise<void> {
  await driver(world).tickProgress();
  await driver(world).codexTick;
}
const sayText = (message: Record<string, unknown>) => JSON.stringify(message.beats);
async function noSay(page: FakePage): Promise<void> {
  // Let already-written socket frames reach the page before inspecting its inbox.
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(page.messages.filter(message => message.t === 'say')).toEqual([]);
}

describe('Codex progress in the desktop pet', () => {
  it('baselines existing completions and reports new completions with no DSH sessions', async () => {
    append('event_msg', { type: 'task_complete' }, Date.now() - 30_000);
    const { world, page, host } = await mounted();
    await tick(world);
    await noSay(page);
    event('task_started');
    await tick(world);
    await noSay(page);
    event('task_complete');
    await tick(world);
    expect(sayText(await page.next(message => message.t === 'say'))).toContain('本轮已完成');
    await expect.poll(() => host.stored.length).toBe(1);
    expect(host.events).toEqual([]);
    expect(host.stored[0]).toMatchObject({ contextDelivery: 'archive-only' });
    expect(host.stored[0].text).toContain('Codex');
    await tick(world);
    await noSay(page);
  });

  it.each([['task_failed', '任务失败'], ['turn_aborted', '任务已中断']])('reports %s without claiming completion', async (kind, expected) => {
    const { world, page } = await mounted();
    await tick(world);
    event(kind);
    await tick(world);
    const text = sayText(await page.next(message => message.t === 'say'));
    expect(text).toContain(expected);
    expect(text).not.toContain('本轮已完成');
  });

  it('reports a plan step completed while keeping the whole task open', async () => {
    plan('in_progress');
    const { world, page } = await mounted();
    await tick(world);
    await noSay(page);
    plan('completed');
    await tick(world);
    const text = sayText(await page.next(message => message.t === 'say'));
    expect(text).toContain('待办 1/2');
    expect(text).not.toContain('本轮已完成');
  });

  it('retains a completion while busy and emits it when the gate opens', async () => {
    const { world, page } = await mounted();
    await tick(world);
    driver(world).busyUntil = Date.now() + 60_000;
    event('task_complete');
    await driver(world).tickCodexProgress();
    await noSay(page);
    driver(world).busyUntil = 0;
    await tick(world);
    expect(sayText(await page.next(message => message.t === 'say'))).toContain('本轮已完成');
  });

  it('does not publish a completion from a scan racing with stop', async () => {
    const { world, host, page } = await mounted();
    await tick(world);
    event('task_complete');
    const pending = driver(world).tickCodexProgress();
    await world.stop();
    await pending;
    await noSay(page);
    expect(host.stored).toEqual([]);
    expect(host.events).toEqual([]);
  });

  it('opens the full Codex account card and switches to DSH without a bot event', async () => {
    const { page, host } = await mounted();
    page.send({ t: 'account', full: true });
    const card = await page.next(message => message.t === 'dialog');
    expect(card.text).toContain('Codex 账户');
    expect(card.input).toMatchObject({ kind: 'buttons', options: [{ label: 'Codex' }, { label: 'DSH' }] });
    page.send({ t: 'dialog', id: card.id, index: 1 });
    const dsh = await page.next(message => message.t === 'dialog' && message.id !== card.id);
    expect(dsh.text).toContain('账号与余额');
    expect(dsh.text).not.toContain('Codex 账户');
    expect(host.events).toEqual([]);
  });
});
