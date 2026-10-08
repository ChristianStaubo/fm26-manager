// Handlers for transfer screens that stop the game (NeedAction): bids for our players and
// agent payoff demands. Each handler: match(screen) → bool, run(screen, {dryRun}) → outcome.
// Decisions come from decide.mjs + rules.json; anything outside the rules throws NeedsAnalyst.
import {Screen, waitFor, click, setFee, NeedsAnalyst, parseMoney, parseRange, parseDate, isoDate} from '../../ui/index.mjs';
import {decideSale, decidePayoff, decideLoan} from './decide.mjs';
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
    // Everything incl. instalments and add-ons; add-ons count as fee (rules.json addon_weight).
    total: parseMoney(d.after('Future & Potential Total Cost with Additional Fees:', i => i.kind === 'text' && parseMoney(i.label) !== null)?.label),
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
    // The details page can take a few seconds; a View Offer press is sometimes ignored (Collins,
    // 2026-07-07: timed out). Wait longer, then press once more if it is still on the message.
    const details = x => x.buttons('Reject Offer').length === 1 && x.hasText('Fee:');
    if (!s.buttons('Reject Offer').length) await click('View Offer');
    let d = await waitFor(details, {what: 'offer details', timeout: 12000}).catch(() => null);
    if (!d) { if ((await Screen.read()).buttons('View Offer').length) await click('View Offer'); d = await waitFor(details, {what: 'offer details', timeout: 12000}); }
    const offer = readOffer(d, {headClub, shortName, coach});
    offer.countersSoFar = (await history()).filter(e => e.action === 'incoming-offer' && e.offer?.player === offer.player && e.offer?.club === offer.club && e.decision?.action === 'counter' && e.executed).length;
    // Listed through the price book: decide against our minimum, with the range recorded at listing.
    const book = pricebook.lookup(offer.player);
    if (book) Object.assign(offer, {minimum: book.minimum, target: book.target, vLow: book.range[0], vHigh: book.range[1], priceBook: true});
    // Not listed (user policy 2026-10-09: we don't list; we judge bids as they come): price him now
    // with our Moneyball numbers from the bid's value range — importance, cheapest replacement for
    // his output, contract, age. Worth more to us than the market → minimum above his top → kept.
    else if (Number.isFinite(offer.vLow) && Number.isFinite(offer.vHigh)) {
      const p = pricebook.price(offer.player, [offer.vLow, offer.vHigh], isoDate(d.date()));
      Object.assign(offer, {minimum: p.minimum, target: p.target, moneyball: p.why, keep: p.keep});
    }
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

// Loan approach for one of our players: "<Club> make loan approach for <Player>", fields as text
// (Fee, Duration, Playing/Unused Monthly Fee, salary %), Accept / Reject / View Offer.
// Obligation to buy → a sale (decideLoan, user rule); plain loans and options stop for a decision
// with the parsed numbers (seen: Milambo, Norwich and Leicester, 2026-06/07, no buy clause).
export function readLoan(s) {
  const head = s.texts().map(t => /^(.+) make loan approach for (.+)$/.exec(t)).find(Boolean);
  if (!head) return null;
  const money = label => parseMoney(s.after(label, i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  const clause = re => { const t = s.texts().find(x => re.test(x)); return t ? (parseMoney(t) ?? money(t)) : undefined; };
  const today = s.date(), duration = s.after('Duration', i => i.kind === 'text')?.label;
  const seasonEnd = today && new Date(Date.UTC(today.getUTCFullYear() + (today.getUTCMonth() >= 5 ? 1 : 0), 4, 31));
  const months = duration === 'End of season' && seasonEnd ? monthsBetween(today, seasonEnd) : undefined;
  return {club: head[1], player: head[2], loanFee: money('Fee') ?? 0, monthlyFee: money('Playing Monthly Fee') ?? 0,
    unusedMonthlyFee: money('Unused Monthly Fee'), months, duration,
    salaryPct: s.after('Playing Salary Percentage', i => i.kind === 'text')?.label,
    playingTime: s.after('Agreed Playing Time', i => i.kind === 'text')?.label,
    // A "mandatory future fee" is an obligation to buy (Al-Ahli for Schade, £43.5M, 2026-07): the
    // future fee only counts as an option when nothing calls it mandatory/obligatory.
    obligationFee: clause(/[Oo]bligat|[Mm]andatory/), optionFee: clause(/[Oo]ption(al)? to buy|[Oo]ptional .*fee|^(?!.*[Mm]andatory).*[Ff]uture [Ff]ee/)};
}

export const loanOffer = {
  name: 'loan-offer',
  match: s => s.buttons('Accept').length === 1 && s.buttons('Reject').length === 1 && s.buttons('View Offer').length === 1 && !!readLoan(s),
  async run(s, {dryRun = false} = {}) {
    const loan = readLoan(s), book = pricebook.lookup(loan.player);
    const o = {...loan, ...(book ? {minimum: book.minimum, target: book.target, vLow: book.range[0], vHigh: book.range[1]} : {}), negotiable: false, countersSoFar: 0};
    const decision = decideLoan(o);
    const entry = {action: 'loan-offer', date: isoDate(s.date()), loan, decision};
    // An obligation without a price book entry: the detail page has the range and the total.
    if (loan.obligationFee && !book && !dryRun) {
      await click('View Offer');
      const page = await waitFor(x => loanOfferPage.match(x), {what: 'loan offer page', timeout: 15000});
      return loanOfferPage.run(page);
    }
    if (decision.action === 'escalate' || !book || dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Loan approach for ${loan.player} (${loan.club}): ${decision.reason}`, entry); }
    await click(decision.action === 'accept' ? 'Accept' : 'Reject');
    await log({...entry, executed: true});
    return entry;
  },
};

// The loan offer's detail page (View Offer): "Loan-to-buy Fees", "Mandatory Future Fee", "Overall
// Cost if deal becomes permanent (Including Monthly Contributions): £15.25M", the player's Salary and
// Transfer Value, Playing Salary Percentage. Accept Offer / Reject Offer.
// Value to us = overall cost + wage relief (their share of his wage until the season ends).
// Mandatory future fee → judged as a sale (user rule); option-only → stop for a decision.
// Aston Villa for Milambo, 2026-07-22: £15.25M + ~£1.5M relief vs £16-18.5M → accepted.
export function readLoanPage(s) {
  if (!s.hasText('Loan-to-buy Fees') && !s.hasText(/^Overall Cost if deal becomes permanent/)) return null;
  const player = s.texts().map(t => /^\((.+)\)$/.exec(t)?.[1]).find(Boolean);
  const overall = parseMoney(s.after(/^Overall Cost if deal becomes permanent/, i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  const value = s.after('Transfer Value', i => i.kind === 'button' && parseMoney(i.label) !== null)?.label;
  const range = parseRange(value) || (parseMoney(value) !== null ? [parseMoney(value), parseMoney(value)] : null);
  const wage = parseMoney(s.after('Salary', i => i.kind === 'button' && /p\/w/.test(i.label))?.label);
  const pct = Number(/(\d+)%/.exec(s.after('Playing Salary Percentage', i => /\d+%/.test(i.label))?.label || '')?.[1] ?? 0) / 100;
  const today = s.date(), end = today && new Date(Date.UTC(today.getUTCFullYear() + (today.getUTCMonth() >= 5 ? 1 : 0), 4, 31));
  const weeks = today && end ? Math.max(0, Math.round((end - today) / 6048e5)) : 0;
  return {player, club: s.after('To', i => i.kind === 'text')?.label, overall, range, wage, wageShare: pct, weeks,
    wageRelief: Math.round((wage || 0) * pct * weeks), mandatory: s.hasText('Mandatory Future Fee')};
}

export const loanOfferPage = {
  name: 'loan-offer-page',
  match: s => s.buttons('Accept Offer').length === 1 && s.buttons('Reject Offer').length === 1 && !!readLoanPage(s),
  async run(s, {dryRun = false} = {}) {
    const l = readLoanPage(s), book = pricebook.lookup(l.player);
    const entry = {action: 'loan-offer', date: isoDate(s.date()), loan: l};
    if (!l.mandatory) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Loan for ${l.player} (${l.club}) has no obligation to buy: decide on wage relief and depth`, entry); }
    const [vLow, vHigh] = book ? book.range : (l.range || [NaN, NaN]);
    entry.decision = decideSale({guaranteed: (l.overall ?? NaN) + l.wageRelief, vLow, vHigh, negotiable: false, countersSoFar: 0,
      ...(book ? {minimum: book.minimum, target: book.target} : {})});
    if (entry.decision.action === 'escalate' || dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Loan-to-buy for ${l.player}: ${entry.decision.reason}`, entry); }
    await click(entry.decision.action === 'accept' ? 'Accept Offer' : 'Reject Offer');
    await log({...entry, executed: true});
    return entry;
  },
};

export const HANDLERS = [loanOfferPage, incomingOffer, agentPayoff, bidResponse, loanOffer];
