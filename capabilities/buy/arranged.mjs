// Arranged transfers (user, 2026-10-19: "both Luiz and Rusnak are joining us, not sure why the agent can't
// see this"): a pre-contract or deal already agreed shows on the player's profile as "Transfer arranged /
// Joining <club> on <date>" (game/ui/navigate.mjs profileFacts). The save export can't tell an agreed
// pre-contract from a pending offer (both are a contract offer from our club), so each one seen on a
// profile is recorded here; the free-agent step marks those players done, and buy/precontract stop.
// Store: local/runs/arranged.json {players: {key: {name, club, date, seen}}}.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const FILE = new URL('../../local/runs/arranged.json', import.meta.url);
import {fold as key} from '../../game/ui/navigate.mjs';
import {club} from '../data.mjs';

export function load() { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {players: {}}; } }
export function record(name, arranged, seen = null) {
  const book = load();
  book.players[key(name)] = {name, club: arranged.club, date: arranged.date, seen};
  mkdirSync(new URL('.', FILE), {recursive: true});
  writeFileSync(FILE, JSON.stringify(book, null, 1));
  return book.players[key(name)];
}
export const lookup = (name, book = load()) => book.players[key(name)] || null;
/** A profile's "Transfer arranged" (profileFacts().arranged): recorded when the club is ours. */
export const noteIfOurs = (name, arranged) => arranged?.club === club().club ? record(name, arranged) : null;
