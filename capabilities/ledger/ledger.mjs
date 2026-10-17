// The scoreboard, read from the game (audit 2033-08 G1: the ledger was typed in by hand and stopped in
// 2030/31). Club page tiles: "Transfer History £136M 6 players Transfers in (2033/34) £181M 9 players
// Transfers out (2033/34)" and "Finances £252,787,937 Overall Balance … Salary £2,649,518 / £2,814,586".
// Every checkpoint writes the season's totals into local/runs/ledger.json; fm audit sums them.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {parseMoney} from '../../game/ui/screen.mjs';

const FILE = new URL('../../local/runs/ledger.json', import.meta.url);
export const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {seasons: {}}; } };
const save = d => { mkdirSync(new URL('.', FILE), {recursive: true}); writeFileSync(FILE, JSON.stringify(d, null, 1)); };

/** Parse the club page's tiles (pure: tile labels in, numbers out). */
export function readClubTiles(labels) {
  const th = labels.find(l => /^Transfer History /.test(l)), fin = labels.find(l => /^Finances £/.test(l));
  const m = th && /£([\d.,]+[KM]?) (\d+) players? Transfers in \((\d{4}\/\d{2})\) £([\d.,]+[KM]?) (\d+) players? Transfers out/.exec(th);
  const f = fin && /^Finances (£[\d,]+) Overall Balance.*?Salary (£[\d,]+) \/ (£[\d,]+)/.exec(fin);
  return {
    season: m?.[3] ?? null,
    in: m ? parseMoney('£' + m[1]) : null, inPlayers: m ? Number(m[2]) : null,
    out: m ? parseMoney('£' + m[4]) : null, outPlayers: m ? Number(m[5]) : null,
    balance: f ? parseMoney(f[1]) : null, wages: f ? parseMoney(f[2]) : null, wageBudget: f ? parseMoney(f[3]) : null,
  };
}

/** League position from a standings row on screen ("3 Brentford 38 23 6 9 26 75"). */
export const positionOf = (labels, club) => Number(labels.map(l => new RegExp(`^(\\d+) ${club} \\d`).exec(l)?.[1]).find(Boolean)) || null;

/** Record one reading: the season's running totals replace the previous reading. */
export function record(r, date) {
  if (!r.season || r.in == null || r.out == null) throw new Error('Transfer History tile unreadable');
  const d = load();
  d.seasons ??= {};
  d.seasons[r.season] = {...d.seasons[r.season], in: r.in, out: r.out, inPlayers: r.inPlayers, outPlayers: r.outPlayers, read: date, source: 'club page (auto)'};
  d.balance = {value: r.balance, wages: r.wages, wageBudget: r.wageBudget, read: date};
  save(d);
  return d;
}

/** Live: Club page → tiles → ledger; Portal standings → position. */
export async function readLedger() {
  const {goTo} = await import('../../game/ui/navigate.mjs');
  const {Screen, isoDate, waitFor} = await import('../../game/ui/index.mjs');
  const {club} = (await import('../data.mjs')).club();
  const s = await goTo('Club');
  // The tiles build after the page (2034-01-01: the checkpoint read it too early): wait for both.
  const page = await waitFor(x => x.items.some(i => /^Transfer History £/.test(i.label || '')) && x.items.some(i => /^Finances £/.test(i.label || '')), {what: 'club page tiles', timeout: 15000});
  const labels = page.items.map(i => i.label || '');
  const r = readClubTiles(labels), date = isoDate(s.date?.() ?? (await Screen.read()).date());
  // The standings show on the Portal's Stages tab (rows "2 Brentford 38 25 5 8 37 80", 2034-05-28).
  await goTo('Portal');
  const {click} = await import('../../game/ui/index.mjs');
  await click('Stages', {name: 'SIButton'}).catch(() => null);
  const table = await waitFor(x => positionOf(x.items.map(i => i.label || ''), club), {what: 'standings', timeout: 8000}).catch(() => Screen.read());
  r.position = positionOf(table.items.map(i => i.label || ''), club);
  record(r, date);
  return {...r, date};
}
