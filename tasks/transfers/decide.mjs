// Pure transfer decisions from rules.json (no game access). Edit rules.json to change behaviour.
import {readFileSync} from 'node:fs';

export const loadRules = (path = new URL('./rules.json', import.meta.url)) =>
  JSON.parse(readFileSync(path, 'utf8'));

const roundTo = (v, step) => Math.ceil(v / step - 1e-9) * step;
// Fee boxes accept any whole pound; round asks to tidy figures.
const tidy = v => roundTo(v, v >= 1e6 ? 50000 : v >= 1e5 ? 5000 : 1000);

/**
 * Incoming offer for one of our players.
 * offer: {guaranteed, upfront, vLow, vHigh, negotiable, countersSoFar,
 *         monthsLeft, keyPlayer}
 * → {action: 'accept'|'reject'|'counter'|'escalate', upfront?, reason}
 */
export function decideSale(o, policy = loadRules()) {
  const p = policy.selling, esc = policy.escalate;
  if (![o.guaranteed, o.vLow, o.vHigh].every(Number.isFinite)) return {action: 'escalate', reason: 'offer or valuation unreadable'};
  const expiring = Number.isFinite(o.monthsLeft) && o.monthsLeft < 12;
  const floor = expiring ? o.vLow * p.floor.contract_under_12_months : o.vHigh * p.floor.default;
  const instalments = Math.max(0, o.guaranteed - (o.upfront ?? o.guaranteed));
  const counter = (target, minRaise = 1) => {
    const ask = tidy(Math.max(target, o.guaranteed * minRaise));
    return {action: 'counter', upfront: ask - instalments, guaranteedAsk: ask};
  };

  // Rejecting a lowball never loses a player, so it needs no analyst even for big names
  // (Everton bid £1K, non-negotiable, for Thiago, valued £63M: 2026-06-25).
  if (o.guaranteed < o.vLow * p.lowball_reject_below) return {action: 'reject', reason: 'lowball'};
  // Listed through the price book: the analysis was done at listing time (fm sell), so no
  // escalation; our minimum decides. o.minimum / o.target come from pricebook.lookup.
  if (Number.isFinite(o.minimum)) {
    if (o.guaranteed >= o.minimum) return {action: 'accept', reason: `>= our minimum ${o.minimum}`};
    if (o.negotiable && o.countersSoFar < p.max_counters) {
      // First counter at the target; later ones step halfway towards the minimum.
      const aim = o.countersSoFar === 0 ? o.target : Math.max(o.minimum, (o.target + o.minimum) / 2);
      return {...counter(aim, p.min_raise_over_offer), reason: `below our minimum ${o.minimum}: counter ${o.countersSoFar + 1}`};
    }
    return {action: 'reject', reason: `below our minimum ${o.minimum}${o.negotiable ? ', counters spent' : ', non-negotiable'}`};
  }
  if (o.vHigh >= esc.offer_v_high_over) return {action: 'escalate', reason: `valuation above ${esc.offer_v_high_over}`};
  if (o.keyPlayer && esc.key_starter) return {action: 'escalate', reason: 'key player'};
  if (!o.negotiable) {
    const bar = expiring ? floor : o.vHigh * p.non_negotiable_accept_at;
    return o.guaranteed >= bar ? {action: 'accept', reason: `non-negotiable, ${o.guaranteed} >= ${Math.round(bar)}`}
      : {action: 'reject', reason: `non-negotiable, ${o.guaranteed} < ${Math.round(bar)}`};
  }
  if (o.guaranteed < o.vLow * p.lowball_reject_below) return {action: 'reject', reason: 'lowball'};

  const small = o.vHigh < p.small_deal_v_high_under;
  if (o.countersSoFar === 0) return {...counter(o.vHigh * p.first_counter, p.min_raise_over_offer), reason: 'first offer: always counter'};
  if (small) return o.guaranteed >= o.vLow ? {action: 'accept', reason: 'small deal at or above v_low'} : {action: 'reject', reason: 'small deal below v_low'};
  if (o.guaranteed >= o.vHigh * p.accept_reply_at) return {action: 'accept', reason: `reply >= ${p.accept_reply_at} x v_high`};
  if (o.countersSoFar < p.max_counters) {
    const c = counter(o.vHigh * p.second_counter);
    if (c.guaranteedAsk > o.guaranteed) return {...c, reason: `counter ${o.countersSoFar + 1}`};
  }
  return o.guaranteed >= floor ? {action: 'accept', reason: `counters exhausted, at or above floor ${Math.round(floor)}`}
    : {action: 'reject', reason: `counters exhausted, below floor ${Math.round(floor)}`};
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
