// Final-year contracts as a decision matrix (user, 2032-07-02): "we look at players in their final
// year, decide if we should offer them a new deal; depending on their demands we sell them or sign
// them". Pure: facts (analysis/final_year.py) + his demands (renewal preview) → one action.
//
//   no contract                      → release
//   minor (cheap, few minutes)       → run-down
//   30+ and not starting             → sell
//   replaceable (a similar player for much less) → sell (and buy the replacement)
//   worth keeping                    → ask-demands  (renewal preview: nothing is sent)
//   … his demands pass the renewal test → renew   …fail → sell this window
import {renewalVerdict} from './renew.mjs';

export function decideFinalYear(f, {finalYear: fy = {}, renewal = {}} = {}, demand = null) {
  if (f.no_contract) return {action: 'release', why: 'contract ended'};
  if (f.value < (fy.minor_value ?? 5e6) && f.minutes < (fy.minor_minutes ?? 1500)) return {action: 'run-down', why: 'minor: little value, few minutes'};
  if (f.age >= (fy.sell_age ?? 30) && !f.starts) return {action: 'sell', why: `${f.age} and not starting: his value only falls`};
  // A star (top CA in our squad, user 2032-07-02: Savinho "one of our quality players we want to keep")
  // is asked first, even if replaceable; his demands decide.
  if (f.star && f.starts && !demand) return {action: 'ask-demands', why: `one of our best (CA ${f.ca ?? '?'}): renew if his demands are reasonable${f.replacement ? `, else sell (replacement: ${f.replacement.name})` : ''}`, replacement: f.replacement};
  if (f.replacement && !(f.star && f.starts)) return {action: 'sell', why: `replaceable: ${f.replacement.name} (${f.replacement.age}, ${f.replacement.club}) CA ${f.replacement.ca} vs his ${f.ca ?? '?'}, £${(f.replacement.value / 1e6).toFixed(1)}M`, replacement: f.replacement};
  if (!demand) return {action: 'ask-demands', why: f.starts ? 'starter with no cheap equal: what does he want?' : 'no cheap equal: what does he want?'};
  // Savinho (2032-07-02): the old test compared renewing with losing him for nothing, counted only the
  // RAISE, and said renew at £275K (4.7x). Now: (1) a wage ceiling, at most max_wage_raise above his
  // current wage (user: "£220K maybe, £245K is too much"); (2) the cost is the FULL new wage over the
  // holding period; (3) both paths, renew vs sell now + replace, are shown with rough numbers.
  const raise = demand.salary / Math.max(f.wage, 1) - 1, cap = fy.max_wage_raise ?? 0.25;
  const paths = comparePaths(f, demand, fy);
  if (raise > cap) return {action: 'sell', why: `asks £${Math.round(demand.salary / 1e3)}K, +${Math.round(raise * 100)}% on £${Math.round(f.wage / 1e3)}K (ceiling +${Math.round(cap * 100)}%): list him, replace${f.replacement ? ' (' + f.replacement.name + ')' : ''}`, paths};
  const v = renewalVerdict({currentWage: 0, value: f.value, demand: demand.salary, years: demand.years, loyaltyBonus: demand.loyaltyBonus, agentFee: demand.agentFee, age: f.age, minutes: f.minutes}, renewal);
  return v.verdict === 'renew' ? {action: 'renew', why: `within the wage ceiling; value ${(v.value / 1e6).toFixed(1)}M is ${v.ratio}x the full cost`, test: v, paths}
    : {action: 'sell', why: `his full cost is too high for his value (${v.ratio}x < ${renewal.min_value_x_cost}x): list him`, test: v, paths};
}

/** Rough two-season comparison: renew (resale at 2 years older, minus his sell-on, minus full wage and
 *  bonuses) vs sell now (final-year price) and buy the replacement (fee with a premium, similar wage,
 *  his value held). Shown for the decision; the ceiling and the renewal test decide. */
export function comparePaths(f, demand, fy = {}) {
  const weeks = 52 * 2, sellOn = (demand.playerSellOnPct || 0) / 100;
  const renew = f.value * (f.age >= 28 ? fy.resale_after_28 ?? 0.6 : fy.resale_young ?? 0.9) * (1 - sellOn)
    - demand.salary * weeks - (demand.loyaltyBonus || 0) - (demand.agentFee || 0);
  if (!f.replacement) return {renew: Math.round(renew)};
  const r = f.replacement, sell = f.value * (fy.final_year_sale ?? 0.85) - r.value * (fy.replacement_premium ?? 1.3) - f.wage * weeks + r.value;
  return {renew: Math.round(renew), sellAndReplace: Math.round(sell)};
}
