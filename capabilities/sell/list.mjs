// Transfer-list one of our players with an asking price.
import {Screen, waitFor, click, choose, setFee, parseMoney, openPlayer, actionPath, profileFacts, isoDate, NeedsAnalyst} from '../../game/ui/index.mjs';
import {peekActions} from '../../game/ui/navigate.mjs';
import {loadRules} from './decide.mjs';
import {log} from '../log.mjs';
import {gate} from '../approvals.mjs';
import * as pricebook from '../value/pricebook.mjs';
import * as loanlist from './loanlist.mjs';

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

// Already listed: still record our --min in the price book, or the bid handler has no floor
// (Correia, 2028-06-27: three fm sell --min calls returned alreadyListed and recorded nothing).
function bookAlreadyListed(name, club, facts, min, date, result, wanted) {
  if (min === undefined) return result;
  const target = Math.max(min, wanted ?? facts.valueRange?.[1] ?? min);   // --target: the user's (Kayode £85M, 2032-01-16)
  pricebook.record({name, club, range: facts.valueRange ?? null, minimum: min, target, why: 'set with --min (already listed)', listed: date});
  return {...result, minimum: min, target, recorded: true};
}

/** Would listing him upset him? (user, 2034-01-01: Casadó.) Profile → Actions → Transfer → Transfer Status →
 *  "Transfer Status" asks "Are you sure you want to change the transfer status of <name>?" and, for a
 *  player who'd mind (long-serving, influential), adds "<name> is likely to become unhappy upon hearing
 *  that he has been transfer-listed". We read it and always answer No: nothing changes. (The Set
 *  Transfer Status card, our listing route, never shows this warning.) */
export async function listingUpsets(name, club) {
  await openPlayer(name, club);
  // The entry that lists him reads "Transfer listed" (McAidoo) or "Transfer Status" (Casadó), by player.
  const {sub} = await peekActions(['Transfer', 'Transfer Status']);
  const entry = ['Transfer listed', 'Transfer Status'].find(l => sub.includes(l));
  if (!entry) return {upset: null, options: sub};
  await actionPath(['Transfer', 'Transfer Status', entry]);
  const ask = x => x.hasText(/^Are you sure you want to change the transfer status of /) && x.buttons('No').length > 0;
  const s = await waitFor(ask, {what: 'transfer status confirmation', timeout: 8000}).catch(() => null);
  if (!s) {
    // No confirmation: the click may have listed him. Put it back and say so.
    const r = await unlistPlayer(name, club);
    return {upset: null, noConfirmation: true, undone: r.changed};
  }
  const warning = s.texts().find(t => /likely to become unhappy/i.test(t)) || null;
  await click('No');
  await waitFor(x => !ask(x), {what: 'confirmation closed'});
  return {upset: !!warning, warning};
}

export async function listPlayer(name, club, {price, deter = false, min, target, force = false, dryRun = false} = {}) {
  if (!loadRules().selling.list_players && !force)
    throw new NeedsAnalyst(`We don't transfer-list players (user policy, policy.json selling.list_players): bids are judged as they come. Pass --force only if the user asked to list ${name}.`);
  // Listing needs the user's approval while autonomy.sell is 'approve'; the approved minimum is
  // the price book floor unless --min asks for more.
  const approved = dryRun ? null : gate('sell', 'sell', name, {price: min, what: `list ${name} for sale`});
  if (approved && min === undefined) min = approved.limit;
  // Never list a player it would upset: wait for bids instead (user, 2034-01-01).
  if (!force) {
    const check = await listingUpsets(name, club);
    if (check.upset) {
      const entry = {action: 'list-player', name, club, listed: false, waitForBids: true, why: 'listing would upset him', warning: check.warning};
      await log(entry);
      return entry;
    }
  }
  const profile = await openPlayer(name, club);
  const facts = profileFacts(profile);
  try { await actionPath(['Transfer', 'Set Transfer Status']); }
  catch (e) {
    // Quirk: some players have no "Set Transfer Status" entry, only a "Transfer Status" submenu
    // whose options are greyed out — their status is locked (e.g. already listed, Ajer 2026-06).
    // The profile header then shows the current asking price.
    if (e instanceof NeedsAnalyst && e.details?.available?.includes('Transfer Status') && facts.askingPrice)
      return bookAlreadyListed(name, club, facts, min, isoDate(profile.date()), {action: 'list-player', name, club, alreadyListed: true, locked: true, askingSet: facts.askingPrice}, target);
    throw e;
  }
  const status = x => x.items.find(i => i.kind === 'dropdown' && ['No status set', 'Transfer listed', 'Listed for loan', 'Unavailable'].includes(i.label));
  const dialog = await waitFor(x => status(x) && x.buttons().some(b => b.name === 'ConfirmButton'), {what: 'Set Transfer Status dialog'});
  // The header shows one amount instead of a range either when the player is already listed
  // (asking price) or when his value is known exactly. The dialog's status tells them apart.
  const askingBox = x => x.after('Asking Price', i => i.kind === 'button')?.label;
  if (!price && !facts.valueRange) {
    const current = parseMoney(askingBox(dialog));
    if (status(dialog).label === 'Transfer listed') { await cancel(); return bookAlreadyListed(name, club, facts, min, isoDate(profile.date()), {action: 'list-player', name, club, alreadyListed: true, askingSet: current}, target); }
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

// Take a player off the transfer list (user, 2031-01-01: Brown refused to talk while listed, "He isn't
// interested due to being transfer listed", and we renew him instead). Set Transfer Status → No status set.
export async function unlistPlayer(name, club, {dryRun = false} = {}) {
  const profile = await openPlayer(name, club);
  await actionPath(['Transfer', 'Set Transfer Status']);
  const status = x => x.items.find(i => i.kind === 'dropdown' && ['No status set', 'Transfer listed', 'Listed for loan', 'Unavailable'].includes(i.label));
  const dialog = await waitFor(x => status(x) && x.buttons().some(b => b.name === 'ConfirmButton'), {what: 'Set Transfer Status dialog'});
  const was = status(dialog).label;
  if (was === 'No status set' || dryRun) { await cancel(); return {action: 'unlist', name, was, changed: false, dryRun}; }
  await choose(status, 'No status set', {what: 'transfer status'});
  await click('Confirm', {name: 'ConfirmButton'});
  await waitFor(x => !x.buttons().some(b => b.name === 'ConfirmButton'), {what: 'dialog closed'});
  const entry = {action: 'unlist', name, club, date: isoDate(profile.date()), was, changed: true, priceBookRemoved: pricebook.remove(name)};
  await log(entry);
  return entry;
}

// List for loan (user, 2033-01-05, Juninho: no slot in our shape, so he develops elsewhere).
// Profile → Actions → Transfer → Loan Status → "Available for loan" (the Set Transfer Status card has no
// loan option). Offers are then accepted by the youth loan rule.
export async function loanListPlayer(name, club, {why = '', dryRun = false} = {}) {
  const profile = await openPlayer(name, club), date = isoDate(profile.date());
  const {sub} = await peekActions(['Transfer', 'Loan Status']);
  if (!sub.includes('Available for loan')) throw new NeedsAnalyst(`No "Available for loan" for ${name}`, {options: sub});
  const entry = {action: 'loan-list', name, club, date, why};
  if (dryRun) return {...entry, dryRun: true};
  await actionPath(['Transfer', 'Loan Status', 'Available for loan']);
  // "Set Loan Status: Are you sure you want to change the loan status of <name>?" Yes / No.
  await waitFor(x => x.hasText('Set Loan Status') && x.buttons('Yes').length === 1, {what: 'Set Loan Status dialog'});
  await click('Yes');
  await waitFor(x => !x.hasText('Set Loan Status'), {what: 'Set Loan Status closed'});
  loanlist.add({name, club, listed: date, why});
  await log(entry);
  return {...entry, listed: true};
}
