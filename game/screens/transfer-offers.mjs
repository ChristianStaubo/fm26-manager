// Handlers for transfer screens that stop the game (NeedAction): bids for our players and
// agent payoff demands. Each handler: match(screen) → bool, run(screen, {dryRun}) → outcome.
// Decisions come from decide.mjs + policy.json; anything outside the rules throws NeedsAnalyst.
import {Screen, waitFor, click, setFee, NeedsAnalyst, parseMoney, parseRange, parseDate, isoDate} from '../ui/index.mjs';
import {decideSale, decidePayoff, decideLoan, loadRules} from '../../capabilities/sell/decide.mjs';
import {negotiate, offerValueRange, defaultMax, buyStep} from '../../capabilities/buy/buy.mjs';
import {log, history} from '../../capabilities/log.mjs';
import * as pricebook from '../../capabilities/value/pricebook.mjs';
import {gate, load as loadApprovals, mode} from '../../capabilities/approvals.mjs';

// Taking money for a player (accept, or counter = willing to sell at that fee) needs the user's
// approval while autonomy.incoming_offers is 'approve'. Rejecting stays automatic.
// Our sell price (decideSale sellAt, policy selling.sell_ask) is the user's standing approval: a
// counter or accept at or above it needs no per-player approval (user, 2031-07-22).
const approveSale = (player, decision, amount) =>
  ['accept', 'counter'].includes(decision.action) && !(Number.isFinite(decision.sellAt) && amount >= decision.sellAt) && gate('incoming_offers', 'sell', player, {price: amount, what: `${decision.action} ${player} at £${(amount / 1e6).toFixed(2)}M (${decision.reason || 'playbook'})`});

const monthsBetween = (a, b) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());

// Negotiable or not: the offer page shows it as a dropdown labelled "Negotiable" (Man Utd for Doak,
// 2031-06-17), not a text; reading texts only made every offer non-negotiable and rejected it.
export const negotiable = d => {
  const box = d.items.find(i => i.kind === 'dropdown' && /^(Non-)?Negotiable$/i.test(i.label));
  return box ? !/^Non/i.test(box.label) : !d.hasText('Non-Negotiable') && d.hasText('Negotiable');
};

// The GM's answer after Suggest Terms: "Phil Giles General Manager Aston Villa feel the negotiation
// for Ben Gannon Doak is acceptable." (a button).
// Their counter: "… Man Utd have negotiated the offer for Ben Gannon Doak." (the new terms are in the form).
// Final answer: "… Man Utd have submitted a non-negotiable offer for Ben Gannon Doak." (take it or leave it).
export const verdict = s => s.items.find(i => i.kind === 'button' && / (feel the negotiation|have negotiated the offer|have submitted a non-negotiable offer) for /.test(i.label))?.label.replace(/^.*?General Manager /, '') ?? null;

// Read an offer's detail page ("View Offer").
export function readOffer(d, {headClub, shortName, coach}) {
  const player = d.texts().map(t => /^\((.+)\)$/.exec(t)?.[1]).find(Boolean) || shortName;
  const club = headClub || d.after('To', i => i.kind === 'text')?.label;
  const offer = {
    club, player, coach,
    negotiable: negotiable(d),
    guaranteed: parseMoney(d.after('Fee:', i => i.kind === 'text' && parseMoney(i.label) !== null)?.label),
    upfront: parseMoney(d.after('Fee', i => i.kind === 'button' && parseMoney(i.label) !== null)?.label),
    // Everything incl. instalments and add-ons; add-ons count as fee (policy.json addon_weight).
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
  // Headlines: "<Club> make <Player> offer", or "<Club> in offer for <Player>" (LOSC for Franculino, 2030-07-21).
  match: s => (s.buttons('View Offer').length === 1 && s.buttons('Accept').length === 1 && (s.hasText(/ make .+ offer$/) || s.hasText(/^.+ in offer for .+$/)) && !readLoan(s))
    || (s.buttons('Reject Offer').length === 1 && s.hasText('Transfer Value') && s.hasText('Fee:')),
  async run(s, {dryRun = false, upfront} = {}) {
    const headline = s.texts().find(t => / make .+ offer$/.test(t) || /^.+ in offer for .+$/.test(t));
    const [, headClub, shortName] = !headline ? [] : / make .+ offer$/.test(headline) ? / ?(.+?) make (.+) offer$/.exec(headline) : /^(.+) in offer for (.+)$/.exec(headline);
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
    // A book entry without a range (set with --min on an already-listed player) keeps the live range.
    const book = pricebook.lookup(offer.player);
    if (book) Object.assign(offer, {minimum: book.minimum, target: book.target, priceBook: true}, book.range ? {vLow: book.range[0], vHigh: book.range[1]} : {});
    // Not listed: price him now
    // with our Moneyball numbers from the bid's value range — importance, cheapest replacement for
    // his output, contract, age. Worth more to us than the market → minimum above his top → kept.
    else if (Number.isFinite(offer.vLow) && Number.isFinite(offer.vHigh)) {
      const p = pricebook.price(offer.player, [offer.vLow, offer.vHigh], isoDate(d.date()));
      Object.assign(offer, {minimum: p.minimum, target: p.target, moneyball: p.why, keep: p.keep});
    }
    // Days to the window's close: late in the window a listed player goes at his minimum.
    { const {windowEnd} = await import('../../capabilities/season/season.mjs'); const day = d.date(); if (day) offer.daysToClose = Math.round((windowEnd(day) - day) / 864e5); }
    const decision = decideSale(offer);
    // A chosen up-front ask (fm answer --upfront, to probe how far a buyer goes): a counter at that fee.
    // It's a counter even when the rule would accept (Hülsmann, 2032-01-01: --upfront 15m was ignored
    // and Stuttgart's first offer accepted).
    if (Number.isFinite(upfront) && ['counter', 'accept'].includes(decision.action) && upfront > (offer.upfront ?? 0)) {
      const instalments = Math.max(0, offer.guaranteed - offer.upfront);
      Object.assign(decision, {action: 'counter', upfront, guaranteedAsk: upfront + instalments, rule: {action: decision.action, upfront: decision.upfront, guaranteedAsk: decision.guaranteedAsk}, reason: `${decision.reason} (ask set by hand)`});
    }
    const entry = {action: 'incoming-offer', date: isoDate(d.date()), offer, decision};
    if (decision.action === 'escalate' || dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Offer for ${offer.player}: ${decision.reason}`, entry); }
    try { approveSale(offer.player, decision, decision.action === 'counter' ? decision.guaranteedAsk : offer.total ?? offer.guaranteed); }
    catch (e) { await log({...entry, executed: false, approval: e.details}); throw e; }
    if (decision.action === 'counter') {
      // A non-negotiable bid may not take a new fee: then it's a plain reject (the counter is ours to try).
      let fee;
      try { fee = await setFee('Fee', decision.upfront, {mode: 'nearest'}); }
      catch (e) {
        if (offer.negotiable) throw e;
        entry.counterFailed = e.message;
        await click('Reject Offer', {name: 'StandardButton'});
        await log({...entry, executed: true, fellBackTo: 'reject'});
        return {...entry, fellBackTo: 'reject'};
      }
      entry.counterSet = fee.set;
      // Suggest Terms, not Negotiate Offer (user, 2031-06-17): Suggest Terms puts our terms to the buyer
      // and the GM answers on the spot ("<club> feel the negotiation for <player> is acceptable.", with
      // Accept Offer / Reject Offer); Negotiate Offer sends a counter they answer days later. Accept an
      // acceptable answer (the ask was approved above). Any other answer: log it and stop, to learn it.
      // While waiting we only read the screen.
      // A later round still shows the previous answer: wait for a NEW line (round 2 with Man Utd read
      // round 1's "have negotiated" at once and logged our own terms as their reply).
      const before = verdict(await Screen.read());
      await click('Suggest Terms', {name: 'StandardButton'});
      // From here the counter has been put to them: log the round whatever happens next.
      const v = await waitFor(x => verdict(x) && verdict(x) !== before, {what: 'the buyer\'s answer', timeout: 30000}).catch(async e => { await log({...entry, executed: true, verdict: null}); throw e; });
      entry.verdict = verdict(v);
      // "<club> have negotiated the offer for <player>." (Man Utd, 2031-06-17): their counter is written
      // into the form. Record it as their reply and stop; the next call decides round 2 on it.
      if (/have negotiated the offer for |non-negotiable offer for /.test(entry.verdict)) {
        const r = readOffer(v, {headClub: offer.club, shortName: offer.player, coach: ''});
        entry.reply = {upfront: r.upfront, guaranteed: r.guaranteed, total: r.total};
      }
      if (!/is acceptable\.?$/.test(entry.verdict)) { await log({...entry, executed: true}); throw new NeedsAnalyst(`Counter for ${offer.player}: ${entry.verdict}`, entry); }
      await click('Accept Offer');
      entry.accepted = true;
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
    // Our bid: its approval (the player named in the headline) caps what we pay.
    const approved = mode('buy') === 'auto' ? null : loadApprovals().approvals.find(a => a.kind === 'buy' && s.texts().some(t => t.includes(a.player)));
    if (mode('buy') !== 'auto' && !approved) throw new NeedsAnalyst(`${headline}: needs the user's approval (no fm approve buy for this player)`, {approval: 'missing', headline});
    const max = Math.min(defaultMax({valueRange}), approved?.limit ?? Infinity);
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
    age: Number(/^(\d+) year-old/.exec(s.texts().find(t => /^\d+ year-old /.test(t)) || '')?.[1] ?? NaN),
    // A "mandatory future fee" is an obligation to buy (Al-Ahli for Schade, £43.5M, 2026-07): the
    // future fee only counts as an option when nothing calls it mandatory/obligatory.
    obligationFee: clause(/[Oo]bligat|[Mm]andatory/), optionFee: clause(/[Oo]ption(al)? to buy|[Oo]ptional .*fee|^(?!.*[Mm]andatory).*[Ff]uture [Ff]ee/)};
}

export const loanOffer = {
  name: 'loan-offer',
  match: s => s.buttons('Accept').length === 1 && s.buttons('Reject').length === 1 && s.buttons('View Offer').length === 1 && !!readLoan(s),
  async run(s, {dryRun = false} = {}) {
    const loan = readLoan(s), book = pricebook.lookup(loan.player);
    // A youth player's loan approach (Wellington for Sullivan, 2030-07-21): the youth rule, not the
    // first-team plain-loan escalation.
    const sell = loadRules().selling;
    if (loan.age <= sell.youth_max_age) {
      const share = Number(/(\d+)%/.exec(loan.salaryPct || '')?.[1] ?? NaN) / 100;
      return youthDecision({kind: 'loan-offer', date: isoDate(s.date()), club: loan.club, player: loan.player, wageShare: share, loan}, {dryRun});
    }
    const o = {...loan, ...(book ? {priceBook: true, minimum: book.minimum, target: book.target, ...(book.range ? {vLow: book.range[0], vHigh: book.range[1]} : {})} : {}), negotiable: false, countersSoFar: 0};
    const decision = decideLoan(o);
    const entry = {action: 'loan-offer', date: isoDate(s.date()), loan, decision};
    // An obligation without a price book entry: the detail page has the range and the total.
    if (loan.obligationFee && !book && !dryRun) {
      await click('View Offer');
      const page = await waitFor(x => loanOfferPage.match(x), {what: 'loan offer page', timeout: 15000});
      return loanOfferPage.run(page);
    }
    // A counter on a loan (its obligation fee) isn't automated yet: stop rather than reject (user, 2031-07-22).
    if (['escalate', 'counter'].includes(decision.action) || !book || dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Loan approach for ${loan.player} (${loan.club}): ${decision.reason}`, entry); }
    try { approveSale(loan.player, decision, (loan.obligationFee ?? 0) + (loan.loanFee ?? 0)); }
    catch (e) { await log({...entry, executed: false, approval: e.details}); throw e; }
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
      ...(book ? {priceBook: true, minimum: book.minimum, target: book.target} : {})});
    if (['escalate', 'counter'].includes(entry.decision.action) || dryRun) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Loan-to-buy for ${l.player}: ${entry.decision.reason}`, entry); }
    try { approveSale(l.player, entry.decision, l.overall); }
    catch (e) { await log({...entry, executed: false, approval: e.details}); throw e; }
    await click(entry.decision.action === 'accept' ? 'Accept Offer' : 'Reject Offer');
    await log({...entry, executed: true});
    return entry;
  },
};

// A loan offer message for a youth player ("Adelaide loan offer for Sullivan", 2030-07-18): blocks
// Continue. Youth deals are the user's delegated staff's (playbook §5), but offers made before the
// delegation still land here. Supervisor rule (2026-10-15, logged for the user's review): accept a
// loan paying at least policy.selling.youth_loan_min_wage_share of his wage (he plays, he develops),
// reject the rest. Players over youth_max_age are first-team: the user decides.
export function readYouthLoan(s) {
  const head = s.texts().map(t => /^(.+) loan offer for (.+)$/.exec(t)).find(Boolean);
  if (!head) return null;
  const val = label => s.after(label, i => i.kind === 'text')?.label;
  const age = Number(/^(\d+) year-old/.exec(s.texts().find(t => /^\d+ year-old /.test(t)) || '')?.[1] ?? NaN);
  return {club: head[1], player: head[2], age, fee: parseMoney(val('Fee') ?? '') ?? 0,
    wageShare: Number(/(\d+)%/.exec(val('Playing Salary Percentage') || '')?.[1] ?? NaN) / 100, duration: val('Duration')};
}
export const youthLoanOffer = {
  name: 'youth-loan-offer',
  match: s => s.buttons('Accept').length === 1 && s.buttons('Reject').length === 1 && s.buttons('View Offer').length === 1 && !!readYouthLoan(s),
  async run(s, {dryRun = false} = {}) {
    const l = readYouthLoan(s), sell = loadRules().selling;
    const entry = {action: 'youth-loan-offer', date: isoDate(s.date()), loan: l};
    if (!(l.age <= sell.youth_max_age)) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Loan offer for ${l.player} (${l.age}, first team): the user decides`, entry); }
    return youthDecision({kind: 'youth-loan-offer', date: entry.date, club: l.club, player: l.player, wageShare: l.wageShare, loan: l}, {dryRun});
  },
};
// The youth loan rule, shared by both message layouts ("<Club> loan offer for X", "<Club> make loan
// approach for X"): accept at youth_loan_min_wage_share of his wage or more, else reject.
async function youthDecision({kind, date, club, player, wageShare, loan}, {dryRun}) {
  const sell = loadRules().selling;
  const entry = {action: kind, date, loan, youth: true};
  if (!Number.isFinite(wageShare)) { await log({...entry, executed: false}); throw new NeedsAnalyst(`Youth loan for ${player}: wage share unreadable`, entry); }
  entry.decision = wageShare >= sell.youth_loan_min_wage_share ? 'accept' : 'reject';
  entry.why = `${Math.round(wageShare * 100)}% of his wage vs ${Math.round(sell.youth_loan_min_wage_share * 100)}% (supervisor rule)`;
  if (dryRun) return {...entry, dryRun: true};
  await click(entry.decision === 'accept' ? 'Accept' : 'Reject');
  await log({...entry, executed: true});
  const {record} = await import('../../capabilities/interventions.mjs');
  record({capability: 'sell', kind: 'supervisor-decision', date, decided: `${entry.decision} ${club} loan for ${player}: ${entry.why}`});
  return entry;
}

/** Loan a signing back to his old club? Only when the buy was meant to develop away (approval note:
 *  portfolio / wonderkid / loan back), never a signing bought to play now. */
export const loanBackWanted = (approval, buying = {}) =>
  buying.accept_loan_back !== false && new RegExp(buying.loan_back_notes || 'portfolio|wonderkid|loan.?back', 'i').test(approval?.note || '');

// The selling club asks to loan our signing back ("1. FC Nürnberg ask for Miceli loan back", 2030-07-21):
// Accept / Reject Loan Back. The user (2026-10-15): "ideally their club asks for the loan back, and we
// accept that": the kid plays and develops. policy.buying.accept_loan_back.
export const loanBackRequest = {
  name: 'loan-back-request',
  match: s => s.buttons('Accept Loan Back').length === 1 && s.buttons('Reject Loan Back').length === 1,
  async run(s, {dryRun = false} = {}) {
    const head = s.texts().map(t => /^(.+) ask for (.+) loan back$/.exec(t)).find(Boolean);
    const entry = {action: 'loan-back', date: isoDate(s.date()), club: head?.[1], player: head?.[2],
      playingTime: s.after('Agreed Playing Time', i => i.kind === 'text')?.label, salaryPct: s.after('Salary Percentage', i => i.kind === 'text')?.label};
    // Only a portfolio/youth buy goes back on loan. A first-team signing stays: Gallardo (our RW
    // starter), Sayman and Carroll were loaned back to their clubs on 2031-07-02 under the old
    // accept-all rule. The buy's approval note says which it is.
    const approval = loadApprovals().approvals.find(a => a.kind === 'buy' && entry.player && a.player.toLowerCase().endsWith(entry.player.toLowerCase()));
    entry.approvalNote = approval?.note ?? null;
    const accept = loanBackWanted(approval, loadRules().buying);
    entry.decision = accept ? 'accept' : 'reject';
    if (dryRun) return {...entry, dryRun: true};
    await click(accept ? 'Accept Loan Back' : 'Reject Loan Back');
    await log({...entry, executed: true});
    return entry;
  },
};

export const HANDLERS = [loanOfferPage, loanBackRequest, youthLoanOffer, incomingOffer, agentPayoff, bidResponse, loanOffer];
