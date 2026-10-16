// The deals file (local/runs/deals.json) and one daily observation: Transfer Activity + our own
// actions from the decision log since the last observation → reduce → alerts.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {reduce} from './deals.mjs';
import {history} from '../log.mjs';
import {loadPolicy} from '../sell/decide.mjs';

const FILE = new URL('../../local/runs/deals.json', import.meta.url);
export const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {deals: {}, observed: null, at: null}; } };
const save = data => { mkdirSync(new URL('.', FILE), {recursive: true}); writeFileSync(FILE, JSON.stringify(data, null, 1)); };

/** Our own actions as deal events: a fee agreed for a buy, a bid we accepted, a counter accepted. */
export function events(entries, since, {fromDate} = {}) {
  const out = [];
  for (const e of entries) {
    if (since && (e.at || '') <= since) continue;
    // First observation: only this window's actions (game date), not the whole history.
    if (!since && fromDate && (e.date || '') < fromDate) continue;
    if (e.action === 'buy' && ['agreed', 'accepted-demands', 'release-clause'].includes(e.outcome)) out.push({player: e.name, dir: 'in', state: 'fee-agreed'});
    if (e.action === 'precontract' && e.outcome === 'agreed') out.push({player: e.name, dir: 'in', state: 'contract'});
    if (e.action === 'incoming-offer' && e.executed && (e.decision?.action === 'accept' || e.accepted)) out.push({player: e.offer?.player, dir: 'out', state: 'contract'});
  }
  return out.filter(e => e.player);
}

/** One observation (date, Transfer Activity rows) → saved deals + alerts. */
export async function observe(date, rows) {
  const data = load(), entries = await history();
  const fromDate = new Date(Date.parse(date) - 45 * 864e5).toISOString().slice(0, 10);
  const r = reduce(data.deals, {date, rows, events: events(entries, data.at, {fromDate})}, loadPolicy().deals || {});
  save({deals: r.deals, observed: date, at: new Date().toISOString()});
  return r;
}
