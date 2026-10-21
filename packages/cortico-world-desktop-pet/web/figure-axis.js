/** Integer axis inputs use `n<value>` as an option in skin.scheme. */
export function customValue(axis, id) {
  if (!axis.custom || !/^n[0-9]+$/.test(id)) return null;
  const value = Number(id.slice(1));
  return Number.isSafeInteger(value) && value >= axis.custom.min && value <= axis.custom.max ? value : null;
}

export function picksOf(pack, scheme) {
  const preset = pack.presets.find((p) => p.id === scheme);
  const parts = (scheme || '').split('-');
  return Object.fromEntries(pack.axes.map((a, i) => {
    const want = preset ? preset.pick[a.id] : parts[i];
    return [a.id, a.options.some((o) => o.id === want) || customValue(a, want) !== null ? want : a.options[0].id];
  }));
}

export function schemeOf(pack, picks) {
  const preset = pack.presets.find((p) => pack.axes.every((a) => p.pick[a.id] === picks[a.id]));
  return preset ? preset.id : pack.axes.map((a) => picks[a.id]).join('-');
}

/** Commit on Enter or blur; invalid input leaves the saved selection unchanged. */
export function customInput(doc, axis, pick, nameOf, onChange) {
  const c = axis.custom;
  const label = doc.createElement('label');
  label.className = 'axis-custom';
  label.classList.toggle('selected', customValue(axis, pick) !== null);
  const title = label.appendChild(doc.createElement('span'));
  title.textContent = nameOf(c.name);
  const line = label.appendChild(doc.createElement('span'));
  const input = line.appendChild(doc.createElement('input'));
  input.type = 'number'; input.min = String(c.min); input.max = String(c.max); input.step = '1'; input.required = true;
  input.value = String(customValue(axis, pick) ?? axis.options.find((o) => o.id === pick)?.value ?? c.default);
  input.setAttribute('aria-label', `${nameOf(c.name)} (${c.min}–${c.max}${c.unit})`);
  line.append(c.unit);
  const range = label.appendChild(doc.createElement('small'));
  range.textContent = `${c.min}–${c.max}${c.unit}`;
  const commit = () => {
    if (!input.reportValidity()) return;
    const id = `n${input.valueAsNumber}`;
    if (id !== pick) { pick = id; onChange(id); }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  return label;
}
