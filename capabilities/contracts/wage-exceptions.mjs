// Wage-cap exceptions for swaps (playbook §5): a signing that replaces an outgoing player may earn
// up to the outgoing player's wage even above the cap (Bakayoko £116K for Touré £130K, 2028-07:
// the cap blocked a swap that lowered the wage bill). Set with `fm buy … --wage-max N --replaces X`;
// personal terms read it. Keyed by full name; the contract screen often gives only the surname.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const FILE = new URL('../../local/runs/wage-exceptions.json', import.meta.url);
const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; } };

export function allow(name, max, why) {
  const all = load();
  all[name] = {max, why, at: new Date().toISOString()};
  mkdirSync(new URL('.', FILE), {recursive: true});
  writeFileSync(FILE, JSON.stringify(all, null, 1));
  return all[name];
}

export function wageException(name) {
  const all = load(), n = String(name || '').toLowerCase();
  const hit = Object.entries(all).find(([k]) => k.toLowerCase() === n || k.toLowerCase().split(' ').at(-1) === n.split(' ').at(-1));
  return hit ? hit[1] : null;
}
