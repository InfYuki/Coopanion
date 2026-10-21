/**
 * The progress bubble's first look (src/world.ts: `tickProgress`): the sessions DSH had already
 * settled before the pet started are the baseline, not news. Only a settle seen while the pet is
 * running is said.
 *
 * The second block covers the clock itself: `progress.intervalSeconds` is hot, so a new one must
 * reach the interval already running — without a second warmup and without losing the baseline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  cfg.codex.enabled = false;
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
/** One `syncPrefs` as the 150 ms timer runs it (private: the test drives it instead of waiting). */
const syncPrefs = (world: DesktopPetWorld) => (world as unknown as { syncPrefs(): void }).syncPrefs();

/** The World's own fields the clock's assertions need: the two timers and the three a rearm must leave alone. */
interface Clock {
  progressWarmup: unknown;
  progressTimer: unknown;
  progressEveryMs: number;
  progressPrimed: boolean;
  lastProgressAt: number;
  milestoneState: unknown;
}
const clock = (world: DesktopPetWorld) => world as unknown as Clock;

/**
 * A spy on one of the two timer functions, read as the public contract: the callback and the
 * milliseconds the World handed over, and the timer object the real function returned. Node's own
 * properties on that object (`_idleTimeout`, `_onTimeout`) are private and differ across versions,
 * so nothing here reads them.
 */
interface TimerSpy {
  mock: {
    calls: unknown[][];
    results: Array<{ value: unknown }>;
  };
}

interface TimerCall {
  /** The callback the World handed over; the warmup one is the first progress look. */
  fn: () => void;
  /** The milliseconds it was handed: the period a real timer runs at. */
  ms: number | undefined;
  /** What the real timer function returned: identity with `progressWarmup` / `progressTimer`. */
  timer: unknown;
}

/** Everything a spy caught so far, in order. */
function caught(spy: TimerSpy): TimerCall[] {
  const calls = spy.mock.calls as Array<[unknown, number | undefined]>;
  return calls.map((call, i) => ({ fn: call[0] as () => void, ms: call[1], timer: spy.mock.results[i]?.value }));
}

/**
 * The two spies, in place only inside the clock block below. Both pass through: the World builds
 * real timers that really run, as the block above (which waits on them) needs.
 */
let intervalSpy: TimerSpy;
let timeoutSpy: TimerSpy;

/** How long the pending warmup look waits, from the `setTimeout` call `start()` armed it with. */
function warmupDelay(c: Clock): number | undefined {
  return caught(timeoutSpy).find((t) => t.timer === c.progressWarmup)?.ms;
}

/** The period the running interval was built with, from the `setInterval` call that built it. */
function periodOf(c: Clock): number | undefined {
  if (c.progressTimer === null) return undefined;
  return caught(intervalSpy).filter((t) => t.timer === c.progressTimer).at(-1)?.ms;
}

/**
 * The warmup look, without waiting `PROGRESS_WARMUP_MS`: the callback `start()` handed to
 * `setTimeout` is called, which is what "the warmup time is up" means to the World. It builds the
 * interval, which is the only way to reach the state a running pet is in (private: `armProgress`
 * keeps the call to itself).
 */
function warm(c: Clock): void {
  const pending = caught(timeoutSpy).find((t) => t.timer === c.progressWarmup);
  if (!pending) throw new Error('no warmup timer was pending: `start()` armed none');
  pending.fn();
}

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

describe('the progress clock when intervalSeconds changes', () => {
  /**
   * The spies go on first, as they must: `mounted()` builds the World and calls `start()`, whose last
   * act arms the warmup — a spy installed after that would miss the call that matters. Both pass
   * through (`vi.spyOn` keeps the real implementation), so the timers are the real ones; the restore
   * puts the plain functions back for every other file and block, including the real waits above.
   */
  beforeEach(() => {
    intervalSpy = vi.spyOn(globalThis, 'setInterval');
    timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rearms the interval to the new period and leaves the warmup, the baseline and the last bubble alone', async () => {
    history();
    const { world, page } = await mounted();
    const c = clock(world);
    // what `start()` set up: the warmup pending, no interval yet
    expect(warmupDelay(c)).toBe(20_000);
    expect(c.progressTimer).toBeNull();
    expect(c.progressEveryMs).toBe(20_000);

    // the warmup look: it builds the interval at the configured period
    warm(c);
    expect(c.progressWarmup).toBeNull();
    expect(periodOf(c)).toBe(20_000);

    // the first look built the baseline, as a real one does
    await tick(world);
    await new Promise((r) => setTimeout(r, 150));
    expect(c.progressPrimed).toBe(true);
    expect(said(page)).toEqual([]);
    // a sentinel: a bubble said just before the edit, whose coalescing gap must keep counting
    c.lastProgressAt = 1234;
    const baseline = c.milestoneState;

    // the person edits the config; the next look of the sync timer picks it up
    (world as unknown as { cfg: { progress: { intervalSeconds: number } } }).cfg.progress.intervalSeconds = 5;
    syncPrefs(world);

    // the interval now runs at the new period ...
    expect(periodOf(c)).toBe(5_000);
    expect(c.progressEveryMs).toBe(5_000);
    // ... and there is no second warmup: the old one stays null
    expect(c.progressWarmup).toBeNull();
    expect(c.progressPrimed).toBe(true);
    expect(c.lastProgressAt).toBe(1234);
    expect(c.milestoneState).toBe(baseline);

    // a value a hand-edited config.json can hold goes through the same normalization as the start
    (world as unknown as { cfg: { progress: { intervalSeconds: number } } }).cfg.progress.intervalSeconds = 0;
    syncPrefs(world);
    expect(c.progressEveryMs).toBe(20_000);
    expect(periodOf(c)).toBe(20_000);
    expect(c.progressWarmup).toBeNull();

    // an unchanged value does not touch the timer
    const timer = c.progressTimer;
    syncPrefs(world);
    expect(c.progressTimer).toBe(timer);
  });

  it('catches up on an edit that came in before the warmup look', async () => {
    const { world } = await mounted();
    const c = clock(world);
    // no interval to rebuild yet: the warmup took the period it was armed with, so it still builds 20 s
    (world as unknown as { cfg: { progress: { intervalSeconds: number } } }).cfg.progress.intervalSeconds = 5;
    syncPrefs(world);
    warm(c);
    expect(periodOf(c)).toBe(20_000);

    // ... and the next look of the sync timer corrects it, instead of the edit being lost for good
    syncPrefs(world);
    expect(periodOf(c)).toBe(5_000);
    expect(c.progressEveryMs).toBe(5_000);
  });

  it('does not bring the clock back after stop', async () => {
    const { world } = await mounted();
    const c = clock(world);
    warm(c);
    await world.stop();
    expect(c.progressWarmup).toBeNull();
    expect(c.progressTimer).toBeNull();

    // the app still calls `refresh` after a stop; a rearm there would leave a timer ticking on
    (world as unknown as { cfg: { progress: { intervalSeconds: number } } }).cfg.progress.intervalSeconds = 7;
    world.refresh();
    expect(c.progressWarmup).toBeNull();
    expect(c.progressTimer).toBeNull();
  });
});
