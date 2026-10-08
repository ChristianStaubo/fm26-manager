// Handlers for transfer screens that stop the game (NeedAction): bids for our players and
// agent payoff demands. Each handler: match(screen) → bool, run(screen, {dryRun}) → outcome.
// Decisions come from decide.mjs + rules.json; anything outside the rules throws NeedsAnalyst.
import {Screen, waitFor, click, setFee, NeedsAnalyst, parseMoney, parseRange, parseDate, isoDate} from '../../ui/index.mjs';
import {decideSale, decidePayoff} from './decide.mjs';
import {negotiate, offerValueRange, defaultMax, buyStep} from './buy.mjs';
import {log, history} from '../log.mjs';
import * as pricebook from './pricebook.mjs';

const monthsBetween = (a, b) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());

// Read an offer's detail page ("View Offer").
function readOffer(d, {headClub, shortName, coach}) {
  const player = d.texts().map(t => /^\((.+)\)$/.exec(t)?.[1]).find(Boolean) || shortName;
  const club = headClub || d.after('To', i => i.kind === 'text')?.label;
  const offer = {
    club, player, coach,
    negotiable: !d.hasText('Non-Negotiable') && d.hasText('Negotiable'),
    guaranteed: parseMoney(d.after('Fee:', i => i.kind === 'text' && parseMoney(i.label) !== null)?.label),
    upfront: parseMoney(d.after('Fee', i => i.kind === 'button' && parseMoney(i.label) !== null)?.label),
    keyPlayer: /\b(key|star|important|regular starter)\b/i.test(coach),
  };
  // The value is a range ("£49M - £60M"), or one amount when the player is listed (his asking
  // price) or valued exactly: Thiago, listed, showed "£63M" (2026-06-25). One amount = [v, v].
  const value = d.after('Transfer Value', i => i.kind === 'button' && parseMoney(i.label) !== null)?.label;
  const range = parseRange(value), single = parseMoney(value);
  [offer.vLow, offer.vHigh] = range || (single !== null ? [single, single] : [NaN, NaN]);
  if (!range && single !== null) offer.valueSingle = true;
  const expires = parseDate(d.after('Contract Expires', i => parseDate(i.label) !== null)?.label), today = d.date();
  if (expires && today) offer.monthsLeft = monthsBetween(today, expires);
  return offer;
}

export const incomingOffer = {
  name: 'incoming-offer',
  // Either the offer message (Accept / Reject / View Offer) or the offer detail page.
  match: s => (s.buttons('View Offer').length === 1 && s.buttons('Accept').length === 1 && s.hasText(/ make .+ offer$/))
    || (s.buttons('Reject Offer').length === 1 && s.hasText('Transfer Value') && s.hasText('Fee:')),
  async run(s, {dryRun = false} = {}) {
    const headline = s.texts().find(t => / make .+ offer$/.test(t));
    const [, headClub, shortName] = headline ? / ?(.+?) make (.+) offer$/.exec(headline) : [];
    const coach = s.items.find(i => i.kind === 'button' && i.label.startsWith('Coach Report'))?.label || '';
    if (!s.buttons('Reject Offer').length) await click('View Offer');
    const d = await waitFor(x => x.buttons('Reject Offer').length === 1 && x.hasText('Fee:'), {what: 'offer details'});
    const offer = readOffer(d, {headClub, shortName, coach});
    offer.countersSoFar = (await history()).filter(e => e.action === 'incoming-offer' && e.offer?.player === offer.player && e.offer?.club === offer.club && e.decision?.action === 'counter' && e.executed).length;
    // Listed through the price book: decide against our minimum, with the range recorded at listing.
    const book = pricebook.lookup(offer.player);
    if (book) Object.assign(offer, {minimum: book.minimum, target: book.target, vLow: book.range[0], vHigh: book.range[1], priceBook: true});
    const decision = decideSale(offer);
    const entry = {action: 'incoming-offer', date: isoDate(d.date()), offer, decision};
    if (decision.action === 'escalate' || dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Offer for ${offer.player}: ${decision.reason}`, entry); }
    if (decision.action === 'counter') {
      const fee = await setFee('Fee', decision.upfront, {mode: 'nearest'});
      entry.counterSet = fee.set;
      await click('Negotiate Offer');
    } else await click(decision.action === 'accept' ? 'Accept Offer' : 'Reject Offer');
    await log({...entry, executed: true});
    return entry;
  },
};

export const agentPayoff = {
  name: 'agent-payoff',
  match: s => s.buttons('Accept Payoff').length >= 1 && s.buttons('Negotiate').length === 1 && s.buttons('Reject Payoff').length >= 1,
  async run(s, {dryRun = false} = {}) {
    const ask = parseMoney(s.texts().find(t => /payment of £|payoff of £/.test(t)));
    const player = s.texts().map(t => /^(.+) demands compensation/.exec(t)?.[1]).find(Boolean);
    const first = decidePayoff({ask});
    const entry = {action: 'agent-payoff', date: isoDate(s.date()), player, ask, decision: first};
    if (first.action !== 'counter' || dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Payoff for ${player}: ${first.reason}`, entry); }
    await click('Negotiate');
    await waitFor(x => x.hasText('Compensation') && x.buttons('Suggest Terms').length + x.buttons('Accept Payoff').length > 0, {what: 'payoff negotiation'});
    // Typed amounts become £0 on this screen: presets + ± only (setFee).
    const fee = await setFee('Compensation', first.amount, {mode: 'nearest'});
    entry.counterSet = fee.set;
    await click('Suggest Terms', {name: 'StandardButton'});
    const r = await waitFor(x => x.hasText(/payoff of £.+ is suitable|accept/i), {what: 'agent reply'});
    const reply = parseMoney(r.texts().find(t => /payoff of £.+ is suitable/.test(t)));
    const second = decidePayoff({ask, reply: reply ?? undefined});
    Object.assign(entry, {reply, decision: second});
    if (reply === null || second.action !== 'accept') { await log({...entry, executed: false}); throw new NeedsAnalyst(`Payoff reply for ${player}: ${reply === null ? 'unreadable' : second.reason}`, entry); }
    // Two "Accept Payoff" buttons exist: the negotiation panel's (StandardButton) accepts the
    // negotiated amount; the other accepts the original demand.
    await click('Accept Payoff', {name: 'StandardButton'});
    await log({...entry, executed: true});
    return entry;
  },
};

// A club answers one of our bids ("<Club> respond to <Player> offer"): Accept / Withdraw /
// View Offer. View Offer opens the negotiation screen already countered; continue there with
// the same rules as `fm buy` (accept a demand ≤ 1.1 × top of value, else one final offer, else walk away).
export const bidResponse = {
  name: 'bid-response',
  // Headlines vary ("X respond to Y offer", "Y offer negotiated"); the body says "X want £N for Y".
  // Wording varies ("X want £N for Y", "X will settle for a deal worth …"). The buttons don't:
  // replies to OUR bids have Accept / Withdraw / View Offer (bids for our players: Accept / Reject).
  match: s => s.buttons('View Offer').length === 1 && s.buttons('Withdraw').length === 1 && s.buttons('Accept').length === 1,
  async run(s, {dryRun = false} = {}) {
    const headline = s.texts().find(t => / want £| will settle for | respond to | offer negotiated/.test(t)) || 'bid reply';
    await click('View Offer');
    const o = await waitFor(x => x.buttons(/^(Accept Demands|Suggest Terms|Make Offer)$/).length > 0 && x.hasText('Transfer Value'), {what: 'offer screen'});
    const valueRange = offerValueRange(o);
    if (!valueRange) throw new NeedsAnalyst(`${headline}: no valuation on the offer screen`);
    const max = defaultMax({valueRange});
    const entry = {action: 'bid-response', date: isoDate(o.date()), headline, valueRange, max};
    if (dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`${headline} (dry run)`, entry); }
    const r = await negotiate({firstFee: null, max, step: buyStep({valueRange}), rounds: 3});
    await log({...entry, ...r, executed: true});
    return {...entry, ...r};
  },
};

export const HANDLERS = [incomingOffer, agentPayoff, bidResponse];
