/**
 * The progress bubble's first look (src/world.ts: `tickProgress`): the sessions DSH had already
 * settled before the pet started are the baseline, not news. Only a settle seen while the pet is
 * running is said.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';

/** One child's settled / running state, in the shape DSH writes a session projection (dsh-source.ts). */
interface Projection {
  title: string;
  turns: number;
  /** Running: `openStep` and `openTurnStartSeq` both set, the two signals `isRunning` wants. */
  running?: boolean;
  /** The parent's subagent catalog: what `detectMilestones` reads a child's label from. */
  subagents?: Array<{ childId: string; label: string }>;
}

function projectionJson(f: Projection): string {
  const running = f.running ?? false;
  const seq = 100;
  const totals = { uncachedInputTokens: 0, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const rows: Record<string, unknown> = {
    title: { ver: 1, seq, val: f.title },
    tokenUsage: { ver: 2, seq, val: { totals, last: { turn: f.turns, step: 1, buckets: totals } } },
    sessionStats: {
      ver: 1, seq,
      val: { turns: f.turns, steps: 1, openStep: running ? { turn: f.turns, step: 1, startTime: 1 } : null },
    },
    turnBoundary: {
      ver: 2, seq,
      val: { openTurnStartSeq: running ? 50 : null, lastTurn: f.turns, lastStepBoundary: { kind: running ? 'start' : 'end', seq } },
    },
  };
  if (f.subagents) rows.subagentCatalog = { ver: 3, seq, val: { head: { values: f.subagents } } };
  return JSON.stringify({ version: 7, record: { rows } });
}

const LABEL = '列 packages 包清单';

let home = '';
let sessionsDir = '';
let savedHome: string | undefined;
let cleanup: Array<() => Promise<void>> = [];

beforeEach(() => {
  savedHome = process.env.DSH_HOME;
  home = mkdtempSync(join(tmpdir(), 'pet-dsh-home-'));
  sessionsDir = join(home, 'storages', 'session_projcache', 'sessions');
  mkdirSync(sessionsDir, { recursive: true });
  process.env.DSH_HOME = home;
});

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
  if (savedHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
});

/** Writes one session's projection; `quiet` puts its mtime long enough back to count as settled. */
function write(id: string, f: Projection, quiet = true): void {
  const path = join(sessionsDir, `${id}.json`);
  writeFileSync(path, projectionJson(f), 'utf8');
  if (quiet) {
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(path, old, old);
  }
}

/** The two sessions of the fixture: a parent that already finished, and a child it catalogued as settled. */
function history(): void {
  write('parent1', { title: '父会话', turns: 3, subagents: [{ childId: 'child1', label: LABEL }] });
  write('child1', { title: '修集成问题并端到端验证', turns: 2 });
}

/** A pet over that history, with a pet page open so `tickProgress`'s gate lets the look through. */
async function mounted(): Promise<{ world: DesktopPetWorld; page: FakePage }> {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  const dir = mkdtempSync(join(tmpdir(), 'pet-'));
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai',
    persist: () => {},
    runtimesRoot: () => join(dir, 'runtimes'),
    modelsDir: () => join(dir, 'models'),
  });
  await world.start(new FakeHost());
  cleanup.push(() => world.stop());
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  return { world, page };
}

/** One look at the cache, as the timer does it (private: the test drives it instead of waiting PROGRESS_WARMUP_MS). */
const tick = (world: DesktopPetWorld) => (world as unknown as { tickProgress(): Promise<void> }).tickProgress();
const said = (page: FakePage) => page.messages.filter((m) => m.t === 'say');

describe('the progress bubble of a fresh start', () => {
  it('says nothing on the first look, then reports a child that runs and settles while the pet is up', async () => {
    history();
    const { world, page } = await mounted();

    // first look: the baseline only, even though the cache is full of settled sessions
    await tick(world);
    await new Promise((r) => setTimeout(r, 150));
    expect(said(page)).toEqual([]);
    // the fix's signature: the baseline was built and the look returned before saying anything
    expect((world as unknown as { milestoneState: { lastSettled: Record<string, boolean> } }).milestoneState.lastSettled)
      .toMatchObject({ child1: true, parent1: true });

    // second look: still nothing — the history has not moved
    await tick(world);
    await new Promise((r) => setTimeout(r, 150));
    expect(said(page)).toEqual([]);

    // a real subagent: running while it works, then settled a turn later
    write('child1', { title: '修集成问题并端到端验证', turns: 3, running: true }, false);
    await tick(world);
    await new Promise((r) => setTimeout(r, 150));
    expect(said(page)).toEqual([]);

    write('child1', { title: '修集成问题并端到端验证', turns: 3 });
    await tick(world);
    // one say, carrying the label the parent's catalog gives the child
    const say = await page.next((m) => m.t === 'say');
    expect(JSON.stringify(say.beats)).toContain(`子代理「${LABEL}」做完了子任务`);
    // and it is the only one: the page hands a message over once
    await new Promise((r) => setTimeout(r, 150));
    expect(said(page)).toEqual([]);
  });
});
