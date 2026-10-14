// Autonomy and approvals (playbook §10): each capability is 'approve' (the user signs off each
// action and its price) or 'auto' (policy.json autonomy). An approval is one player, one action and
// a price limit, given by the user in chat and recorded by the main session with `fm approve`.
// The player agent never records approvals. Store: local/runs/approvals.json.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {loadPolicy} from './sell/decide.mjs';
import {NeedsAnalyst} from '../game/ui/index.mjs';

export {loadPolicy};
const FILE = new URL('../local/runs/approvals.json', import.meta.url);
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const m = v => `£${(v / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;

export const mode = (capability, policy = loadPolicy()) => policy.autonomy?.[capability] ?? 'approve';

export function load(file = FILE) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {approvals: []}; }
}
function save(data, file) { mkdirSync(new URL('.', file), {recursive: true}); writeFileSync(file, JSON.stringify(data, null, 2)); }

// kind: 'buy' (limit = most we pay) | 'sell' (limit = least we accept; lists and takes bids).
export function approve(kind, player, {max, min, note, file = FILE} = {}) {
  if (!['buy', 'sell'].includes(kind)) throw new Error(`approve buy|sell, not ${kind}`);
  const limit = kind === 'buy' ? max : min;
  if (!Number.isFinite(limit)) throw new Error(kind === 'buy' ? 'approve buy needs --max' : 'approve sell needs --min');
  const data = load(file);
  data.approvals = data.approvals.filter(a => !(a.kind === kind && norm(a.player) === norm(player)));
  const entry = {kind, player, limit, note: note || null, at: new Date().toISOString()};
  data.approvals.push(entry);
  save(data, file);
  return entry;
}
export function revoke(kind, player, {file = FILE} = {}) {
  const data = load(file), before = data.approvals.length;
  data.approvals = data.approvals.filter(a => !(a.kind === kind && norm(a.player) === norm(player)));
  save(data, file);
  return {revoked: before - data.approvals.length};
}
export const find = (kind, player, {file = FILE} = {}) =>
  load(file).approvals.find(a => a.kind === kind && norm(a.player) === norm(player)) || null;

/**
 * gate(capability, kind, player, {price}) before an action that moves a player.
 * 'auto' → null. 'approve' → the approval, or NeedsAnalyst naming what to ask the user.
 * buy: price (our --max) must be at or under the approved limit; sell: at or over it.
 */
export function gate(capability, kind, player, {price, what, policy, file = FILE} = {}) {
  if (mode(capability, policy) === 'auto') return null;
  const a = find(kind, player, {file});
  const ask = `Needs the user's approval: ${what || `${kind} ${player}`}. Stop and report it; the main session records it with fm approve ${kind} "${player}" --${kind === 'buy' ? 'max' : 'min'} <amount>.`;
  if (!a) throw new NeedsAnalyst(ask, {approval: 'missing', capability, kind, player, price: price ?? null});
  if (Number.isFinite(price) && (kind === 'buy' ? price > a.limit : price < a.limit))
    throw new NeedsAnalyst(`${ask} Approved ${kind === 'buy' ? 'up to' : 'from'} ${m(a.limit)}, this is ${m(price)}.`,
      {approval: 'outside-limit', capability, kind, player, price, limit: a.limit});
  return a;
}
