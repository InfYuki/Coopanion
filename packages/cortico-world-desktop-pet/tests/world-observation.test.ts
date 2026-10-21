import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import type { ToolOutcome } from 'cortico/core/types.ts';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import { DESKTOP_PET } from '../src/definition.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { ScriptedModel, startBot } from './helpers/harness.ts';

const image = jpeg.encode({ width: 1, height: 1, data: Buffer.from([100, 120, 140, 255]) }, 50).data;
const shot = (): ToolOutcome => ({ text: 'fixture screen', blobs: [{ bytes: image, mime: 'image/jpeg', fallbackText: 'fixture' }] });
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

interface Driver { observeScreen(signal: AbortSignal): Promise<void>; busyUntil: number; petHidden: boolean }
const driver = (world: DesktopPetWorld) => world as unknown as Driver;

async function mounted(capture?: (signal: AbortSignal) => Promise<ToolOutcome>) {
  const root = mkdtempSync(join(tmpdir(), 'pet-observation-'));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  cfg.codex.enabled = false;
  let captures = 0;
  let paused = false;
  const host = new FakeHost();
  host.modelFacts.accepts = () => true;
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: () => {},
    runtimesRoot: () => join(root, 'runtime'), modelsDir: () => join(root, 'models'),
    controls: { isPaused: () => paused },
    captureObservation: async signal => { captures++; return capture ? capture(signal) : shot(); },
  });
  await world.start(host);
  cleanup.push(() => world.stop());
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  return { world, cfg, host, page, captures: () => captures, pause: () => { paused = true; } };
}

describe('scheduled screen observations', () => {
  it('starts disabled, and enabling it delivers a stored JPEG event without adding input tools', async () => {
    const { world, cfg, host, captures } = await mounted();
    await driver(world).observeScreen(new AbortController().signal);
    expect(captures()).toBe(0);
    cfg.observation.enabled = true;
    await driver(world).observeScreen(new AbortController().signal);
    expect(captures()).toBe(1);
    expect(host.events).toHaveLength(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.observation', contextDelivery: 'deliver' });
    expect(host.pushOpts[0]?.trigger).toBe('flush');
    const blob = host.events[0].blobs![0];
    expect(host.blob(blob.handle)?.bytes).toEqual(image);
    expect(cfg.cua.enabled).toBe(false);
    expect(world.tools().some(tool => tool.name === 'pet_cua_click')).toBe(false);
  });

  it.each(['busy', 'hidden', 'paused', 'vision', 'invalid'] as const)('does not capture while %s', async reason => {
    const { world, cfg, host, captures, pause } = await mounted();
    cfg.observation.enabled = true;
    if (reason === 'busy') driver(world).busyUntil = Date.now() + 60_000;
    if (reason === 'hidden') driver(world).petHidden = true;
    if (reason === 'paused') pause();
    if (reason === 'vision') host.modelFacts.accepts = () => false;
    if (reason === 'invalid') cfg.observation.minIntervalSeconds = cfg.observation.maxIntervalSeconds + 1;
    await driver(world).observeScreen(new AbortController().signal);
    expect(captures()).toBe(0);
    expect(host.events).toEqual([]);
  });

  it('does not publish a capture that finishes after disabling observation', async () => {
    let resolve!: (value: ToolOutcome) => void;
    const { world, cfg, host } = await mounted(() => new Promise(done => { resolve = done; }));
    cfg.observation.enabled = true;
    const pending = driver(world).observeScreen(new AbortController().signal);
    cfg.observation.enabled = false;
    resolve(shot());
    await pending;
    expect(host.events).toEqual([]);
  });

  it('discards an observation if a dialog opens while capture is in progress', async () => {
    let resolve!: (value: ToolOutcome) => void;
    const { world, cfg, host } = await mounted(() => new Promise(done => { resolve = done; }));
    cfg.observation.enabled = true;
    const pending = driver(world).observeScreen(new AbortController().signal);
    const dialog = world.dialog({ text: 'fixture question', input: { kind: 'buttons', options: [{ label: 'OK' }] } });
    resolve(shot());
    await pending;
    expect(host.events).toEqual([]);
    dialog.close();
  });

  it('routes an observation through real Core and shows the model remark in the pet bubble', async () => {
    const definition: typeof DESKTOP_PET = {
      ...DESKTOP_PET,
      create: context => new DesktopPetWorld({
        cfg: context.cfg, timezone: context.timezone, persist: patch => context.persist(patch),
        runtimesRoot: () => join(context.dataDir, 'runtime'), modelsDir: () => join(context.dataDir, 'models'),
        captureObservation: async () => shot(),
      }),
    };
    const model = new ScriptedModel(turn => {
      expect(JSON.stringify(turn.records)).toContain('[screen observation]');
      if (turn.n === 0) return { calls: [{ name: 'pet_say', args: { script: '又在和标签页斗智斗勇啦？' } }] };
      return { calls: [{ name: 'end_turn' }] };
    });
    const bot = await startBot({ worlds: [definition as never], model, sections: { 'desktop-pet': {
      port: 0, window: { ...DESKTOP_PET_DEFAULTS.window, enabled: false },
      asr: { ...DESKTOP_PET_DEFAULTS.asr, enabled: false }, codex: { ...DESKTOP_PET_DEFAULTS.codex, enabled: false },
      observation: { enabled: true, minIntervalSeconds: 300, maxIntervalSeconds: 900 },
    } } });
    cleanup.push(() => bot.stop());
    const world = bot.assembly.mounted.find(item => item.id === 'desktop-pet') as DesktopPetWorld;
    const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    cleanup.push(() => page.close());
    await driver(world).observeScreen(new AbortController().signal);
    const said = await page.next(message => message.t === 'say', 20_000);
    expect(JSON.stringify(said.beats)).toContain('又在和标签页斗智斗勇啦？');
    expect(model.turns[0].records.some(record => record.context?.blobs?.some(blob => blob.mime === 'image/jpeg'))).toBe(true);
  });
});
