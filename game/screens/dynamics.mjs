// Squad → Dynamics → Hierarchy (2027-05-20): sections "Team Leaders", "Highly Influential Players",
// "Influential Players", … each followed by player rows labelled "<Name> <age> year-old <role> <status> …".
// Read from the raw UI tree so rows below the fold count too. Saved to local/runs/dynamics.json,
// which `fm squad` reads (playbook §4: Influential and above move at most once per window).
// Route: not automated yet (the Squad menu's Dynamics entry didn't navigate by row or index);
// open the hierarchy by hand, then run `fm dynamics`.
import {writeFileSync, mkdirSync} from 'node:fs';
import {Screen, clean} from '../ui/index.mjs';

const SECTIONS = [['Team Leaders', 'team_leaders'], ['Highly Influential Players', 'highly_influential'],
  ['Influential Players', 'influential'], ['Other Players', 'other']];

export function readHierarchy(s) {
  const out = Object.fromEntries(SECTIONS.map(([, k]) => [k, []]));
  let current = null;
  for (const n of s.tree.nodes) {
    const text = clean(n.text || n.label || '');
    const sec = SECTIONS.find(([title]) => text === title);
    if (sec) { current = sec[1]; continue; }
    if (!current || !n.row) continue;
    const m = /^(.+?) (\d{2}) year-old /.exec(text);
    if (m) out[current].push(m[1]);
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
}

export async function dynamics() {
  const s = await Screen.read();
  const h = readHierarchy(s);
  if (!h.team_leaders.length && !h.highly_influential.length)
    throw new Error('Not on the hierarchy screen: open Squad → Dynamics → Hierarchy, then run fm dynamics');
  const result = {read: new Date().toISOString(), date: s.date()?.toISOString().slice(0, 10) ?? null, ...h,
    influential_or_above: [...h.team_leaders, ...h.highly_influential, ...h.influential]};
  mkdirSync(new URL('../../local/runs/', import.meta.url), {recursive: true});
  writeFileSync(new URL('../../local/runs/dynamics.json', import.meta.url), JSON.stringify(result, null, 1));
  return result;
}
