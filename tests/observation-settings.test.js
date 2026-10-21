// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { petPage } from '../console/features/pet/index.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';
import { LANGUAGE } from '../console/base/language.ts';
import { observationText } from '../packages/cortico-world-desktop-pet/src/i18n/observation.ts';

const group = 'world:desktop-pet:observation';
const prefix = 'worlds.desktop-pet.observation';
const copy = observationText(LANGUAGE).config;
let state;
let writes;
let failSave;
let life;

beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  state = { [`${prefix}.enabled`]: false, [`${prefix}.minIntervalSeconds`]: 300, [`${prefix}.maxIntervalSeconds`]: 900 };
  writes = [];
  failSave = false;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', async (url, init = {}) => {
    if (url === '/api/config' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (failSave) return new Response(JSON.stringify({ error: 'fixture failure' }), { status: 500 });
      writes.push(body);
      Object.assign(state, body.values);
      return new Response(JSON.stringify({ result: body.group }));
    }
    if (url === '/api/config') return new Response(JSON.stringify({ groups: [{ group: { id: group }, values: state }] }));
    if (url === '/api/config/options/coopanion.language') return new Response(JSON.stringify({ options: [] }));
    return new Response('{}');
  });
});
afterEach(() => { life?.dispose(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

async function mount() {
  life = new Lifecycle();
  const root = document.querySelector('main');
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, memo: { get: (_, fallback) => fallback, set() {} }, signal: life.signal });
  await petPage.mount({ root, ui, signal: life.signal, lifecycle: life, capabilities: {}, router: { navigate() {}, addLeaveGuard() { return { dispose() {} }; } }, onError(error) { throw error; }, async mountPanel() { return { dispose() {} }; } });
  const row = label => [...root.querySelectorAll('.companion-row')].find(row => row.querySelector('.companion-label')?.textContent === label);
  return {
    enabled: row(copy.enabled.title).querySelector('input'),
    min: row(copy.min.title).querySelector('input'),
    max: row(copy.max.title).querySelector('input'),
    root,
  };
}
function change(input, value) {
  if (input.type === 'checkbox') input.checked = value;
  else input.value = String(value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('screen observation in everyday settings', () => {
  it('saves a valid interval pair atomically and never writes computer-control permissions', async () => {
    const controls = await mount();
    change(controls.min, 1200);
    expect(writes).toEqual([]);
    expect(controls.root.textContent).toContain(copy.intervalError);
    change(controls.max, 1800);
    await expect.poll(() => state[`${prefix}.maxIntervalSeconds`]).toBe(1800);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ group, values: { [`${prefix}.enabled`]: false, [`${prefix}.minIntervalSeconds`]: 1200, [`${prefix}.maxIntervalSeconds`]: 1800 } });
    expect(Object.keys(writes[0].values).every(key => key.startsWith(prefix))).toBe(true);
  });
  it('restores the switch and interval after a rejected save', async () => {
    const controls = await mount();
    failSave = true;
    change(controls.enabled, true);
    await expect.poll(() => controls.enabled.disabled).toBe(false);
    expect(controls.enabled.checked).toBe(false);
    expect(controls.min.value).toBe('300');
    expect(controls.root.textContent).toContain(copy.saveFailed('fixture failure'));
    expect(state[`${prefix}.enabled`]).toBe(false);
  });
  it('can turn observation off even when advanced settings contain a reversed interval', async () => {
    state[`${prefix}.enabled`] = true;
    state[`${prefix}.minIntervalSeconds`] = 900;
    state[`${prefix}.maxIntervalSeconds`] = 300;
    const controls = await mount();
    expect(controls.root.textContent).toContain(copy.intervalError);
    change(controls.enabled, false);
    await expect.poll(() => state[`${prefix}.enabled`]).toBe(false);
    expect(writes[0]).toEqual({ group, values: { [`${prefix}.enabled`]: false } });
  });
});
