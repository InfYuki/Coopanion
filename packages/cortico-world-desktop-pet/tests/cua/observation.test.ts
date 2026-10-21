import { describe, expect, it, vi } from 'vitest';
import { Cua } from '../../src/cua/cua.ts';
import { CUA_DEFAULTS } from '../../src/cua/config.ts';
import type { EngineRequest, ScreenshotResult } from '../../src/cua/engine-ipc.ts';
import { FakeHost } from '../helpers/fake-host.ts';

const shot: ScreenshotResult = {
  displays: [{ index: 1, primary: true, width: 1920, height: 1080 }],
  display: 1, foregroundDisplay: 1, foreground: 'Example window', layout: 'one',
  cursor: { display: 1, x: 400, y: 200 }, jpeg: new Uint8Array([1, 2]), width: 960, height: 540, scale: .5,
};

function mounted(deferred = false) {
  const cfg = structuredClone(CUA_DEFAULTS);
  cfg.enabled = false;
  cfg.control = false;
  cfg.permission = 'ask-each-turn';
  const asked: string[] = [];
  const cua = new Cua({ cfg: () => cfg, askPermission: async question => { asked.push(question); return 'no'; } });
  cua.start(new FakeHost());
  const requests: EngineRequest[] = [];
  const inner = cua as unknown as {
    spawn(): unknown;
    pending: Map<number, { done(value: unknown): void; timer: ReturnType<typeof setTimeout> }>;
    view: unknown; screen: unknown; permission: unknown; grantedUntil: number;
  };
  let finish = () => {};
  inner.spawn = () => ({
    exitCode: 0, connected: true,
    send(message: { id?: number; req?: EngineRequest; cancel?: number }) {
      if (!message.id || !message.req) return;
      requests.push(message.req);
      const id = message.id;
      finish = () => {
        const pending = inner.pending.get(id);
        if (!pending) return;
        inner.pending.delete(id); clearTimeout(pending.timer); pending.done(shot);
      };
      if (!deferred) finish();
    },
  });
  return { cua, cfg, asked, requests, inner, finish: () => finish() };
}

describe('observation capture', () => {
  it('takes a read-only foreground screenshot without enabling computer control or changing interactive coordinates', async () => {
    const { cua, cfg, inner, requests, asked } = mounted();
    const view = { display: 2, width: 800, height: 600, scale: .25, layout: 'interactive' };
    const screen = { displays: [], layout: 'interactive' };
    inner.view = view; inner.screen = screen; inner.grantedUntil = 123;
    const outcome = await cua.captureObservation();
    expect(outcome.blobs).toMatchObject([{ bytes: shot.jpeg, mime: 'image/jpeg' }]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ op: 'screenshot', display: null, maxWidth: cfg.screenshot.maxWidth, maxHeight: cfg.screenshot.maxHeight, quality: cfg.screenshot.quality });
    expect(inner.view).toBe(view);
    expect(inner.screen).toBe(screen);
    expect(inner.permission).toBeNull();
    expect(inner.grantedUntil).toBe(123);
    expect([cfg.enabled, cfg.control]).toEqual([false, false]);
    expect(asked).toEqual([]);
    const interactive = await cua.tools().find(tool => tool.name === 'pet_cua_screenshot')!.handler({}, { role: 'main', log: new FakeHost().log });
    expect(typeof interactive === 'object' && interactive.failed).toBe(true);
    expect(asked).toHaveLength(1);
    await cua.stop();
  });

  it('does not return screenshot bytes after a capture was cancelled', async () => {
    const { cua, requests, finish } = mounted(true);
    const controller = new AbortController();
    const pending = cua.captureObservation(controller.signal);
    controller.abort(); finish();
    await expect(pending).rejects.toThrow();
    expect(requests.map(request => request.op)).toEqual(['screenshot']);
    await cua.stop();
  });

  it('fails before spawning an engine when unavailable, stopped or already cancelled', async () => {
    const { cua, requests } = mounted();
    const unavailable = vi.spyOn(cua, 'unsupported').mockReturnValue('No screen is available');
    expect(await cua.captureObservation()).toMatchObject({ failed: true });
    unavailable.mockRestore();
    const controller = new AbortController(); controller.abort();
    await expect(cua.captureObservation(controller.signal)).rejects.toThrow();
    await cua.stop();
    expect(await cua.captureObservation()).toMatchObject({ failed: true });
    expect(requests).toEqual([]);
  });
});
