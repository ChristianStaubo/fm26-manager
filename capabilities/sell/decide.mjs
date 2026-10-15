// Pure transfer decisions from playbook/policy.json (no game access). Edit policy.json to change behaviour.
import {readFileSync} from 'node:fs';

// All numbers live in playbook/policy.json (principles: playbook/PLAYBOOK.md).
export const loadPolicy = (path = new URL('../../playbook/policy.json', import.meta.url)) =>
  JSON.parse(readFileSync(path, 'utf8'));
export const loadRules = loadPolicy; // older name

const roundTo = (v, step) => Math.ceil(v / step - 1e-9) * step;
// Fee boxes accept any whole pound; round asks to tidy figures.
const tidy = v => roundTo(v, v >= 1e6 ? 50000 : v >= 1e5 ? 5000 : 1000);

/**
 * Incoming offer for one of our players.
 * offer: {guaranteed, upfront, vLow, vHigh, negotiable, countersSoFar,
 *         monthsLeft, keyPlayer}
 * → {action: 'accept'|'reject'|'counter'|'escalate', upfront?, reason}
 */
export function decideSale(offer, policy = loadRules()) {
  let o = offer;
  const p = policy.selling;
  if (![o.guaranteed, o.vLow, o.vHigh].every(Number.isFinite)) return {action: 'escalate', reason: 'offer or valuation unreadable'};
  // Judge the offer on its value: guaranteed money plus add-ons at addon_weight (o.total is the
  // offer page's "Future & Potential Total Cost with Additional Fees").
  const w = policy.valuation?.addon_weight ?? 1;
  o = {...o, guaranteed: o.guaranteed + w * Math.max(0, (o.total ?? o.guaranteed) - o.guaranteed)};
  const expiring = Number.isFinite(o.monthsLeft) && o.monthsLeft < 12;
  // Counters ask on the GUARANTEED money (fee + instalments); their add-ons stay on top as a bonus.
  // Doak (2031-06-17): Villa offered £27.5M + £7.75M instalments + £4.4M add-ons; the user asked
  // £40M up front (£47.75M guaranteed) and Villa accepted at once. Counting the add-ons as fee here
  // would have asked only £36M up front.
  const raw = offer.guaranteed, instalments = Math.max(0, raw - (o.upfront ?? raw));
  const counter = (target, minRaise = 1) => {
    const ask = tidy(Math.max(target, raw * minRaise));
    return {action: 'counter', upfront: ask - instalments, guaranteedAsk: ask};
  };

  // Never just reject a bid (user, 2031-07-22): counter at the price we'd sell him for. If they say
  // no, it's the same as a rejection; if they say yes, we've sold at a profit. Kayode (bid £61.5M,
  // value £63-75M, release clause £95M) → counter ~£95M; Kislyak (bid £34M, value £39M) → £50-55M.
  // A reject only ends a deal whose counters are spent. Non-negotiable bids are countered too (the
  // handler falls back to Reject if the page won't take a fee).
  const counters = Number.isFinite(p.max_counters) ? p.max_counters : 3;
  // Listed (price book): we want to sell; our asking price (target) and minimum decide.
  if (o.priceBook && Number.isFinite(o.minimum)) {
    if (o.guaranteed >= o.minimum) return {action: 'accept', reason: `>= our minimum ${o.minimum}`};
    if (o.countersSoFar < counters) {
      // First counter at the target; later ones step halfway towards the minimum.
      const aim = o.countersSoFar === 0 ? o.target : Math.max(o.minimum, (o.target + o.minimum) / 2);
      return {...counter(aim, p.min_raise_over_offer), reason: `below our minimum ${o.minimum}: counter ${o.countersSoFar + 1}`};
    }
    return {action: 'reject', reason: `below our minimum ${o.minimum}, counters spent`};
  }
  // Not listed: he's for sale only at our price: sell_ask x the top of his value (above our own
  // minimum, which counts what he's worth to us).
  // A contract in its last year sells for what it is: the bottom of his range.
  const sellAt = tidy(expiring ? o.vLow : Math.max(o.vHigh * p.sell_ask, Number.isFinite(o.minimum) ? o.minimum * p.min_raise_over_offer : 0));
  if (o.guaranteed >= sellAt) return {action: 'accept', reason: `>= our sell price ${sellAt}`, sellAt};
  if (o.countersSoFar < counters) return {...counter(sellAt, p.min_raise_over_offer), reason: `not for sale below ${sellAt}: counter ${o.countersSoFar + 1}`, sellAt};
  return {action: 'reject', reason: `below our sell price ${sellAt}, counters spent`, sellAt};
}

/**
 * Loan offer for one of our players (user rule, 2026-10-08).
 * loan: {loanFee, monthlyFee, months, obligationFee?, optionFee?, ...offer fields for decideSale}
 * With an obligation to buy it is a sale: everything guaranteed is summed and decided by
 * decideSale (price-book minimum included). Option-only or no buy clause: a plain loan → escalate.
 */
export function decideLoan(l, policy = loadRules()) {
  const fees = (l.loanFee || 0) + (l.monthlyFee || 0) * (l.months || 0);
  if (Number.isFinite(l.obligationFee) && l.obligationFee > 0) {
    const guaranteed = fees + l.obligationFee;
    const d = decideSale({...l, guaranteed, upfront: l.loanFee || 0}, policy);
    return {...d, asSale: true, guaranteed, reason: `loan with obligation to buy = sale of ${guaranteed}: ${d.reason}`};
  }
  return {action: 'escalate', asSale: false, reason: l.optionFee ? `loan with an option (not obligation) to buy ${l.optionFee}: decide on wage relief and depth` : 'plain loan: decide on wage relief and depth'};
}

/** Agent payoff demand. reply is the agent's answer to our counter, if any. */
export function decidePayoff({ask, reply}, policy = loadRules()) {
  const p = policy.agent_payoff;
  if (!Number.isFinite(ask)) return {action: 'escalate', reason: 'payoff unreadable'};
  if (reply === undefined) return {action: 'counter', amount: Math.floor(ask * p.counter_at), reason: `counter at ${p.counter_at} x ask`};
  return reply <= ask * p.accept_at_or_below ? {action: 'accept', reason: `reply ${reply} <= ${p.accept_at_or_below} x ask`}
    : {action: 'escalate', reason: `reply ${reply} still above ${p.accept_at_or_below} x ask`};
}
