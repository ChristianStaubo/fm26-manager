// Personal terms for a signing when the General Manager hands negotiations back to us
// ("… I found his contract demands to be unacceptable …": Enter Contract Negotiations / Walk Away).
// Recorded 2026-10-04 (Fernández-Pardo) and the user's rule: agents give a little on salary but
// are firm on bonuses and clauses, so keep their demands and only lower the salary (85 → 95 →
// 100%). If "Suggest Terms" stays disabled the agent fee is above the allowed maximum: lower it.
//
// Screens: Enter Contract Negotiations → (Promises) Finalize Promises → Negotiate Contract →
// contract form (Salary, Loyalty Bonus, Agent Fee, Contract Length, Bonuses & Clauses, payroll
// "Avg." per week) → Suggest Terms → agent: "…appreciates these terms…" + Finalize Deal →
// Finalize Deal → "…I'll be in touch regarding my client's final decision…" → Exit Talks.
import {Screen, waitFor, click, clickWhere, setFee, settle, parseMoney, NeedsAnalyst, isoDate} from '../../game/ui/index.mjs';
import {loadRules} from '../sell/decide.mjs';
import {log} from '../log.mjs';
import {execFileSync} from 'node:child_process';

// First-team wage bands (analysis/wage_bands.py): the contract screen's "Avg." includes youth.
function firstTeamBands() {
  try { return JSON.parse(execFileSync('python3', ['analysis/wage_bands.py'], {cwd: new URL('../..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000})); }
  catch { return null; }
}

const amountAfter = (s, label) => s.after(label, i => i.kind === 'button' && parseMoney(i.label) !== null);
const suggestEnabled = s => s.items.some(i => i.kind === 'button' && i.label === 'Suggest Terms' && i.enabled);
const agentLine = s => s.buttons(/ Agent | Player /)[0]?.label || '';
export const termsAccepted = s => /pleased with the negotiations|solution everyone agrees|terms are acceptable/i.test(agentLine(s));

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

export async function negotiatePersonalTerms({player = '?', factors} = {}) {
  const rules = loadRules().contracts;
  factors ??= rules.salary_factors;
  await click('Enter Contract Negotiations');
  // FM26 may land on Recruitment → Transfer Activity with the deal selected instead of the talks
  // (Camara, 2026-07-16): its "Contract £8M" link (transfer-link-button) opens them.
  // Where it lands varies: promises, a "Negotiate Contract" step, the contract form itself
  // (Camara, 2026-07-16), or Transfer Activity with the deal's "Contract £…" link.
  const form = x => !!amountAfter(x, 'Salary') && x.hasText('Payroll Budget Impact');
  const link = x => x.buttons().find(b => b.name === 'transfer-link-button' && /^Contract £/.test(b.label));
  const steps = x => x.buttons(/^(Finalize Promises|Negotiate Contract|Hand Over to .+)$/).length > 0;
  let s = await waitFor(x => form(x) || steps(x) || !!link(x), {what: 'contract negotiation', timeout: 15000});
  if (!form(s) && !steps(s)) { await clickWhere(link, 'Contract link'); s = await waitFor(x => form(x) || steps(x), {what: 'contract negotiation (via deal)', timeout: 15000}); }
  // Talks the Director of Football hasn't tried yet: hand them over (playbook: staff negotiate
  // contracts; Grimes, 2028-06-27 waited on "Hand Over to Phil Giles").
  const handOver = s.buttons(/^Hand Over to /)[0];
  if (handOver) {
    await click(handOver.label);
    await log({action: 'personal-terms', player, date: isoDate(s.date()), outcome: 'handed-over'});
    return {action: 'personal-terms', player, outcome: 'handed-over', to: handOver.label.replace(/^Hand Over to /, '')};
  }
  if (s.buttons('Finalize Promises').length) { await click('Finalize Promises'); s = await waitFor(x => form(x) || x.buttons('Negotiate Contract').length > 0, {what: 'promises accepted'}); }
  if (!form(s)) { await click('Negotiate Contract'); s = await waitFor(form, {what: 'contract form'}); }
  const demand = parseMoney(amountAfter(s, 'Salary').label);
  const avg = parseMoney(s.after('Avg.', i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  const entry = {action: 'personal-terms', player, date: isoDate(s.date()), demand, squadAverage: avg, tries: []};
  // Cap: first-team median × max_salary_vs_first_team_median (user, 2026-10-08). Above it: stop
  // with the form open for a decision (Cancel Negotiations asks to confirm; its Cancel keeps talks).
  const bands = firstTeamBands();
  const cap = bands ? bands.median * rules.max_salary_vs_first_team_median : Infinity;
  Object.assign(entry, {firstTeamMedian: bands?.median ?? null, cap: Number.isFinite(cap) ? Math.round(cap) : null});
  if (demand > cap) {
    await log({...entry, outcome: 'escalated'});
    throw new NeedsAnalyst(`${player} wants £${demand}/week, above our cap £${Math.round(cap)} (${rules.max_salary_vs_first_team_median}× first-team median £${bands.median}); decide`, entry);
  }
  for (const f of factors) {
    if (demand * f > cap) break;
    await click('Reset', {name: 'button-secondary-label'}); await settle(800);
    const set = await setFee('Salary', Math.round(demand * f));
    if (!(await lowerAgentFeeUntilAllowed())) { entry.tries.push({factor: f, salary: set.set, blocked: 'agent fee'}); continue; }
    await click('Suggest Terms', {name: 'StandardButton'});
    const r = await waitFor(x => x.buttons('Finalize Deal').length > 0 || suggestEnabled(x), {what: 'agent reply', timeout: 8000}).catch(() => Screen.read());
    entry.tries.push({factor: f, salary: set.set, reply: agentLine(r).slice(0, 200)});
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
  throw new NeedsAnalyst(`${player}: no agreement up to ${factors.at(-1)}x the demand (£${demand}/wk); talks left open`, entry);
}

// Autopilot handler.
export const handBackContract = {
  name: 'personal-terms',
  match: s => s.buttons('Enter Contract Negotiations').length === 1 && s.buttons('Walk Away').length === 1 && s.hasText(/contract demands to be unacceptable/),
  async run(s, {dryRun = false} = {}) {
    const player = s.texts().map(t => /^Handle (.+) contract negotiations$/.exec(t)?.[1]).find(Boolean) || '?';
    if (dryRun) throw new NeedsAnalyst(`Personal terms for ${player} (dry run)`);
    return negotiatePersonalTerms({player});
  },
};
