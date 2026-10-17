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
import {Screen, waitFor, click, clickWhere, setFee, setNumber, settle, parseMoney, NeedsAnalyst, isoDate} from '../../game/ui/index.mjs';
import {loadRules} from '../sell/decide.mjs';
import {log} from '../log.mjs';
import {wageException} from './wage-exceptions.mjs';
import {held} from '../approvals.mjs';
import {execFileSync} from 'node:child_process';

// First-team wage bands (analysis/wage_bands.py): the contract screen's "Avg." includes youth.
/** The wage ceiling for a signing (policy contracts.wage_ceiling): min(our peers' median x peer_factor,
 *  his current wage x current_factor). Unknown parts are left out; null when nothing is known. */
export function wageCeiling({peerMedian, currentWage}, wc) {
  const parts = [Number.isFinite(peerMedian) && peerMedian > 0 ? peerMedian * wc.peer_factor : null,
    Number.isFinite(currentWage) && currentWage > 0 ? currentWage * wc.current_factor : null].filter(x => x != null);
  return parts.length ? Math.round(Math.min(...parts)) : null;
}
function peerBand(player, within) {
  try { return JSON.parse(execFileSync('python3', ['analysis/wage_bands.py', '--player', player, '--within', String(within)], {cwd: new URL('../..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000})); }
  catch { return null; }
}
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
  return {salary: salaryOf(s), loyaltyBonus: money('Loyalty Bonus'), agentFee: money('Agent Fee'),
    years: Number(/(\d+) years?/.exec(len)?.[1] ?? NaN) || null,
    releaseClause: s.hasText('Minimum Fee Release Clause') ? money('Minimum Fee Release Clause') : null,
    playerSellOnPct: s.hasText('Sell On Fee Percentage') ? pct('Sell On Fee Percentage') : null};
}
// The Salary row's own control: a money button with −/+ (signings) or a number field (Lawrence's
// renewal, 2030-07-17: "73000"). Never the next amount in the form (that read £2M loyalty as salary).
const salaryControl = x => { const i = x.items.findIndex(t => t.kind === 'text' && t.label === 'Salary'); const c = x.items[i + 1];
  return c && (c.kind === 'number-field' || (c.kind === 'button' && parseMoney(c.label) !== null)) ? c : null; };
export const salaryOf = x => { const c = salaryControl(x); return c ? (c.kind === 'number-field' ? Number(c.label) : parseMoney(c.label)) : null; };
const amountAfter = (s, label) => s.after(label, i => i.kind === 'button' && parseMoney(i.label) !== null);
const suggestEnabled = s => s.items.some(i => i.kind === 'button' && i.label === 'Suggest Terms' && i.enabled);
// The agent's speech bubble ("<Name> Agent …" or "<Name> Player …" when the player talks), never an
// inbox item ("Paul Hodges 14:00 Player Targets and Promises Updates" was read as his reply, 2031-01-01).
// The agent's message panel (an SIButton on the right). Not a page tile: "TRENDING … the best player …"
// was read as his reply (2034-06, Froholdt/Espino), and the promise step waited on a headline.
const agentLine = s => s.buttons(/ Agent | Player /).find(b => b.name === 'SIButton' && !/^\S+ \S+ \d{1,2}:\d{2} /.test(b.label))?.label || '';
// The agent has accepted the promises as they stand ("happy to move on"): finalize, change nothing.
const promisesAccepted = s => /happy to move on/i.test(agentLine(s));
// "…already provisionally agreed terms. I will once again state what is acceptable…" (Lemaitre, after a
// second suggestion overrode an accepted one, 2030-07-14) is agreement too, with Finalize Deal.
// A counter: the agent writes his latest demands into the form and FM shows Finalize Deal (= accept
// HIS counter). "What a promising start… very close… Here are my client's latest demands" (Casadó,
// 2030-07-17) was finalized as if our £100K were agreed. Counter lines go through the probe instead.
export const counterLine = s => /latest demands|willing to accept|very close|promising (start|offer)|make progress/i.test(agentLine(s));
export const termsAccepted = s => /pleased with the negotiations|solution everyone agrees|terms are acceptable|provisionally agreed/i.test(agentLine(s));

// The Salary row's "−" button (the form's own wage steps).
const salaryMinus = x => { const f = salaryControl(x); const j = x.items.indexOf(f); return x.items.slice(j + 1, j + 4).find(i => i.kind === 'button' && i.label === '-'); };
// The split (user sessions, 2026-10-15): the raise is what is negotiated. Opening = current wage +
// raise_share x (demand - current); after a counter, halfway between our last offer and it. In ticks
// below the demand (the form moves in ticks). Never below the current wage.
export function splitTicks({demand, current, target, tick}) {
  const want = Math.max(target, current ?? 0);
  return Math.max(0, Math.round((demand - want) / tick));
}
export const splitOpening = ({demand, current}, p) => current + (p.raise_share ?? 0.5) * (demand - current);
export const splitCounter = ({offered, counter}) => (offered + counter) / 2;
// The opening (user sessions, 2026-10-15): open_pct under his demand, at least open_min_ticks.
export function openingTicks({demand, tick}, p) {
  if (p.open_pct == null) return demand >= p.expensive_over ? p.open_ticks_expensive : p.open_ticks;
  // The minimum only while it stays within open_max_pct (at £5K ticks, 8 ticks would be -32%).
  return Math.max(Math.round(demand * p.open_pct / tick), Math.min(p.open_min_ticks, Math.floor(demand * (p.open_max_pct ?? 0.15) / tick)));
}
// After his counter: how many ticks under it (user, 2026-10-15). Within firm_within_ticks of the
// demand he's firm (1 tick under); a bigger drop shows room (2 ticks under).
export function nextOfferTicks({demand, counter, tick}, p) {
  const dropped = Math.round((demand - counter) / tick);
  return dropped <= p.firm_within_ticks ? p.below_counter_firm : p.below_counter_flexible;
}
// Presses per try from one Reset: [3,2,1,0] → [-3, +1, +1, +1] (− lowers the salary). Reset restores
// our last suggestion, not the demand, so we never Reset between tries (Lemaitre, 2030-07-14).
export const tickMoves = ticks => ticks.map((t, k) => (k ? ticks[k - 1] : 0) - t);
const salaryPlus = x => { const f = salaryControl(x); const j = x.items.indexOf(f); return x.items.slice(j + 1, j + 4).find(i => i.kind === 'button' && i.label === '+'); };
async function salaryTicksUp(n) {
  if (!salaryPlus(await Screen.read())) throw new NeedsAnalyst('No salary + on the form; talks left open', {});
  for (let k = 0; k < n; k++) { await clickWhere(salaryPlus, 'salary +'); await settle(300); }
  return salaryOf(await Screen.read());
}
// Some forms have no Salary steppers, one wide field (Lawrence's renewal, 2030-07-17): type the
// demand minus the same number of the game's steps (£1K a step from £50K/wk, £250 below; Güreler
// 95K → 92K in 3 ticks).
export const wageStep = w => (w >= 50000 ? 1000 : 250);
async function salaryTicksDown(n) {
  // No steppers = the payroll budget blocks the form (they appear once it allows the terms). Never
  // type a salary: FM money fields don't keep typed values (a typed £70K became £490/wk).
  if (!salaryMinus(await Screen.read())) throw new NeedsAnalyst("No salary −/+ on the form: the payroll budget is too small for these terms; move transfer budget to payroll (Recruitment → Adjust Transfer and Payroll Budget) — the user's decision; talks left open", {payrollBudget: 'too small'});
  for (let k = 0; k < n; k++) { await clickWhere(salaryMinus, 'salary −'); await settle(300); }
  return salaryOf(await Screen.read());
}

// "Exceeds board's max allowance" under Loyalty Bonus / Agent Fee (Lawrence, 2030-07-17): lower that
// amount until the warning goes; Suggest Terms stays disabled while any is over.
const overAllowance = x => { const w = x.items.findIndex(i => i.kind === 'text' && i.label === "Exceeds board's max allowance"); if (w < 0) return null;
  return x.items.slice(w + 1, w + 5).find(i => i.kind === 'button' && i.label === '-' && i.enabled); };
async function lowerAgentFeeUntilAllowed(max = 40) {
  // "Exceeds board's max allowance" means the PAYROLL BUDGET is too small, not that a bonus is too
  // high (user's mapping session, 2030-07-17: Recruitment → Adjust Transfer and Payroll Budget, slider
  // £2.33M → £2.81M/wk payroll for £25M of transfer budget; every warning cleared). Lowering bonuses
  // crushed them to almost nothing (£2M loyalty → £24.5K). Stop for the decision instead.
  if (overAllowance(await Screen.read()) || (await Screen.read()).hasText("Exceeds board's max allowance"))
    throw new NeedsAnalyst("Payroll budget too small for these terms (\"Exceeds board's max allowance\"): move transfer budget to payroll (Recruitment → Adjust Transfer and Payroll Budget) — a money decision for the user; talks left open", {payrollBudget: 'too small'});
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

// Promises (user, Fresneda 2030-07-19): he asked for more playing time; the user picked the game's
// "Regular Starter (Recommended)" and clicked Suggest Promises ("happy to move on"), then Finalize
// Promises. Take the "(Recommended)" option when it is LOWER than what he asked; anything unexpected
// leaves his promise as it is.
export const PLAYING_TIME = ['Star Player', 'Important Player', 'Regular Starter', 'Squad Player', 'Impact Sub', 'Fringe Player', 'Emergency Backup', 'Breakthrough Prospect', 'Hot Prospect for the Future', 'Future Prospect'];
// Always try one lower (user, 2026-10-15): the "(Recommended)" option when it is lower, else the
// next option down from what he asked. Never raise a promise.
export function lowerPromise(current, options) {
  const plain = o => o.replace(/ \(Recommended\)$/, '');
  const a = PLAYING_TIME.indexOf(current);
  if (a < 0) return null;
  const rec = options.find(o => /\(Recommended\)$/.test(o));
  if (rec && PLAYING_TIME.indexOf(plain(rec)) > a) return {from: current, to: plain(rec), option: rec, index: options.indexOf(rec)};
  const next = options.map((o, i) => ({o, i, rank: PLAYING_TIME.indexOf(plain(o))})).filter(x => x.rank > a).sort((x, y) => x.rank - y.rank)[0];
  return next ? {from: current, to: plain(next.o), option: next.o, index: next.i} : null;
}
async function lowerPlayingTime() {
  const {ui} = await import('../../game/bridge/client.mjs');
  const pt = x => x.after('Playing Time', i => i.kind === 'dropdown');
  const s0 = await Screen.read(), current = pt(s0)?.label;
  if (!current) return null;
  await ui.dropdown(s0.tree, s0.node(pt(s0).id), 'open').catch(() => null);
  const s1 = await waitFor(x => (x.floatingItems() || []).some(i => i.kind === 'row'), {what: 'playing time options', timeout: 4000}).catch(() => null);
  const options = s1 ? s1.floatingItems().filter(i => i.kind === 'row').map(i => i.label) : [];
  const pick = lowerPromise(current, options);
  if (!pick) { await ui.closeDropdowns().catch(() => null); return {kept: current, options}; }
  const s2 = await Screen.read();
  await ui.dropdown(s2.tree, s2.node(pt(s2).id), 'select', pick.index);
  const s3 = await waitFor(x => (pt(x)?.label || '').startsWith(pick.to), {what: 'playing time set', timeout: 4000});
  if (!s3.buttons('Suggest Promises').length) return {...pick, suggested: false};
  const before = agentLine(s3);
  await click('Suggest Promises');
  const r = await waitFor(x => agentLine(x) !== before && x.buttons('Finalize Promises').length > 0, {what: 'agent reply on promises', timeout: 15000});
  return {...pick, suggested: true, reply: agentLine(r).slice(0, 160)};
}

// The texts listed under "Additional Promises" (above the Reset button) on the promises screen.
export function additionalPromises(s) {
  const head = s.items.find(i => i.kind === 'text' && i.label === 'Additional Promises');
  const reset = s.buttons('Reset').find(b => b.name === 'button-secondary-label');
  if (!head) return [];
  const [x0] = head.bounds, top = head.bounds[1] + head.bounds[3], bottom = reset ? reset.bounds[1] : Infinity;
  // Texts only: the page's tiles behind the talks (calendar, matches) are buttons in the same area.
  return s.items.filter(i => i.kind === 'text' && i.label && i.bounds[1] > top && i.bounds[1] < bottom && i.bounds[0] >= x0 - 10 && i.bounds[0] < x0 + 700).map(i => i.label);
}
// The remove control on each additional promise's row (buttons-controls-pc-default, at the row's right end;
// the same control removes a sell-on clause in a transfer offer). Froholdt, 2034-06-16.
export function promiseRemoveButtons(s) {
  const head = s.items.find(i => i.kind === 'text' && i.label === 'Additional Promises');
  const reset = s.buttons('Reset').find(b => b.name === 'button-secondary-label');
  if (!head) return [];
  return s.buttons().filter(b => b.name === 'buttons-controls-pc-default' && b.bounds[1] > head.bounds[1] && (!reset || b.bounds[1] < reset.bounds[1]));
}
// Remove every additional promise and put the rest to the agent (user, 2033-07-04 / 2034-06-16: a promise
// to play him in a role we don't have hurts; "improve the coaching staff" is removed once, fine if re-added).
async function removeAdditionalPromises() {
  const removed = additionalPromises(await Screen.read());
  for (let n = promiseRemoveButtons(await Screen.read()).length; n > 0; n--) {
    await clickWhere(x => promiseRemoveButtons(x)[0], 'promise remove button');
    await waitFor(x => promiseRemoveButtons(x).length < n, {what: 'promise removed'});
  }
  const before = agentLine(await Screen.read());
  await click('Suggest Promises', {name: 'StandardButton'});
  const r = await waitFor(x => agentLine(x) !== before && x.buttons('Finalize Promises').length > 0, {what: 'agent reply on promises', timeout: 15000});
  return {removed, reply: agentLine(r).slice(0, 200), back: additionalPromises(r)};
}
// "Play as an overlapping centre-back", "Play in his preferred position", "Use him as a …": a role we may not have.
export const POSITION_PROMISE = /\b(play(ed|ing)? (as|in|at)|position|role|use (him )?as|deploy)\b/i;

// The talks' own "Negotiate Contract" (StandardButton), not the Continue button of the same label.
const negotiateButton = x => x.buttons('Negotiate Contract').find(b => b.name !== 'continue-button');
export async function negotiatePersonalTerms({player = '?', ticks, entered = false, renewal = null, preview = false, currentWage = null} = {}) {
  const rules = loadRules().contracts;
  ticks ??= rules.salary_ticks_down;
  // Wait for the message to give way: it has its own "Hand Over to …" button, which read as the
  // talks' next step before they had opened (Lemaitre, 2030-07-14).
  if (!entered) { await click('Enter Contract Negotiations'); await waitFor(x => !x.buttons('Enter Contract Negotiations').length, {what: 'contract talks open'}); }
  // FM26 may land on Recruitment → Transfer Activity with the deal selected instead of the talks
  // (Camara, 2026-07-16): its "Contract £8M" link (transfer-link-button) opens them.
  // Where it lands varies: promises, a "Negotiate Contract" step, the contract form itself
  // (Camara, 2026-07-16), or Transfer Activity with the deal's "Contract £…" link.
  const form = x => !!salaryControl(x) && x.hasText('Payroll Budget Impact');
  const link = x => x.buttons().find(b => b.name === 'transfer-link-button' && /^Contract £/.test(b.label));
  const steps = x => x.buttons(/^(Finalize Promises|Hand Over to .+)$/).length > 0 || !!negotiateButton(x);
  // A refusal ends the talks at once: "My client isn't currently interested in entering into contract
  // negotiations with your club. He is currently unhappy at the club." (Franculino, 2030-07-17).
  const refused = x => /isn't currently interested in entering into contract negotiations|not interested in (a new contract|negotiating)/i.test(agentLine(x));
  let s = await waitFor(x => form(x) || steps(x) || !!link(x) || refused(x), {what: 'contract negotiation', timeout: 15000});
  if (refused(s)) {
    const e = {action: 'personal-terms', player, date: isoDate(s.date()), outcome: 'refused', reply: agentLine(s).slice(0, 240)};
    await log(e);
    return e;
  }
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
  let promise = null, promiseNote = null;   // logged once the entry exists
  if (s.buttons('Finalize Promises').length) {
    // A promise to play him in a set position/role we can't keep (user, 2033-07-04: Germany, "play as an
    // overlapping centre-back"; he becomes unhappy when it's broken): never finalize it. Removing a
    // promise isn't mapped yet (to record with the user), so stop for them.
    if (promiseRemoveButtons(s).length && !promisesAccepted(s)) {
      const pr = await removeAdditionalPromises();
      // Put back a promise to play him in a set position or role: we walk away (nothing stops for the user).
      if (pr.back.some(t => POSITION_PROMISE.test(t))) {
        await click('Cancel Negotiations', {name: 'StandardButton'});
        const e = {action: 'personal-terms', player, date: isoDate(s.date()), outcome: 'walked-away-promise', promises: pr};
        await log(e);
        return e;
      }
      promiseNote = pr;
      s = await Screen.read();
    }
    // Lower his playing time once, on the first look only: after we've suggested promises and the agent
    // is happy to move on, changing anything again reopens the talks (user, 2034-06-16, Froholdt).
    if (!promiseNote && !promisesAccepted(s)) promise = await lowerPlayingTime().catch(e => ({error: e.message}));
    await click('Finalize Promises'); s = await waitFor(x => form(x) || !!negotiateButton(x), {what: 'promises accepted'});
  }
  if (!form(s)) { await clickWhere(negotiateButton, 'Negotiate Contract (talks)'); s = await waitFor(form, {what: 'contract form'}); }
  // Reset first: an earlier preview leaves our edits in the form, and reading before Reset took that
  // edit (£110K) for his demand (£125K) (Casadó, 2030-07-17). Reset restores his demand while nothing
  // has been suggested.
  if (s.buttons('Reset').some(b => b.name === 'button-secondary-label')) { await click('Reset', {name: 'button-secondary-label'}); await settle(800); s = await Screen.read(); }
  const demand = salaryOf(s);
  const avg = parseMoney(s.after('Avg.', i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  const entry = {action: 'personal-terms', player, date: isoDate(s.date()), demand, squadAverage: avg, demanded: contractTerms(s), ...(promise ? {promise} : {}), ...(promiseNote ? {promisesRemoved: promiseNote} : {}), tries: []};
  // Cap: first-team median × max_salary_vs_first_team_median (user, 2026-10-08). Above it: stop
  // with the form open for a decision (Cancel Negotiations asks to confirm; its Cancel keeps talks).
  const bands = firstTeamBands();
  const swap = wageException(player);
  const cap = Math.max(bands ? bands.median * rules.max_salary_vs_first_team_median : Infinity, swap?.max ?? 0);
  Object.assign(entry, {firstTeamMedian: bands?.median ?? null, cap: Number.isFinite(cap) ? Math.round(cap) : null, ...(swap ? {swap} : {})});
  // A renewal is judged by the renewal test, not the wage cap: value protected vs what it costs
  // (user, 2026-10-15). Failing it stops for the user: sell or let him run down, talks left open.
  if (renewal && Number.isFinite(renewal.value) && Number.isFinite(renewal.currentWage)) {
    const {renewalVerdict} = await import('./renew.mjs');
    entry.renewal = renewalVerdict({...renewal, demand, years: entry.demanded.years, loyaltyBonus: entry.demanded.loyaltyBonus, agentFee: entry.demanded.agentFee}, rules.renewal);
    if (entry.renewal.verdict !== 'renew') {
      await log({...entry, outcome: 'renewal-test-failed'});
      throw new NeedsAnalyst(`${player}: renewing costs £${entry.renewal.cost} for £${Math.round(renewal.value)} of value (${entry.renewal.ratio}x < ${rules.renewal.min_value_x_cost}x): ${entry.renewal.verdict}; talks left open`, entry);
    }
  }
  if (demand > cap && !entry.renewal) {
    await log({...entry, outcome: 'escalated'});
    throw new NeedsAnalyst(`${player} wants £${demand}/week, above our cap £${Math.round(cap)} (${rules.max_salary_vs_first_team_median}× first-team median £${bands.median}); decide`, entry);
  }
  // The probe (user, 2026-10-15): open contracts.probe ticks under his demand (more when the wage is
  // expensive) to make the agent show his floor, then read his counter, which he writes into the form:
  // at or within a tick of the demand = firm → 1 tick under it; lower = flexible → 2 ticks under it;
  // the last round takes his counter. Lawrence: £73K → (user opened £60K) → counter £66K → £64K agreed.
  // Reset once to his demand (later Resets restore OUR last suggestion); the tick is measured from
  // our own presses (£1K around £70K, £5K around £125K).
  const p = rules.probe;
  await click('Reset', {name: 'button-secondary-label'}); await settle(800);
  // Measure the tick with one press, then open open_pct under the demand, at least open_min_ticks.
  const first = await salaryTicksDown(1);
  const step = Math.max(1, demand - first);
  // A current wage (renewals: ours; signings: at his club) → the split; else open_pct under.
  const current = renewal?.currentWage ?? currentWage ?? null;
  // A signing's own ceiling (policy contracts.wage_ceiling): what we pay players of his level, and a
  // multiple of what he earns now. Renewals keep the renewal test instead.
  const wc = rules.wage_ceiling;
  const ceiling = !renewal && wc ? wageCeiling({peerMedian: peerBand(player, wc.peer_within_ca)?.peer_median, currentWage: current}, wc) : null;
  const limit = Math.min(Number.isFinite(cap) ? cap : Infinity, ceiling ?? Infinity);
  if (ceiling) entry.ceiling = ceiling;
  const atMost = (salary, k) => Number.isFinite(limit) && salary - k * step > limit ? Math.ceil((salary - limit) / step) : k;
  const useSplit = p.split && Number.isFinite(current) && current > 0 && current < demand;
  const open = useSplit ? Math.max(1, splitTicks({demand, current, target: splitOpening({demand, current}, p), tick: step})) : openingTicks({demand, tick: step}, p);
  entry.method = useSplit ? `split from £${current}` : 'percent';
  const openTicks = Math.max(open, atMost(demand, open));
  let offered = openTicks > 1 ? await salaryTicksDown(openTicks - 1) : first;
  Object.assign(entry, {openTicks, tick: step});
  for (let round = 1; round <= p.max_rounds; round++) {
    if (!(await lowerAgentFeeUntilAllowed())) { entry.tries.push({round, salary: offered, blocked: 'agent fee'}); break; }
    // Preview (user, 2026-10-15: "we can check before you click Suggest Terms"): the opening offer as it
    // would be sent, then stop. Nothing is suggested; the talks stay open.
    if (preview) {
      const pv = {...entry, outcome: 'preview', would_suggest: contractTerms(await Screen.read()), openTicks, tick: step};
      // Leave nothing ready to send: our opening offer stayed in the form and was sent (Savinho £245K,
      // 2032-07-02). Revert puts the form back to his own demands.
      if ((await Screen.read()).buttons('Revert').length) { await click('Revert'); pv.reverted = true; }
      await log(pv);
      return pv;
    }
    // Wait for the agent's line to CHANGE (or Finalize Deal): Suggest Terms stays enabled right after
    // the click, and the old line ("…initial contract demands…") was read as his answer (Lemaitre).
    const before = agentLine(await Screen.read());
    await click('Suggest Terms', {name: 'StandardButton'});
    const r = await waitFor(x => x.buttons('Finalize Deal').length > 0 || (agentLine(x) !== before && suggestEnabled(x)), {what: 'agent reply', timeout: 20000}).catch(() => Screen.read());
    if (agentLine(r) === before && !r.buttons('Finalize Deal').length) {
      await log({...entry, outcome: 'no-reply', salary: offered});
      throw new NeedsAnalyst(`${player}: no reply from the agent after suggesting £${offered}/wk; talks left open, read the screen`, entry);
    }
    entry.tries.push({round, salary: offered, reply: agentLine(r).slice(0, 200)});
    // Accepted, decision pending: no Finalize Deal, the player "would like to go away and think" /
    // "These terms are acceptable but I wish to evaluate all my options" (Tanaka, Grimes 2028-06-27).
    if (!r.buttons('Finalize Deal').length && termsAccepted(r)) {
      await log({...entry, outcome: 'accepted-pending', salary: offered});
      return {...entry, outcome: 'accepted-pending', salary: offered};
    }
    const lastRound = round >= p.max_rounds;
    if (r.buttons('Finalize Deal').length && (!counterLine(r) || lastRound) && !(salaryOf(r) > limit && !entry.renewal)) {
      const agreed = salaryOf(r);   // what is in the form now, not what we offered
      await click('Finalize Deal');
      await waitFor(x => x.buttons('Exit Talks').length > 0, {what: 'deal finalized'});
      await click('Exit Talks');
      await log({...entry, outcome: 'agreed', salary: agreed});
      return {...entry, outcome: 'agreed', salary: agreed};
    }
    // His counter is in the form now.
    const counter = salaryOf(r);
    entry.tries.at(-1).counter = counter;
    if (counter == null || (lastRound && counter > limit && !entry.renewal)) break;
    // Split: halfway between our offer and his counter (ticks below his counter, now in the form).
    const k = round >= p.max_rounds - 1 ? 0
      : useSplit ? Math.max(1, Math.round((counter - Math.max(splitCounter({offered, counter}), current)) / step))
      : nextOfferTicks({demand, counter, tick: step}, p);
    const kk = entry.renewal ? k : atMost(counter, k);   // never above the ceiling
    offered = kk ? await salaryTicksDown(kk) : counter;
  }
  // No agreement: leave the talks open (cancelling loses the player and the agreed fee) and ask.
  await log({...entry, outcome: 'no-agreement'});
  throw new NeedsAnalyst(`${player}: no agreement after ${entry.tries.length} offers (demand £${demand}/wk); talks left open`, entry);
}

// Autopilot handler.
export const handBackContract = {
  name: 'personal-terms',
  // The hand-back ("…contract demands to be unacceptable…") or the "<Player> offer accepted" message
  // (2030-07-14: "LOSC have accepted our offer of £1M for Leo Lemaitre." + the same three buttons).
  match: s => s.buttons('Enter Contract Negotiations').length === 1 && s.buttons('Walk Away').length === 1
    && (s.hasText(/contract demands to be unacceptable/) || s.hasText(/have accepted our offer of/)),
  async run(s, {dryRun = false} = {}) {
    const player = s.texts().map(t => /^Handle (.+) contract (?:negotiations|renewal)$/.exec(t)?.[1] || /have accepted our offer of .+ for (.+?)(?: as it meets his release clause)?\.$/.exec(t)?.[1]).find(Boolean) || '?';
    if (dryRun) throw new NeedsAnalyst(`Personal terms for ${player} (dry run)`);
    if (held(player)) throw new NeedsAnalyst(`${player}: the user holds this deal (fm hold); stop for their decision`, {held: player});
    // The DoF handing a renewal back ("Handle Casadó contract renewal"): judge it by the renewal test.
    const {renewalContext} = await import('./renew.mjs');
    const ctx = await renewalContext(player);   // his current wage (ours, or at his club) from the export
    const renewal = s.hasText(new RegExp(`^Handle .+ contract renewal$`)) ? ctx : null;
    // Signings: the split from his wage at his current club (user's rule: negotiate the raise).
    return negotiatePersonalTerms({player, renewal, currentWage: renewal ? null : ctx?.currentWage ?? null});
  },
};
