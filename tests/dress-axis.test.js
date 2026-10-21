import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { customInput, picksOf, schemeOf } from '../packages/cortico-world-desktop-pet/web/figure-axis.js';
import { knownScheme } from '../packages/cortico-world-desktop-pet/web/body-host.js';
import { readFileSync } from 'node:fs';

const axis = {
  id: 'size', name: { en: 'Size' },
  options: [{ id: 's', name: { en: 'Small' }, value: 100 }, { id: 'lg', name: { en: 'Large' }, value: 132 }],
  custom: { name: { en: 'Custom' }, min: 25, max: 400, default: 132, unit: '%' },
};
const pack = { axes: [{ id: 'tone', options: [{ id: 'day' }, { id: 'night' }] }, axis], presets: [] };

describe('custom dressing size', () => {
  it('preserves dragon size and stride independently, including older saved schemes',()=>{
    const dragon=JSON.parse(readFileSync(new URL('../packages/cortico-world-desktop-pet/web/dragon/figure.json',import.meta.url),'utf8'));
    expect(picksOf(dragon,'origin-xl')).toEqual({scheme:'origin',size:'xl',stride:'normal'});
    const picks=picksOf(dragon,'origin-n173-n175');
    expect(picks).toEqual({scheme:'origin',size:'n173',stride:'n175'});
    expect(knownScheme(dragon,'origin-n173-n175')).toBe('origin-n173-n175');
    expect(schemeOf(dragon,{...picks,stride:'short'})).toBe('origin-n173-short');
    expect(schemeOf(dragon,{...picks,size:'s'})).toBe('origin-s-n175');
    const dom=new JSDOM('<body/>'),saved=[];
    const input=customInput(dom.window.document,dragon.axes.find(a=>a.id==='stride'),'normal',n=>n.en,id=>saved.push(id)).querySelector('input');
    input.value='175';input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter'}));
    expect(saved).toEqual(['n175']);dom.window.close();
  });
  it('restores a custom pick, keeps it when another axis changes and returns to a preset option', () => {
    const picks = picksOf(pack, 'day-n173');
    expect(picks).toEqual({ tone: 'day', size: 'n173' });
    expect(knownScheme(pack, 'day-n173')).toBe('day-n173');
    expect(schemeOf(pack, { ...picks, tone: 'night' })).toBe('night-n173');
    expect(schemeOf(pack, { ...picks, size: 'lg' })).toBe('day-lg');
    for (const id of ['n0', 'n401', 'n1e2', 'nNaN']) {
      expect(picksOf(pack, `day-${id}`).size).toBe('s');
      expect(knownScheme(pack, `day-${id}`)).toBe('day-s');
    }
  });

  it('commits valid percentages on Enter or blur, ignoring empty and invalid values', () => {
    const dom = new JSDOM('<body></body>');
    const { document, Event, KeyboardEvent } = dom.window;
    const saved = [];
    const control = customInput(document, axis, 'lg', (name) => name.en, (id) => saved.push(id));
    document.body.append(control);
    const input = control.querySelector('input');
    expect(input.value).toBe('132');
    input.value = '173';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new Event('change'));
    expect(saved).toEqual(['n173']);
    for (const invalid of ['', '0', '401', '132.5']) {
      input.value = invalid; input.dispatchEvent(new Event('change'));
    }
    expect(saved).toEqual(['n173']);
    input.value = '25'; input.dispatchEvent(new Event('change'));
    input.value = '400'; input.dispatchEvent(new Event('change'));
    expect(saved).toEqual(['n173', 'n25', 'n400']);
    expect(customInput(document, axis, 'n173', (name) => name.en, () => {}).querySelector('input').value).toBe('173');
    dom.window.close();
  });
});
