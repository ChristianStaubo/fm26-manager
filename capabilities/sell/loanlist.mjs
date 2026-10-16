// Players we listed for loan to develop (user, 2033-01-05: Juninho, an MC with no slot in our shape:
// "loan him for sure, he's a great player"). local/runs/loan-list.json; the loan offer handler accepts
// offers for them by the youth loan rule (policy selling.youth_loan_min_wage_share).
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {samePlayer} from '../../game/ui/navigate.mjs';

const FILE = process.env.FM_LOAN_LIST ? new URL('file://' + process.env.FM_LOAN_LIST) : new URL('../../local/runs/loan-list.json', import.meta.url);
export const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {players: []}; } };
const save = d => { mkdirSync(new URL('.', FILE), {recursive: true}); writeFileSync(FILE, JSON.stringify(d, null, 1)); };
export const has = (name, d = load()) => d.players.some(p => samePlayer(p.name, name));
export function add(entry) { const d = load(); d.players = d.players.filter(p => !samePlayer(p.name, entry.name)).concat(entry); save(d); }
export function remove(name) { const d = load(), n = d.players.length; d.players = d.players.filter(p => !samePlayer(p.name, name)); save(d); return d.players.length < n; }
