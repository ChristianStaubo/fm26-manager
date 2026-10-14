// fm watch: a labelled recording of a mapping session (docs/agent-workflow.md §5). While the user
// does an action by hand, read the screen every `interval` ms and log what changed: controls that
// appeared, disappeared or changed label/value/enabled, overlays, and the agent line. The bridge's
// recorder logs UI calls without labels (2026-10-14: three unlabelled clicks); this logs meaning.
import {writeFileSync, appendFileSync} from 'node:fs';
import {Screen, overlays} from '../game/ui/index.mjs';

const key = i => `${i.kind}|${i.name || ''}|${Math.round(i.bounds[0] / 8)}|${Math.round(i.bounds[1] / 8)}`;
const show = i => ({kind: i.kind, label: i.label, ...(i.value !== undefined ? {value: i.value} : {}), ...(i.enabled === false ? {enabled: false} : {}), at: i.bounds.map(Math.round).slice(0, 2)});

export function diff(a, b) {
  const A = new Map(a.items.filter(i => i.kind !== 'text' || i.label.length < 120).map(i => [key(i), i]));
  const B = new Map(b.items.filter(i => i.kind !== 'text' || i.label.length < 120).map(i => [key(i), i]));
  const added = [], removed = [], changed = [];
  for (const [k, i] of B) {
    const o = A.get(k);
    if (!o) added.push(show(i));
    else if (o.label !== i.label || o.value !== i.value || o.enabled !== i.enabled) changed.push({from: show(o), to: show(i)});
  }
  for (const [k, i] of A) if (!B.has(k)) removed.push(show(i));
  return {added, removed, changed};
}

export async function watch({seconds = 300, interval = 1000, out} = {}) {
  const file = out || `local/runs/watch-${Date.now()}.jsonl`;
  writeFileSync(file, '');
  let prev = await Screen.read(), n = 0;
  appendFileSync(file, JSON.stringify({t: 0, start: true, date: prev.date()?.toISOString().slice(0, 10), items: prev.items.length}) + '\n');
  const end = Date.now() + seconds * 1000, t0 = Date.now();
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, interval));
    let cur;
    try { cur = await Screen.read(); } catch { continue; }
    const d = diff(prev, cur);
    if (d.added.length || d.removed.length || d.changed.length) {
      n++;
      appendFileSync(file, JSON.stringify({t: Date.now() - t0, overlays: overlays(cur), ...d,
        // A whole page change is summarised, not dumped.
        ...(d.added.length + d.removed.length > 150 ? {added: d.added.length, removed: d.removed.length, page: cur.texts().slice(0, 12)} : {})}) + '\n');
      prev = cur;
    }
  }
  return {file, changes: n, seconds};
}
