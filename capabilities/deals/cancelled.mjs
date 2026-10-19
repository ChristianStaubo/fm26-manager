// Talks we ended today (a withdrawn bid, on the offer screen or from Transfer Activity), by player: FM keeps
// them dead that game day, and reopening them made a stray £17.25M offer for Pepper (2036-06-04). One
// registry for both ways of ending them (local/runs/talks-cancelled.json: player key → game date).
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fold} from '../../game/ui/navigate.mjs';

const FILE = new URL('../../local/runs/talks-cancelled.json', import.meta.url);
const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; } };
// how: 'offer-screen' (Withdraw Offer in the talks) or 'activity' (fm withdraw: the list still shows the
// offer until the next day, so the stray-offer check skips only those).
export const cancelledOn = name => load()[fold(name)]?.date ?? null;
export const withdrawnFromActivityOn = name => { const e = load()[fold(name)]; return e?.how === 'activity' ? e.date : null; };
export function recordCancelled(name, date, how = 'offer-screen') {
  const all = load(); all[fold(name)] = {date, how};
  mkdirSync(new URL('.', FILE), {recursive: true});
  writeFileSync(FILE, JSON.stringify(all, null, 1));
}
