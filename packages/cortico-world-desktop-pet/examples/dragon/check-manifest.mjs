/**
 * Validates web/dragon/figure.json with the repo's OWN manifest validator (src/packs.ts readManifest),
 * so the check is the same code the app runs, not a re-implementation.
 * Also checks the vocab against the kit's known words.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = fileURLToPath(new URL('../../', import.meta.url));
const packDir = join(pkg, 'web', 'dragon');

let readManifest;
try {
  ({ readManifest } = await import(new URL('file:///' + join(pkg, 'src', 'packs.ts').replace(/\\/g, '/')).href));
} catch (e) {
  console.log('[warn] could not import src/packs.ts:', e.message);
}
if (readManifest) {
  const skipped = [];
  const m = readManifest(packDir, false, skipped, undefined);
  if (typeof m === 'string') { console.log('[readManifest] REJECTED:', m); process.exit(1); }
  console.log('[readManifest] accepted:', JSON.stringify({
    id: m.id, version: m.version, entry: m.entry, export: m.export, model: m.model, thumb: m.thumb ?? null,
    axes: m.axes.map(a => ({ id: a.id, options: a.options.map(o => o.id) })),
    presets: m.presets.map(p => ({ id: p.id, pick: p.pick })),
    vocab: m.vocab.length, sounds: Object.keys(m.sounds), can: m.can,
  }));
  console.log('[readManifest] skipped (left out, not fatal):', skipped.length ? skipped : '(none)');
  if (!m.vocab.length) { console.log('no vocab survived validation'); process.exit(1); }
  if (m.vocab.length !== 35) console.log('NOTE: vocab count differs from the file:', m.vocab.length);
} else {
  console.log('[warn] readManifest unavailable — manifest not validated by the repo code');
  process.exit(1);
}

// vocab vs kit
const body = readFileSync(join(pkg, 'web', 'kit', 'body.js'), 'utf8');
const grab = re => { const m = body.match(re); return m ? m[1].match(/'([a-z]+)'/g).map(s => s.slice(1, -1)) : []; };
const KE = grab(/export const KIT_EXPRESSIONS = \[([\s\S]*?)\];/);
const KM = grab(/export const KIT_MOTIONS = \[([\s\S]*?)\];/);
const man = JSON.parse(readFileSync(join(packDir, 'figure.json'), 'utf8'));
const known = new Set([...KE, ...KM, ...Object.keys(man.sounds || {})]);
const bad = man.vocab.filter(w => !known.has(w.id)).map(w => w.id);
const NAME_BREAK = /[,，、\s【】<>＜＞]/;
const names = [];
const badName = [], badSec = [], longName = [];
for (const w of man.vocab) {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(w.id)) badName.push('id:' + w.id);
  if (!(typeof w.seconds === 'number' && w.seconds > 0 && Number.isFinite(w.seconds))) badSec.push(w.id);
  for (const [lang, list] of Object.entries(w.names || {})) for (const n of list) {
    if (NAME_BREAK.test(n)) badName.push(`${w.id}/${lang}:${n}`);
    if (n.length > 32) longName.push(`${w.id}/${lang}:${n}`);
    names.push(n);
  }
  if (!w.names?.zh?.length || !w.names?.en && false) badName.push('missing zh: ' + w.id);
  if (!w.about?.zh || !w.about?.en) badName.push('missing about zh/en: ' + w.id);
}
const dup = names.filter((n, i) => names.indexOf(n) !== i);
console.log('[vocab]', man.vocab.length, 'words;  expressions', man.vocab.filter(w => w.kind === 'expression').length, ' motions', man.vocab.filter(w => w.kind === 'motion').length);
console.log('[vocab] words the kit does not know:', bad.length ? bad : '(none)');
console.log('[vocab] bad names:', badName.length ? badName : '(none)', ' | too long:', longName.length ? longName : '(none)', ' | dup:', dup.length ? dup : '(none)', ' | bad seconds:', badSec.length ? badSec : '(none)');

// axis/option id rules (src/packs.ts:47,49)
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/, OPTION_ID = /^[a-z0-9]{1,24}$/;
for (const a of man.axes) {
  console.log(`[axis] ${a.id} id-ok=${ID.test(a.id)} zh=${a.name.zh} en=${a.name.en} options=${a.options.map(o => `${o.id}(opt-ok=${OPTION_ID.test(o.id)},zh=${o.name.zh},en=${o.name.en})`).join(', ')}`);
}
for (const p of man.presets) {
  const covers = man.axes.every(a => a.options.some(o => o.id === p.pick[a.id]));
  console.log(`[preset] ${p.id} pick=${JSON.stringify(p.pick)} coversEveryAxis=${covers}`);
  if (!covers) process.exit(1);
}
console.log('[manifest] name.zh/en:', !!man.name.zh, !!man.name.en, '| about.zh/en:', !!man.about.zh, !!man.about.en);
console.log('[manifest] entry/export/model/thumb:', man.entry, man.export, man.model, man.thumb ?? '(none, as intended)');
for (const f of [man.entry, man.model, ...(man.thumb ? [man.thumb] : [])]) {
  const ok = f && existsSync(join(packDir, f));
  console.log(`[file] ${f} exists=${ok}`);
  if (!ok) process.exit(1);
}
if (bad.length || badName.length || badSec.length) { console.log('VOCAB PROBLEMS'); process.exit(1); }
console.log('\nMANIFEST + VOCAB OK');
