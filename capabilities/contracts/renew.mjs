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

// Renew one of ours ourselves (user, 2026-10-14: "you can handle this instead of the DoF"):
// profile → Actions → Contract → Enter Contract Negotiations, then the same talks as for a signing
// (promises → contract form → salary ticks from his demand; personal-terms.mjs).
export async function renewSelf(name, club, {dryRun = false} = {}) {
  const {openPlayer, peekActions, actionPath} = await import('../../game/ui/index.mjs');
  const {negotiatePersonalTerms} = await import('./personal-terms.mjs');
  await openPlayer(name, club);
  const {sub} = await peekActions('Contract');
  if (!sub.includes('Enter Contract Negotiations')) return {action: 'renew-self', name, done: false, options: sub};
  if (dryRun) return {action: 'renew-self', name, done: false, dryRun: true, options: sub};
  await actionPath(['Contract', 'Enter Contract Negotiations']);
  await answerEnterDialog();
  return negotiatePersonalTerms({player: name, entered: true});
}
// "Enter contract negotiations?" (talking to the player without the agent chat first): Yes.
export async function answerEnterDialog() {
  const {Screen, overlays, click, settle} = await import('../../game/ui/index.mjs');
  await settle(1200);
  if (overlays(await Screen.read()).some(o => o.kind === 'dialog' && o.title === 'Enter contract negotiations?')) { await click('Yes', {recoverOnOcclusion: false}); await settle(1500); }
}
