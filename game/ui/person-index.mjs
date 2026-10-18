// Person index cache (local/runs/person-index.json): a player's database index, learned from a profile
// opened once through the UI, so the next open can be a direct game call (navigate.mjs openPlayer,
// game/bridge/agent/75-direct.js). Keyed by folded name and club; a direct open that shows someone
// else forgets the entry, and the UI path learns it again.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const FILE = new URL('../../local/runs/person-index.json', import.meta.url);
const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const key = (name, club) => `${fold(name)}|${fold(club)}`;

export function load(file = FILE) {
  try { return JSON.parse(readFileSync(file, 'utf8')).people || {}; } catch { return {}; }
}
function save(people, file) {
  try { mkdirSync(new URL('.', file), {recursive: true}); writeFileSync(file, JSON.stringify({people}, null, 1)); } catch { /* a cache */ }
}
export const get = (name, club, file = FILE) => load(file)[key(name, club)] ?? null;
export function learn(name, club, index, file = FILE) {
  if (!Number.isInteger(index) || index <= 0) return;
  const people = load(file); people[key(name, club)] = index; save(people, file);
}
export function forget(name, club, file = FILE) {
  const people = load(file); delete people[key(name, club)]; save(people, file);
}
