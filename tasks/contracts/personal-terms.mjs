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
import {Screen, waitFor, click, clickWhere, setFee, settle, parseMoney, NeedsAnalyst, isoDate} from '../../ui/index.mjs';
import {loadRules} from '../transfers/decide.mjs';
import {log} from '../log.mjs';

const amountAfter = (s, label) => s.after(label, i => i.kind === 'button' && parseMoney(i.label) !== null);
const suggestEnabled = s => s.items.some(i => i.kind === 'button' && i.label === 'Suggest Terms' && i.enabled);
const agentLine = s => s.buttons(/ Agent /)[0]?.label || '';

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
  let s = await waitFor(x => x.buttons(/^(Finalize Promises|Negotiate Contract)$/).length > 0, {what: 'contract negotiation'});
  if (s.buttons('Finalize Promises').length) { await click('Finalize Promises'); s = await waitFor(x => x.buttons('Negotiate Contract').length > 0, {what: 'promises accepted'}); }
  await click('Negotiate Contract');
  s = await waitFor(x => amountAfter(x, 'Salary') && x.hasText('Payroll Budget Impact'), {what: 'contract form'});
  const demand = parseMoney(amountAfter(s, 'Salary').label);
  const avg = parseMoney(s.after('Avg.', i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  const entry = {action: 'personal-terms', player, date: isoDate(s.date()), demand, squadAverage: avg, tries: []};
  if (avg && demand > avg * rules.max_salary_vs_average) {
    await click('Cancel Negotiations');
    await log({...entry, outcome: 'escalated'});
    throw new NeedsAnalyst(`${player} wants £${demand}/week (> ${rules.max_salary_vs_average}× squad average £${avg}); decide`, entry);
  }
  for (const f of factors) {
    await click('Reset', {name: 'button-secondary-label'}); await settle(800);
    const set = await setFee('Salary', Math.round(demand * f));
    if (!(await lowerAgentFeeUntilAllowed())) { entry.tries.push({factor: f, salary: set.set, blocked: 'agent fee'}); continue; }
    await click('Suggest Terms', {name: 'StandardButton'});
    const r = await waitFor(x => x.buttons('Finalize Deal').length > 0 || suggestEnabled(x), {what: 'agent reply', timeout: 8000}).catch(() => Screen.read());
    entry.tries.push({factor: f, salary: set.set, reply: agentLine(r).slice(0, 200)});
    if (r.buttons('Finalize Deal').length) {
      await click('Finalize Deal');
      await waitFor(x => x.buttons('Exit Talks').length > 0, {what: 'deal finalized'});
      await click('Exit Talks');
      await log({...entry, outcome: 'agreed', salary: set.set});
      return {...entry, outcome: 'agreed', salary: set.set};
    }
  }
  await click('Cancel Negotiations');
  await log({...entry, outcome: 'no-agreement'});
  return {...entry, outcome: 'no-agreement'};
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
