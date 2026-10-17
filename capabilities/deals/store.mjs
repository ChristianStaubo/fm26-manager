// The deals file (local/runs/deals.json) and one daily observation: Transfer Activity + our own
// actions from the decision log since the last observation → reduce → alerts.
import {readFileSync, writeFileSync, mkdirSync, statSync} from 'node:fs';
import {reduce, resolve} from './deals.mjs';
import {history} from '../log.mjs';
import {loadPolicy} from '../sell/decide.mjs';
import {addDays} from '../season/season.mjs';

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
    // Personal terms agreed: the player is considering (Gray, 2035-01: 4 days at "Contract" read as stuck).
    if (e.action === 'personal-terms' && e.outcome === 'agreed') out.push({player: e.player, termsAgreed: true});
    if (e.action === 'precontract' && e.outcome === 'agreed') out.push({player: e.name, dir: 'in', state: 'contract'});
    if (e.action === 'incoming-offer' && e.executed && (e.decision?.action === 'accept' || e.accepted)) out.push({player: e.offer?.player, dir: 'out', state: 'contract'});
  }
  return out.filter(e => e.player);
}

/** Our players (contract club = our club) from the save export: a deal for one of them is a sale. */
// Read once per export (it is ~20 MB and only changes with a fresh export), not every observed day.
let oursCache = {key: null, names: new Set()};
export async function ourPlayers() {
  try {
    const {exportPath, club} = await import('../data.mjs'), path = exportPath(), key = `${path}@${statSync(path).mtimeMs}`;
    if (oursCache.key === key) return oursCache.names;
    const {execFileSync} = await import('node:child_process');
    const code = 'import csv, json, sys\nprint(json.dumps([p["name"] for p in csv.DictReader(open(sys.argv[1], encoding="utf8")) if p["contract_club"] == sys.argv[2]]))';
    oursCache = {key, names: new Set(JSON.parse(execFileSync('python3', ['-c', code, path, club().club], {encoding: 'utf8'})))};
    return oursCache.names;
  } catch { return new Set(); }
}

/** A player's contract club from the save export (to open his profile). */
export async function clubOf(name) {
  const {exportPath} = await import('../data.mjs'), {execFileSync} = await import('node:child_process');
  const code = 'import csv, sys\nprint(next((p["contract_club"] or p["club"] for p in csv.DictReader(open(sys.argv[1], encoding="utf8")) if p["name"] == sys.argv[2]), ""))';
  return execFileSync('python3', ['-c', code, exportPath(), name], {encoding: 'utf8'}).trim() || undefined;
}

/** One observation (date, Transfer Activity rows) → saved deals + alerts. */
/** A save reloaded to an earlier date (user, 2033-08-05: back to the pre-buy save to redo three deals):
 *  forget what happened on or after `date` (the save's own day is ambiguous: it was saved mid-day), deal
 *  by deal; a deal with nothing left is dropped and the next observation sees it afresh. */
export function rewind(deals, date) {
  const out = {};
  for (const [k, d] of Object.entries(deals)) {
    const history = (d.history || []).filter(([day]) => day < date);
    if (!history.length) continue;
    const [since, state] = history.at(-1);
    out[k] = {...d, history, state, since, seen: d.seen >= date ? history.at(-1)[0] : d.seen};
  }
  return out;
}

export async function observe(date, rows) {
  const data = load(), entries = await history(), ours = await ourPlayers();
  // The game date went backwards: a save was reloaded. Drop the abandoned timeline: deal steps after
  // `date`, and log entries written before the reload (the last one dated after `date` marks it).
  if (data.observed && date < data.observed) {
    data.deals = rewind(data.deals, date);
    const reloaded = entries.filter(e => e.date && e.date > date).at(-1)?.at;
    if (reloaded && (!data.at || reloaded > data.at)) data.at = reloaded;
  }
  // Direction from the facts (Ouazane's sale was agreed outside our handler: direction unknown, 2032-07-09).
  // Not on our books → a signing (Koumeyi, 2035-01: a staff bid with dir null couldn't be classified).
  rows = (rows || []).map(r => ({...r, dir: r.dir ?? (r.player && ours.size ? (ours.has(r.player) ? 'out' : 'in') : undefined)}));
  for (const d of Object.values(data.deals)) if (!d.dir && ours.has(d.player)) d.dir = 'out';
  const fromDate = addDays(date, -45);
  const r = reduce(data.deals, {date, rows, events: events(entries, data.at, {fromDate})}, loadPolicy().deals || {});
  save({deals: r.deals, observed: date, at: new Date().toISOString()});
  return r;
}

/** We looked at a stuck deal and it's fine for now: no stuck alert until `until` (YYYY-MM-DD). */
export function ack(player, until, why = '') {
  const data = load(), k = Object.keys(data.deals).find(k => data.deals[k].player.toLowerCase() === player.toLowerCase());
  if (!k) throw new Error(`No tracked deal for ${player}`);
  Object.assign(data.deals[k], {ackUntil: until, ackWhy: why});
  save(data);
  return data.deals[k];
}

/** A vanished deal checked in the game: completed (he's ours / gone from us) or collapsed. */
export function resolveVanished(player, completed, date) {
  const data = load();
  resolve(data.deals, player, completed, date);
  save(data);
}
