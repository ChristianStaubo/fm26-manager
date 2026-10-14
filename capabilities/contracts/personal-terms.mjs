// Personal terms for a signing when the General Manager hands negotiations back to us
// ("… I found his contract demands to be unacceptable …": Enter Contract Negotiations / Walk Away).
// Recorded 2026-10-04 (Fernández-Pardo) and the user's rule: agents give a little on salary but
// are firm on bonuses and clauses, so keep their demands and only lower the salary. Since
// 2026-10-14 (user): take their opening demand and press the Salary "−" button 3 times, nothing
// else; then 2, 1, 0 ticks (the demand itself). If "Suggest Terms" stays disabled the agent fee is
// above the allowed maximum: lower it.
//
// Screens: Enter Contract Negotiations → (Promises) Finalize Promises → Negotiate Contract →
// contract form (Salary, Loyalty Bonus, Agent Fee, Contract Length, Bonuses & Clauses, payroll
// "Avg." per week) → Suggest Terms → agent: "…appreciates these terms…" + Finalize Deal →
// Finalize Deal → "…I'll be in touch regarding my client's final decision…" → Exit Talks.
import {Screen, waitFor, click, clickWhere, setFee, settle, parseMoney, NeedsAnalyst, isoDate} from '../../game/ui/index.mjs';
import {loadRules} from '../sell/decide.mjs';
import {log} from '../log.mjs';
import {wageException} from './wage-exceptions.mjs';
import {held} from '../approvals.mjs';
import {execFileSync} from 'node:child_process';

// First-team wage bands (analysis/wage_bands.py): the contract screen's "Avg." includes youth.
function firstTeamBands() {
  try { return JSON.parse(execFileSync('python3', ['analysis/wage_bands.py'], {cwd: new URL('../..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000})); }
  catch { return null; }
}

// The contract's strings, for fm audit (Ortega 2030-07: £88K x 5y, £3.9M loyalty, £82M release
// clause, 10% player sell-on): what the deal really costs and what it does to resale.
export function contractTerms(s) {
  const money = label => parseMoney(amountAfter(s, label)?.label ?? '') ?? null;
  const pct = label => { const i = s.after(label, x => /\d+%/.test(x.label || '')); return i ? Number(/(\d+)%/.exec(i.label)[1]) : null; };
  const len = s.after('Contract Length', i => i.kind === 'dropdown')?.label || '';
  return {salary: money('Salary'), loyaltyBonus: money('Loyalty Bonus'), agentFee: money('Agent Fee'),
    years: Number(/(\d+) years?/.exec(len)?.[1] ?? NaN) || null,
    releaseClause: s.hasText('Minimum Fee Release Clause') ? money('Minimum Fee Release Clause') : null,
    playerSellOnPct: s.hasText('Sell On Fee Percentage') ? pct('Sell On Fee Percentage') : null};
}
const amountAfter = (s, label) => s.after(label, i => i.kind === 'button' && parseMoney(i.label) !== null);
const suggestEnabled = s => s.items.some(i => i.kind === 'button' && i.label === 'Suggest Terms' && i.enabled);
const agentLine = s => s.buttons(/ Agent | Player /)[0]?.label || '';
// "…already provisionally agreed terms. I will once again state what is acceptable…" (Lemaitre, after a
// second suggestion overrode an accepted one, 2030-07-14) is agreement too, with Finalize Deal.
export const termsAccepted = s => /pleased with the negotiations|solution everyone agrees|terms are acceptable|provisionally agreed/i.test(agentLine(s));

// The Salary row's "−" button (the form's own wage steps).
const salaryMinus = x => { const f = amountAfter(x, 'Salary'); const j = x.items.indexOf(f); return x.items.slice(j + 1, j + 4).find(i => i.kind === 'button' && i.label === '-'); };
// Presses per try from one Reset: [3,2,1,0] → [-3, +1, +1, +1] (− lowers the salary). Reset restores
// our last suggestion, not the demand, so we never Reset between tries (Lemaitre, 2030-07-14).
export const tickMoves = ticks => ticks.map((t, k) => (k ? ticks[k - 1] : 0) - t);
const salaryPlus = x => { const f = amountAfter(x, 'Salary'); const j = x.items.indexOf(f); return x.items.slice(j + 1, j + 4).find(i => i.kind === 'button' && i.label === '+'); };
async function salaryTicksUp(n) {
  for (let k = 0; k < n; k++) { await clickWhere(salaryPlus, 'salary +'); await settle(300); }
  return parseMoney(amountAfter(await Screen.read(), 'Salary').label);
}
async function salaryTicksDown(n) {
  for (let k = 0; k < n; k++) { await clickWhere(salaryMinus, 'salary −'); await settle(300); }
  return parseMoney(amountAfter(await Screen.read(), 'Salary').label);
}

async function lowerAgentFeeUntilAllowed(max = 40) {
  for (let k = 0; k < max; k++) {
    const s = await Screen.read();
    if (suggestEnabled(s)) return true;
    const minus = x => { const f = amountAfter(x, 'Agent Fee'); const j = x.items.indexOf(f); return x.items.slice(j + 1, j + 4).find(i => i.kind === 'button' && i.label === '-'); };
    if (!minus(s)?.enabled) return false;
    await clickWhere(minus, 'agent fee −');
    await settle(400);
  }
  return suggestEnabled(await Screen.read());
}

// The talks' own "Negotiate Contract" (StandardButton), not the Continue button of the same label.
const negotiateButton = x => x.buttons('Negotiate Contract').find(b => b.name !== 'continue-button');
export async function negotiatePersonalTerms({player = '?', ticks, entered = false} = {}) {
  const rules = loadRules().contracts;
  ticks ??= rules.salary_ticks_down;
  // Wait for the message to give way: it has its own "Hand Over to …" button, which read as the
  // talks' next step before they had opened (Lemaitre, 2030-07-14).
  if (!entered) { await click('Enter Contract Negotiations'); await waitFor(x => !x.buttons('Enter Contract Negotiations').length, {what: 'contract talks open'}); }
  // FM26 may land on Recruitment → Transfer Activity with the deal selected instead of the talks
  // (Camara, 2026-07-16): its "Contract £8M" link (transfer-link-button) opens them.
  // Where it lands varies: promises, a "Negotiate Contract" step, the contract form itself
  // (Camara, 2026-07-16), or Transfer Activity with the deal's "Contract £…" link.
  const form = x => !!amountAfter(x, 'Salary') && x.hasText('Payroll Budget Impact');
  const link = x => x.buttons().find(b => b.name === 'transfer-link-button' && /^Contract £/.test(b.label));
  const steps = x => x.buttons(/^(Finalize Promises|Hand Over to .+)$/).length > 0 || !!negotiateButton(x);
  let s = await waitFor(x => form(x) || steps(x) || !!link(x), {what: 'contract negotiation', timeout: 15000});
  if (!form(s) && !steps(s)) { await clickWhere(link, 'Contract link'); s = await waitFor(x => form(x) || steps(x), {what: 'contract negotiation (via deal)', timeout: 15000}); }
  // Talks the Director of Football hasn't tried yet: hand them over (playbook: staff negotiate
  // contracts; Grimes, 2028-06-27 waited on "Hand Over to Phil Giles").
  // Since 2026-10-14 the manager negotiates (contracts.negotiator 'manager', user: the tick rule).
  const handOver = rules.negotiator === 'Director of Football' && s.buttons(/^Hand Over to /)[0];
  if (handOver) {
    await click(handOver.label);
    await log({action: 'personal-terms', player, date: isoDate(s.date()), outcome: 'handed-over'});
    return {action: 'personal-terms', player, outcome: 'handed-over', to: handOver.label.replace(/^Hand Over to /, '')};
  }
  if (s.buttons('Finalize Promises').length) { await click('Finalize Promises'); s = await waitFor(x => form(x) || !!negotiateButton(x), {what: 'promises accepted'}); }
  if (!form(s)) { await clickWhere(negotiateButton, 'Negotiate Contract (talks)'); s = await waitFor(form, {what: 'contract form'}); }
  const demand = parseMoney(amountAfter(s, 'Salary').label);
  const avg = parseMoney(s.after('Avg.', i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  const entry = {action: 'personal-terms', player, date: isoDate(s.date()), demand, squadAverage: avg, demanded: contractTerms(s), tries: []};
  // Cap: first-team median × max_salary_vs_first_team_median (user, 2026-10-08). Above it: stop
  // with the form open for a decision (Cancel Negotiations asks to confirm; its Cancel keeps talks).
  const bands = firstTeamBands();
  const swap = wageException(player);
  const cap = Math.max(bands ? bands.median * rules.max_salary_vs_first_team_median : Infinity, swap?.max ?? 0);
  Object.assign(entry, {firstTeamMedian: bands?.median ?? null, cap: Number.isFinite(cap) ? Math.round(cap) : null, ...(swap ? {swap} : {})});
  if (demand > cap) {
    await log({...entry, outcome: 'escalated'});
    throw new NeedsAnalyst(`${player} wants £${demand}/week, above our cap £${Math.round(cap)} (${rules.max_salary_vs_first_team_median}× first-team median £${bands.median}); decide`, entry);
  }
  // Reset ONCE, to their opening demand. Later Resets restore our last suggestion, not the demand
  // (Lemaitre 2030-07-14: "2 ticks" after a 3-tick try gave £19K, below the 3-tick £19.5K). So:
  // ticks[0] presses of −, then step back up with + between tries.
  await click('Reset', {name: 'button-secondary-label'}); await settle(800);
  const moves = tickMoves(ticks);
  for (const [k, t] of ticks.entries()) {
    const set = {set: moves[k] < 0 ? await salaryTicksDown(-moves[k]) : await salaryTicksUp(moves[k])};
    if (!(await lowerAgentFeeUntilAllowed())) { entry.tries.push({ticks: t, salary: set.set, blocked: 'agent fee'}); continue; }
    // Wait for the agent's line to CHANGE (or Finalize Deal): Suggest Terms stays enabled right after
    // the click, and the old line ("…initial contract demands…") was read as his answer (Lemaitre).
    const before = agentLine(await Screen.read());
    await click('Suggest Terms', {name: 'StandardButton'});
    const r = await waitFor(x => x.buttons('Finalize Deal').length > 0 || (agentLine(x) !== before && suggestEnabled(x)), {what: 'agent reply', timeout: 20000}).catch(() => Screen.read());
    if (agentLine(r) === before && !r.buttons('Finalize Deal').length) {
      await log({...entry, outcome: 'no-reply', salary: set.set});
      throw new NeedsAnalyst(`${player}: no reply from the agent after suggesting £${set.set}/wk; talks left open, read the screen`, entry);
    }
    entry.tries.push({ticks: t, salary: set.set, reply: agentLine(r).slice(0, 200)});
    // Accepted, decision pending: no Finalize Deal, the player "would like to go away and think" /
    // "These terms are acceptable but I wish to evaluate all my options" (Tanaka, Grimes 2028-06-27:
    // read as a no, the handler kept raising the salary). Stop here; the player answers in days.
    if (!r.buttons('Finalize Deal').length && termsAccepted(r)) {
      await log({...entry, outcome: 'accepted-pending', salary: set.set});
      return {...entry, outcome: 'accepted-pending', salary: set.set};
    }
    if (r.buttons('Finalize Deal').length) {
      await click('Finalize Deal');
      await waitFor(x => x.buttons('Exit Talks').length > 0, {what: 'deal finalized'});
      await click('Exit Talks');
      await log({...entry, outcome: 'agreed', salary: set.set});
      return {...entry, outcome: 'agreed', salary: set.set};
    }
  }
  // No agreement: leave the talks open (cancelling loses the player and the agreed fee) and ask.
  await log({...entry, outcome: 'no-agreement'});
  throw new NeedsAnalyst(`${player}: no agreement from ${ticks[0]} ticks below his demand up to the demand itself (£${demand}/wk); talks left open`, entry);
}

// Autopilot handler.
export const handBackContract = {
  name: 'personal-terms',
  // The hand-back ("…contract demands to be unacceptable…") or the "<Player> offer accepted" message
  // (2030-07-14: "LOSC have accepted our offer of £1M for Leo Lemaitre." + the same three buttons).
  match: s => s.buttons('Enter Contract Negotiations').length === 1 && s.buttons('Walk Away').length === 1
    && (s.hasText(/contract demands to be unacceptable/) || s.hasText(/have accepted our offer of/)),
  async run(s, {dryRun = false} = {}) {
    const player = s.texts().map(t => /^Handle (.+) contract negotiations$/.exec(t)?.[1] || /have accepted our offer of .+ for (.+)\.$/.exec(t)?.[1]).find(Boolean) || '?';
    if (dryRun) throw new NeedsAnalyst(`Personal terms for ${player} (dry run)`);
    if (held(player)) throw new NeedsAnalyst(`${player}: the user holds this deal (fm hold); stop for their decision`, {held: player});
    return negotiatePersonalTerms({player});
  },
};
