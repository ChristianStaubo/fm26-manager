// Contract renewals are delegated to the Director of Football (user rule: staff negotiate
// contracts). Actions → Contract → "DoF To Negotiate Contract", then the confirmation dialog
// "DOF to negotiate contract?" is answered Yes by recover() (ui/overlays.mjs KNOWN_DIALOGS).
import {openPlayer, actionPath, peekActions, recover, isoDate} from '../../game/ui/index.mjs';
import {log} from '../log.mjs';

export async function delegateRenewal(name, club, {dryRun = false} = {}) {
  const profile = await openPlayer(name, club);
  const {sub} = await peekActions('Contract');
  if (sub.includes('Withdraw Contract Offer') || sub.includes('Change Contract Offer')) return {name, already: true, options: sub};
  if (!sub.includes('DoF To Negotiate Contract')) return {name, done: false, reason: 'option not offered', options: sub};
  if (dryRun) return {name, dryRun: true, options: sub};
  await actionPath(['Contract', 'DoF To Negotiate Contract']);
  await recover();
  const after = (await peekActions('Contract')).sub;
  const done = after.includes('Withdraw Contract Offer') || after.includes('Change Contract Offer');
  const result = {action: 'delegate-renewal', name, club, date: isoDate(profile.date()), done};
  await log(result);
  return {...result, options: after};
}

// The renewal test (playbook §6, user 2026-10-15): renewing costs the wage rise over the contract plus
// loyalty bonus and agent fee; it protects his transfer value (which falls to nothing at a free).
// Renew when value >= min_value_x_cost x cost (above the wage cap too); else sell or let him go.
// Lawrence: (67K-49.5K) x 52 x 4 + 1.9M + 155K = 5.7M vs ~15.75M → 2.8x renew;
// Casadó: (125K-62K) x 52 x 5 + 5M + 375K = 21.8M vs ~37.7M → 1.7x renew.
export function renewalVerdict({currentWage, value, demand, years, loyaltyBonus = 0, agentFee = 0, age = 0, minutes = 0}, rules) {
  const cost = Math.max(0, demand - currentWage) * 52 * (years || 1) + (loyaltyBonus || 0) + (agentFee || 0);
  const ratio = cost > 0 ? Math.round(100 * value / cost) / 100 : Infinity;
  const verdict = ratio >= rules.min_value_x_cost ? 'renew'
    : value >= rules.sell_over && !(age >= rules.run_down_age && minutes < rules.regular_minutes) ? 'sell' : 'run-down';
  return {cost: Math.round(cost), value, ratio, verdict};
}

// Renew one of ours ourselves (user, 2026-10-14: "you can handle this instead of the DoF"):
// profile → Actions → Contract → Enter Contract Negotiations, then the same talks as for a signing
// (promises → contract form → salary ticks from his demand; personal-terms.mjs).
export async function renewSelf(name, club, {dryRun = false} = {}) {
  const {openPlayer, peekActions, actionPath, profileFacts} = await import('../../game/ui/index.mjs');
  const {negotiatePersonalTerms} = await import('./personal-terms.mjs');
  const profile = await openPlayer(name, club);
  const {sub} = await peekActions('Contract');
  if (!sub.includes('Enter Contract Negotiations')) return {action: 'renew-self', name, done: false, options: sub};
  if (dryRun) return {action: 'renew-self', name, done: false, dryRun: true, options: sub};
  const facts = profileFacts(profile);
  await actionPath(['Contract', 'Enter Contract Negotiations']);
  await answerEnterDialog();
  const value = facts.valueRange ? (facts.valueRange[0] + facts.valueRange[1]) / 2 : null;
  return negotiatePersonalTerms({player: name, entered: true, renewal: {currentWage: facts.wage, value}});
}
// "Enter contract negotiations?" (talking to the player without the agent chat first): Yes.
export async function answerEnterDialog() {
  const {Screen, overlays, click, settle} = await import('../../game/ui/index.mjs');
  await settle(1200);
  if (overlays(await Screen.read()).some(o => o.kind === 'dialog' && o.title === 'Enter contract negotiations?')) { await click('Yes', {recoverOnOcclusion: false}); await settle(1500); }
}
