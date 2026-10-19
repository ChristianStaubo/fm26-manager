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
// facts: what the approval assumed about him ({club, until, value}, from the save export at approval time).
// The tools check them against his live profile before acting (factsChanged): Jiménez was approved as a free
// agent from the June export and had signed for Valencia to 2041 by 10 July (user, 2026-10-19).
export function approve(kind, player, {max, min, note, facts = null, file = FILE} = {}) {
  if (!['buy', 'sell'].includes(kind)) throw new Error(`approve buy|sell, not ${kind}`);
  const limit = kind === 'buy' ? max : min;
  if (!Number.isFinite(limit)) throw new Error(kind === 'buy' ? 'approve buy needs --max' : 'approve sell needs --min');
  const data = load(file);
  data.approvals = data.approvals.filter(a => !(a.kind === kind && norm(a.player) === norm(player)));
  const entry = {kind, player, limit, note: note || null, at: new Date().toISOString(), ...(facts ? {facts} : {})};
  data.approvals.push(entry);
  save(data, file);
  return entry;
}
/** A reason the approval no longer fits his live profile (a contract ending later than the one approved on:
 *  a new club or a renewal), or null. A month's slack for how the dates are read. */
export function factsChanged(approval, live) {
  const was = approval?.facts?.until, now = live?.contractEnds;
  if (!was || !now) return null;
  return Date.parse(now) - Date.parse(was) > 31 * 864e5
    ? `approved when his contract (${approval.facts.club ?? '?'}) ran to ${was}; his profile now shows ${live.contract} (to ${now}): a new contract since. Decide again with the live facts`
    : null;
}

export function revoke(kind, player, {file = FILE} = {}) {
  const data = load(file), before = data.approvals.length;
  data.approvals = data.approvals.filter(a => !(a.kind === kind && norm(a.player) === norm(player)));
  save(data, file);
  return {revoked: before - data.approvals.length};
}
// Holds: deals the user is deciding (Ortega, 2030-07-14: he suggested the terms himself). The
// autopilot stops on them instead of negotiating. local/runs/approvals.json → holds.
export function hold(player, {off = false, file = FILE} = {}) {
  if (!player) throw new Error('fm hold "<name>" [--off]');
  const data = load(file);
  data.holds = (data.holds || []).filter(h => h && norm(h) !== norm(player));
  if (!off) data.holds.push(player);
  save(data, file);
  return {holds: data.holds};
}
// Released: out-of-contract players the user lets go on a free (Ajer, Katić, Damsgaard, 2030-07-17).
export function release(player, {file = FILE} = {}) {
  if (!player) throw new Error('fm release "<name>"');
  const data = load(file);
  data.released = [...(data.released || []).filter(r => norm(r) !== norm(player)), player];
  save(data, file);
  return {released: data.released};
}
export const held = (player, {file = FILE} = {}) => (load(file).holds || []).some(h => norm(h) === norm(player));
export const find = (kind, player, {file = FILE} = {}) =>
  load(file).approvals.find(a => a.kind === kind && norm(a.player) === norm(player)) || null;

/**
 * gate(capability, kind, player, {price}) before an action that moves a player.
 * 'auto' → null. 'approve' → the approval, or NeedsAnalyst naming what to ask the user.
 * buy: price (our --max) must be at or under the approved limit; sell: at or over it.
 */
/** The slack around an approved limit (policy approval_tolerance: 2%, at least £250K, one Fee-box step).
 *  User, 2026-10-19: an accepted Pepper deal was cancelled over £30K. */
export function tolerance(limit, policy) {
  const t = (policy || loadPolicy()).approval_tolerance || {pct: 0.02, min: 250000};
  return Number.isFinite(limit) ? Math.max(t.min, t.pct * limit) : 0;
}

export function gate(capability, kind, player, {price, what, policy, file = FILE} = {}) {
  if (mode(capability, policy) === 'auto') return null;
  const a = find(kind, player, {file});
  const ask = `Needs the user's approval: ${what || `${kind} ${player}`}. Stop and report it; the main session records it with fm approve ${kind} "${player}" --${kind === 'buy' ? 'max' : 'min'} <amount>.`;
  if (!a) throw new NeedsAnalyst(ask, {approval: 'missing', capability, kind, player, price: price ?? null});
  const slack = tolerance(a.limit, policy);
  if (Number.isFinite(price) && (kind === 'buy' ? price > a.limit + slack : price < a.limit - slack))
    throw new NeedsAnalyst(`${ask} Approved ${kind === 'buy' ? 'up to' : 'from'} ${m(a.limit)}, this is ${m(price)}.`,
      {approval: 'outside-limit', capability, kind, player, price, limit: a.limit});
  return a;
}
