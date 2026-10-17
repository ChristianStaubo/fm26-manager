// The loan decision table (user, 2033-08-17 and 2033-09-01): every loan offer for one of our players,
// decided from two inputs and the offer's terms. Nothing stops for the user.
//
//                 prospect (<=21, or <=23 with PA >= 160)        senior non-starter        first-team (a starter)
//   listed        starts (Regular Starter+) and >= 50% of wage;   fees + share >= 100%      reject
//                 without a start promise >= 75%                  of his wage (profit)
//   not listed    starts and >= 75%                               reject                    reject
//
// An obligation to buy is a sale (the sell matrix, not this table). An option to buy is recorded and
// the loan is judged by the table either way (user, 2033-09-01). Numbers: policy selling.loan_table.
import {loadRules} from './decide.mjs';

/** first-team | prospect | senior, from his depth-chart role (analysis/depth.py) and age/PA. */
export function playerType(depth, {age, pa} = {}, policy = loadRules()) {
  const P = policy.selling.prospects;
  if (depth?.role === 'starter') return 'first-team';
  const a = depth?.age ?? age, p = depth?.pa ?? pa;
  return a <= P.max_age || (a <= P.older_max_age && p >= P.older_min_pa) ? 'prospect' : 'senior';
}

/** {type, listed, playingTime, wageShare, fees, wageCost} → {action: 'accept'|'reject', reason}. */
export function decideLoanOffer({type, listed, playingTime, wageShare, fees = 0, wageCost}, policy = loadRules()) {
  const t = policy.selling.loan_table, who = `${listed ? 'listed' : 'not listed'} ${type}`;
  const cell = t[listed ? 'listed' : 'unlisted'][type];
  if (!cell || cell === 'reject') return {action: 'reject', reason: `${who}: we don't loan him`};
  if (!Number.isFinite(wageShare)) return {action: 'reject', reason: `${who}: wage share unreadable`};
  if (cell.covered != null) {
    const covered = Number.isFinite(wageCost) && wageCost > 0 ? (fees + wageShare * wageCost) / wageCost : wageShare;
    return covered >= cell.covered
      ? {action: 'accept', reason: `${who}: ${Math.round(covered * 100)}% of his wage covered (>= ${Math.round(cell.covered * 100)}%)`}
      : {action: 'reject', reason: `${who}: only ${Math.round(covered * 100)}% of his wage covered (< ${Math.round(cell.covered * 100)}%)`};
  }
  const starting = (t.start_roles || []).some(r => (playingTime || '').startsWith(r));
  const min = starting ? cell.starting : cell.otherwise;
  if (min == null) return {action: 'reject', reason: `${who}: no start promised (${playingTime || '?'})`};
  return wageShare >= min
    ? {action: 'accept', reason: `${who}: ${Math.round(wageShare * 100)}% of his wage${starting ? `, promised ${playingTime}` : ''} (>= ${Math.round(min * 100)}%)`}
    : {action: 'reject', reason: `${who}: ${Math.round(wageShare * 100)}% of his wage (< ${Math.round(min * 100)}%${starting ? ` with ${playingTime}` : ''})`};
}
