// Contract renewals are delegated to the Director of Football (user rule: staff negotiate
// contracts). Actions → Contract → "DoF To Negotiate Contract", then the confirmation dialog
// "DOF to negotiate contract?" is answered Yes by recover() (ui/overlays.mjs KNOWN_DIALOGS).
import {openPlayer, actionPath, peekActions, recover, isoDate} from '../../ui/index.mjs';
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
