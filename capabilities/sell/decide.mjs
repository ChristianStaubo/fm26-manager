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
 *         monthsLeft, total, priceBook, minimum, target, daysToClose, importance, blockers, paid, age}
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
  // Prices are TOTALS, add-ons included (user, 2032-02-02: Güreler "£30M total comp"): a counter at
  // `target` asks for target minus the add-ons they already offer, as fee + instalments.
  const raw = offer.guaranteed, instalments = Math.max(0, raw - (o.upfront ?? raw)), addOns = o.guaranteed - raw;
  const counter = (target, minRaise = 1) => {
    const ask = tidy(Math.max(target - addOns, raw * minRaise));
    return {action: 'counter', upfront: ask - instalments, guaranteedAsk: ask, totalAsk: ask + addOns};
  };

  // Never just reject a bid (user, 2031-07-22): counter at the price we'd sell him for. If they say
  // no, it's the same as a rejection; if they say yes, we've sold at a profit. Kayode (bid £61.5M,
  // value £63-75M, release clause £95M) → counter ~£95M; Kislyak (bid £34M, value £39M) → £50-55M.
  // A reject only ends a deal whose counters are spent. Non-negotiable bids are countered too (the
  // handler falls back to Reject if the page won't take a fee).
  const counters = Number.isFinite(p.max_counters) ? p.max_counters : 3;
  // Listed (price book): we want to sell, but for the most we can get (user, 2032-01-04: "we could get
  // more for Fresneda", sold at his minimum to the first non-negotiable bid). Accept outright only at
  // the target; negotiable bids are countered from sell_ask x his value down to the target, then the
  // minimum; a non-negotiable bid below the target waits for better ones until the window's last days
  // (policy selling.late_window_days), then anything at the minimum is taken.
  if (o.priceBook && Number.isFinite(o.minimum)) {
    const target = Math.max(o.target ?? 0, o.minimum), late = Number.isFinite(o.daysToClose) && o.daysToClose <= (p.late_window_days ?? 7);
    if (o.guaranteed >= target) return {action: 'accept', reason: `>= our target ${target}`};
    if (late && o.guaranteed >= o.minimum) return {action: 'accept', reason: `>= our minimum ${o.minimum}, ${o.daysToClose} days to the deadline`};
    if (!o.negotiable) return {action: 'reject', reason: late ? `non-negotiable, below our minimum ${o.minimum}` : `non-negotiable, below our target ${target}: wait for better bids (${o.daysToClose ?? '?'} days left)`};
    if (o.countersSoFar < counters) {
      const aims = [Math.max(target, o.vHigh * p.sell_ask), target, Math.max(o.minimum, (target + o.minimum) / 2)];
      return {...counter(aims[Math.min(o.countersSoFar, 2)], p.min_raise_over_offer), reason: `below our target ${target}: counter ${o.countersSoFar + 1}`};
    }
    return o.guaranteed >= o.minimum ? {action: 'accept', reason: `counters spent, >= our minimum ${o.minimum}`} : {action: 'reject', reason: `below our minimum ${o.minimum}, counters spent`};
  }
  // Not listed: our sell price depends on how much we need him (user, 2032-02-02, Güreler: depth,
  // how good he is, what we paid). policy selling.sell_ask_by_need x the top of his value:
  //   core    = a starter, or no comparable replacement in the squad (blockers): not for sale cheap
  //   depth   = rotation: his value
  //   surplus = fringe: a little under it
  // Never below what we paid, unless he's 30+ or in his last year; a last-year contract sells at the
  // bottom of his range. Selling a core player needs a replacement (flagged).
  const need = o.blockers?.length ? 'core'
    : ['strong rotation', 'rotation', 'weak starter'].includes(o.importance) ? 'depth' : o.importance === 'fringe' ? 'surplus' : 'core';
  const mult = (p.sell_ask_by_need || {})[need] ?? p.sell_ask;
  const paidFloor = Number.isFinite(o.paid) && !(o.age >= 30) && !expiring ? o.paid * (p.paid_floor ?? 1) : 0;
  const sellAt = tidy(expiring ? o.vLow : Math.max(o.vHigh * mult, paidFloor, need === 'core' && Number.isFinite(o.minimum) ? o.minimum * p.min_raise_over_offer : 0));
  const tag = {sellAt, need, replace: need === 'core'};
  if (o.guaranteed >= sellAt) return {action: 'accept', reason: `>= our sell price ${sellAt} (${need})${need === 'core' ? ': replacement needed' : ''}`, ...tag};
  if (o.countersSoFar < counters) return {...counter(sellAt, p.min_raise_over_offer), reason: `not for sale below ${sellAt} (${need}): counter ${o.countersSoFar + 1}`, ...tag};
  return {action: 'reject', reason: `below our sell price ${sellAt} (${need}), counters spent`, ...tag};
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
  // A plain loan of a player outside our XI with most of his wage paid: accept. He plays, which keeps
  // his value for a sale, and we save wages (Muharemović to Lens, 80%, 2033-01-07, renewed to sell).
  // Money counts either way: a loan fee covers wages too (Sayman to Blackburn, 2033-01-12: £1.6M, 0% of
  // his wage, ~£0.56M of wages to the season's end). wageCost: his wage until the loan ends.
  const min = policy.selling.listed_loan_min_wage_share ?? 0.8;
  const covered = Number.isFinite(l.wageCost) && l.wageCost > 0 ? (fees + (l.wageShare || 0) * l.wageCost) / l.wageCost : l.wageShare;
  if (!l.optionFee && l.starter === false && covered >= min)
    return {action: 'accept', asSale: false, reason: `plain loan, not in our XI, ${Math.round(covered * 100)}% of his wage covered (>= ${Math.round(min * 100)}%)`};
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
