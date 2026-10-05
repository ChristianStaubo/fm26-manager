// Transfer-list one of our players with an asking price.
import {Screen, waitFor, click, choose, setFee, parseMoney, openPlayer, actionPath, profileFacts, isoDate, NeedsAnalyst} from '../../ui/index.mjs';
import {loadRules} from './decide.mjs';
import {log} from '../log.mjs';

// Default asking price: rules.selling.first_counter × the top of the player's valuation.
export const defaultAskingPrice = facts => Math.round(facts.valueRange[1] * loadRules().selling.first_counter);

/**
 * listPlayer('Thiago', 'Brentford', {price?, dryRun?})
 * Profile → Actions → Transfer → Set Transfer Status → "Transfer listed" + asking price → Confirm.
 * The asking price is set with presets and ± steps and never exceeds `price` (steps are £1M at
 * £60M), so £64.8M becomes £64M.
 */
export async function listPlayer(name, club, {price, dryRun = false} = {}) {
  const profile = await openPlayer(name, club);
  const facts = profileFacts(profile);
  try { await actionPath(['Transfer', 'Set Transfer Status']); }
  catch (e) {
    // Quirk: some players have no "Set Transfer Status" entry, only a "Transfer Status" submenu
    // whose options are greyed out — their status is locked (e.g. already listed, Ajer 2026-06).
    // The profile header then shows the current asking price.
    if (e instanceof NeedsAnalyst && e.details?.available?.includes('Transfer Status') && facts.askingPrice)
      return {action: 'list-player', name, club, alreadyListed: true, locked: true, askingSet: facts.askingPrice};
    throw e;
  }
  const status = x => x.items.find(i => i.kind === 'dropdown' && ['No status set', 'Transfer listed', 'Listed for loan', 'Unavailable'].includes(i.label));
  const dialog = await waitFor(x => status(x) && x.buttons().some(b => b.name === 'ConfirmButton'), {what: 'Set Transfer Status dialog'});
  // The header shows one amount instead of a range either when the player is already listed
  // (asking price) or when his value is known exactly. The dialog's status tells them apart.
  if (!price && !facts.valueRange) {
    const current = parseMoney(dialog.after('Asking Price', i => i.kind === 'button')?.label);
    if (status(dialog).label === 'Transfer listed') { await click('Cancel', {name: 'CancelButton'}); return {action: 'list-player', name, club, alreadyListed: true, askingSet: current}; }
    if (!facts.askingPrice) { await click('Cancel', {name: 'CancelButton'}); throw new NeedsAnalyst(`No valuation shown for ${name}; pass --price`, facts); }
    facts.valueRange = [facts.askingPrice, facts.askingPrice]; // exact valuation
  }
  const asking = price ?? defaultAskingPrice(facts);
  await choose(status, 'Transfer listed', {what: 'transfer status'});
  const fee = await setFee('Asking Price', asking, {mode: 'atMost'});
  const result = {action: 'list-player', name, club, date: isoDate(profile.date()), facts, askingWanted: asking, askingSet: fee.set};
  if (dryRun) { await click('Cancel', {name: 'CancelButton'}); return {...result, dryRun: true}; }
  await click('Confirm', {name: 'ConfirmButton'});
  await waitFor(x => !x.buttons().some(b => b.name === 'ConfirmButton'), {what: 'dialog closed'});
  await log(result);
  return {...result, listed: true};
}
