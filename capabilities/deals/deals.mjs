// Deals as a state machine (2032-02: five agreed signings lapsed and nothing noticed).
// Every transfer, ours or for our players, is in one explicit state; a daily observation of
// Recruitment → Transfer Activity moves it on. The reducer is pure: (deals, observation) → deals +
// alerts. Alerts stop the autopilot: a transition we haven't seen, a deal that vanished before it
// completed, a deal stuck in one state too long. Numbers: policy.json → deals.
//
//   in  (we buy):  offer → negotiating → fee-agreed → contract → work-permit → confirmation → completed
//   out (we sell): offer → negotiating → contract → confirmation → completed
//   any → collapsed ("Contract Rejected", rejected bids, withdrawn)
import {daysBetween} from '../season/season.mjs';
export const STATES = ['offer', 'negotiating', 'fee-agreed', 'contract', 'work-permit', 'confirmation', 'completed', 'collapsed'];
const NEXT = {
  offer: ['negotiating', 'fee-agreed', 'contract', 'work-permit', 'confirmation', 'collapsed'],
  negotiating: ['offer', 'fee-agreed', 'contract', 'work-permit', 'confirmation', 'collapsed'],
  // After Suggest Terms agrees a fee, the formal offer shows as "Offer Made" until the club confirms.
  'fee-agreed': ['offer', 'contract', 'work-permit', 'confirmation', 'completed', 'collapsed'],
  contract: ['work-permit', 'confirmation', 'completed', 'collapsed'],
  'work-permit': ['contract', 'confirmation', 'completed', 'collapsed'],
  confirmation: ['completed', 'collapsed'],
  completed: [], collapsed: [],
  // Off the list one day, back the next (a new bid, or a partial read): the deal goes on (2032-07-12).
  vanished: ['offer', 'negotiating', 'fee-agreed', 'contract', 'work-permit', 'confirmation', 'completed', 'collapsed'],
};
export const canMove = (from, to) => from === to || (NEXT[from] || []).includes(to);

// Transfer Activity stage label → state ("Offer Made £7.5M", "2 Offers", "Negotiated", "Contract",
// "Contract Rejected", "Work Permit", "Confirmation").
export function stageState(label) {
  const l = (label || '').trim();
  if (/^Contract Rejected/i.test(l)) return 'collapsed';
  if (/^Contract\b/i.test(l)) return 'contract';
  if (/^Work Permit/i.test(l)) return 'work-permit';
  if (/^Confirmation/i.test(l)) return 'confirmation';
  if (/^Negotiated/i.test(l)) return 'negotiating';
  if (/^(Offer Made|\d+ Offers?)\b/i.test(l)) return 'offer';
  return null;
}
export const STAGES = /\s+(Offer Made|\d+ Offers?|Negotiated|Contract Rejected|Contract|Work Permit|Confirmation)\b.*$/i;
/** "Kellen Fisher Contract" → {player: 'Kellen Fisher', stage: 'Contract'}; a bare "Contract" → player null. */
export function splitLabel(label) {
  const m = STAGES.exec(' ' + (label || '').trim());
  if (!m) return {player: (label || '').trim() || null, stage: null};
  const player = (' ' + label.trim()).slice(0, m.index).trim();
  return {player: player || null, stage: m[1]};
}
const key = name => (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const days = (a, b) => daysBetween(new Date(a), new Date(b));

/**
 * reduce(deals, obs, policy) → {deals, alerts}
 * deals: {[key]: {player, dir, state, since, seen, history: [[date, state]]}}
 * obs: {date, rows: [{player, stage}] from Transfer Activity, events: [{player, dir, state}] from
 *       our own actions (fm buy agreed a fee, we accepted a bid, a sale completed…)}
 * A deal gone from Transfer Activity has completed or collapsed; which one, the caller confirms
 * (the export: whose contract is he on). Until then it is 'vanished' and raises an alert unless its
 * last state was confirmation (completion follows) — the wonderkids vanished from fee-agreed.
 */
export function reduce(deals = {}, obs, policy = {}) {
  const out = structuredClone(deals), alerts = [], date = obs.date, seenNow = new Set();
  const stuckDays = policy.max_days_in_state ?? {offer: 7, negotiating: 3, 'fee-agreed': 2, contract: 3, 'work-permit': 7, confirmation: 2};
  const move = (k, d, to, why) => {
    if (d.state === to) return;
    // Sales see several clubs and the row shows the combined stage ("contract" → "2 Offers",
    // Bouhoudane 2032-07-24): an odd move on a sale is reported; on a signing it stops us.
    if (!canMove(d.state, to)) alerts.push({kind: 'unknown-transition', player: d.player, from: d.state, to, why, dir: d.dir, stop: d.dir !== 'out'});
    d.history.push([date, to]); d.state = to; d.since = date;
  };
  const touch = (player, dir, state, why) => {
    const k = key(player);
    // A finished deal (completed / collapsed) that shows up again is a NEW deal for the same player:
    // Luna joined, then a bid for him appeared (2032-07-22). Keep the old one in `previous`.
    if (out[k] && ['completed', 'collapsed'].includes(out[k].state)) out[k] = {player, dir: dir || null, state, since: date, seen: date, history: [[date, state]], previous: out[k]};
    else if (!out[k]) out[k] = {player, dir: dir || null, state, since: date, seen: date, history: [[date, state]]};
    else { if (dir && !out[k].dir) out[k].dir = dir; move(k, out[k], state, why); }
    out[k].seen = date; seenNow.add(k);
  };
  for (const e of obs.events || []) {
    // Terms agreed only marks a deal we track (a renewal logs the same and has no deal).
    if (e.termsAgreed) { const d = out[key(e.player)]; if (d && !['completed', 'collapsed'].includes(d.state)) d.termsAgreed = date; continue; }
    touch(e.player, e.dir, e.state, 'our action');
  }
  for (const r of obs.rows || []) {
    const state = stageState(r.stage);
    if (!r.player) { alerts.push({kind: 'unnamed-deal', stage: r.stage, stop: false}); continue; }
    if (!state) { alerts.push({kind: 'unknown-stage', player: r.player, stage: r.stage, stop: true}); continue; }
    touch(r.player, r.dir, state, `Transfer Activity: ${r.stage}`);
  }
  for (const [k, d] of Object.entries(out)) {
    if (['completed', 'collapsed', 'vanished'].includes(d.state)) continue;
    if (!seenNow.has(k) && obs.rows) {
      // Off the list: completed or collapsed. After confirmation it completed; otherwise check.
      if (d.state === 'confirmation') { d.history.push([date, 'completed']); d.state = 'completed'; d.since = date; continue; }
      alerts.push({kind: 'vanished', player: d.player, from: d.state, dir: d.dir, stop: d.dir === 'in' && ['fee-agreed', 'contract', 'work-permit'].includes(d.state)});
      d.history.push([date, 'vanished']); d.state = 'vanished'; d.since = date; continue;
    }
    // Checked by hand and left to run ("ack" until a date, fm deals ack): no stuck alert until then.
    if (d.ackUntil && date <= d.ackUntil) continue;
    // Terms agreed at 'contract': the player is considering; he gets longer (terms-agreed) from that day.
    const considering = d.state === 'contract' && d.termsAgreed;
    const age = days(considering && d.termsAgreed > d.since ? d.termsAgreed : d.since, date);
    const limit = considering ? stuckDays['terms-agreed'] ?? 7 : stuckDays[d.state];
    // A slow sale at 'contract' is the buyer talking to our player (Ouazane, Kislyak, 2032-07-09): if
    // it falls through he simply stays. Only our signings (and any deal awaiting our confirmation) stop us.
    if (Number.isFinite(limit) && age > limit) alerts.push({kind: 'stuck', player: d.player, state: d.state, days: age, dir: d.dir,
      stop: d.state === 'confirmation' || (d.dir !== 'out' && ['fee-agreed', 'contract'].includes(d.state))});
  }
  return {deals: out, alerts};
}

/** A signing at 'contract' whose contract at his club ends by the coming 30 June is a pre-contract: it waits
 *  for his answer (or 1 July) for weeks, so it is reported, not a stop (Jaló, 2039-01: the user's own
 *  pre-contract stopped every fm cycle after 3 days). endsOf: player → 'YYYY-MM-DD' (his contract end). */
export function preContracts(alerts, endsOf, date) {
  const june = `${Number(date.slice(0, 4)) + (date.slice(5) > '06-30' ? 1 : 0)}-06-30`;
  return alerts.map(a => a.kind === 'stuck' && a.dir === 'in' && a.state === 'contract' && endsOf[a.player] && endsOf[a.player] <= june
    ? {...a, stop: false, preContract: true} : a);
}

/** A vanished deal resolved from the export: on our books (in) / gone from them (out) → completed. */
export function resolve(deals, player, completed, date) {
  const d = deals[key(player)];
  if (!d || d.state !== 'vanished') return deals;
  d.state = completed ? 'completed' : 'collapsed'; d.since = date; d.history.push([date, d.state]);
  return deals;
}
