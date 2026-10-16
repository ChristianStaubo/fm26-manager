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
  const v = renewalVerdict({currentWage: f.wage, value: f.value, demand: demand.salary, years: demand.years, loyaltyBonus: demand.loyaltyBonus, agentFee: demand.agentFee, age: f.age, minutes: f.minutes}, renewal);
  return v.verdict === 'renew' ? {action: 'renew', why: `renewal test: value ${(v.value / 1e6).toFixed(1)}M is ${v.ratio}x the cost`, test: v}
    : {action: 'sell', why: `his demands fail the renewal test (${v.ratio}x < ${renewal.min_value_x_cost}x): sell while he's worth something`, test: v};
}
