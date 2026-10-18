// Bids to place again the next game day (user, 2035-06-18: after a flat rejection FM takes a new bid
// one day later; the user got Slatina, Đukić and Wark that way at their asking price).
// local/runs/rebids.json; the autopilot places the due ones once per game day.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const FILE = process.env.FM_REBIDS ? new URL('file://' + process.env.FM_REBIDS) : new URL('../../local/runs/rebids.json', import.meta.url);
export const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {bids: []}; } };
const save = d => { mkdirSync(new URL('.', FILE), {recursive: true}); writeFileSync(FILE, JSON.stringify(d, null, 1)); };
export function add(bid) { const d = load(); d.bids = d.bids.filter(b => b.name !== bid.name).concat(bid); save(d); }
/** Due on `date`: queued on an earlier day. Removed when taken (placed once). */
export function takeDue(date) {
  const d = load(), due = d.bids.filter(b => b.after < date);
  d.bids = d.bids.filter(b => b.after >= date); save(d);
  return due;
}
