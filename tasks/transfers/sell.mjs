// Transfer-list one of our players with an asking price.
import {Screen, waitFor, click, choose, setFee, parseMoney, openPlayer, actionPath, profileFacts, isoDate, NeedsAnalyst} from '../../ui/index.mjs';
import {loadRules} from './decide.mjs';
import {log} from '../log.mjs';
import * as pricebook from './pricebook.mjs';

// Default asking price: rules.selling.asking_price × the top of the player's valuation (1.0: we
// want to sell). --deter uses asking_price_deter for players listed but not really for sale.
export const defaultAskingPrice = (facts, {deter = false} = {}) => {
  const {asking_price, asking_price_deter} = loadRules().selling;
  return Math.round(facts.valueRange[1] * (deter ? asking_price_deter : asking_price));
};

/**
 * listPlayer('Thiago', 'Brentford', {price?, dryRun?})
 * Profile → Actions → Transfer → Set Transfer Status → "Transfer listed" + asking price → Confirm.
 * Default asking price: the top of the valuation (see defaultAskingPrice).
 * The asking price is set with presets and ± steps and never exceeds `price` (steps are £1M at
 * £60M), so £64.8M becomes £64M.
 */
// Cancel the Set Transfer Status card and wait until it has closed: returning while it is still
// closing leaves a 'panel' overlay for the next command (segment 3's "Cancel not found").
async function cancel() {
  await click('Cancel', {name: 'CancelButton'});
  await waitFor(x => !x.buttons().some(b => b.name === 'CancelButton'), {what: 'Set Transfer Status closed'});
}

export async function listPlayer(name, club, {price, deter = false, min, force = false, dryRun = false} = {}) {
  if (!loadRules().selling.list_players && !force)
    throw new NeedsAnalyst(`We don't transfer-list players (user policy, rules.json selling.list_players): bids are judged as they come. Pass --force only if the user asked to list ${name}.`);
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
  const askingBox = x => x.after('Asking Price', i => i.kind === 'button')?.label;
  if (!price && !facts.valueRange) {
    const current = parseMoney(askingBox(dialog));
    if (status(dialog).label === 'Transfer listed') { await cancel(); return {action: 'list-player', name, club, alreadyListed: true, askingSet: current}; }
    if (!facts.askingPrice) { await cancel(); throw new NeedsAnalyst(`No valuation shown for ${name}; pass --price`, facts); }
    // Not listed, yet the box holds an amount: a stored asking price from an earlier listing
    // (sticky), not his value. Only an Unspecified box means the header amount is an exact value.
    if (askingBox(dialog) !== 'Unspecified') { await cancel(); throw new NeedsAnalyst(`${name} kept the asking price ${askingBox(dialog)} from an earlier listing: pass --price (see tasks/transfers/README.md)`, facts); }
    facts.valueRange = [facts.askingPrice, facts.askingPrice]; // exact valuation
  }
  // Default (user, 2026-10-08): record our minimum in the price book and list with the asking
  // price left Unspecified. Only possible while the box still says Unspecified (never listed
  // before); --price / --deter set an asking price instead.
  const unspecified = !price && !deter && loadRules().selling.list_unspecified && askingBox(dialog) === 'Unspecified' && facts.valueRange;
  const date = isoDate(profile.date());
  let result;
  if (unspecified) {
    const book = pricebook.price(name, facts.valueRange, date, {min});
    // Worth more to us than the market pays (e.g. replacing his output costs more than his top
    // value): keep him, unless the analyst sets a minimum explicitly.
    if (book.keep && min === undefined) { await cancel(); throw new NeedsAnalyst(`Keep ${name}: our minimum ${book.minimum} is above the top of his value ${facts.valueRange[1]} (${book.why}). Pass --min to list anyway.`, book); }
    if (book.blockers.length && !force) { await cancel(); throw new NeedsAnalyst(`Selling ${name} leaves a gap: ${book.blockers.join('; ')} (pass --force to list anyway)`, book); }
    await choose(status, 'Transfer listed', {what: 'transfer status'});
    result = {action: 'list-player', name, club, date, facts, asking: 'Unspecified', minimum: book.minimum, target: book.target, why: book.why};
    if (dryRun) { await cancel(); return {...result, dryRun: true}; }
    await click('Confirm', {name: 'ConfirmButton'});
    await waitFor(x => !x.buttons().some(b => b.name === 'ConfirmButton'), {what: 'dialog closed'});
    pricebook.record({name, club, range: facts.valueRange, minimum: book.minimum, target: book.target, why: book.why, listed: date});
    await log(result);
    return {...result, listed: true};
  }
  const asking = price ?? defaultAskingPrice(facts, {deter});
  await choose(status, 'Transfer listed', {what: 'transfer status'});
  const fee = await setFee('Asking Price', asking, {mode: 'atMost'});
  result = {action: 'list-player', name, club, date, facts, askingWanted: asking, askingSet: fee.set};
  if (dryRun) { await cancel(); return {...result, dryRun: true}; }
  await click('Confirm', {name: 'ConfirmButton'});
  await waitFor(x => !x.buttons().some(b => b.name === 'ConfirmButton'), {what: 'dialog closed'});
  await log(result);
  return {...result, listed: true};
}
