// A signing arrives (user, 2034-09): a wonderkid bought to develop goes straight on the loan list,
// unless he was bought for the squad. Decision: the approval's note. Called by the autopilot when a
// buy completes.
import * as approvals from '../approvals.mjs';

const SQUAD = /\b(squad|starts?|first.team)\b/i;

/** The approval for this signing → 'loan-list' | null. */
export function arrivalAction(approval) {
  const note = approval?.note || '';
  return /wonderkid|prospect|portfolio/i.test(note) && !SQUAD.test(note) ? 'loan-list' : null;
}

/** Loan-list each arrival whose approval says so. Never throws: a failure is reported, not a stop. */
export async function onArrivals(players, club, {find = approvals.find, list} = {}) {
  const out = [];
  for (const player of players) {
    if (arrivalAction(find('buy', player)) !== 'loan-list') continue;
    try {
      list ||= (await import('./list.mjs')).loanListPlayer;
      out.push(await list(player, club, {why: 'wonderkid: loan-listed on arrival'}));
    } catch (e) { out.push({action: 'loan-list', name: player, error: e.message}); }
  }
  return out;
}
