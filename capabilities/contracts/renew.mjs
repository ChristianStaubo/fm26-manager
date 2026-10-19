// Contract renewals are delegated to the Director of Football (user rule: staff negotiate
// contracts). Actions → Contract → "DoF To Negotiate Contract", then the confirmation dialog
// "DOF to negotiate contract?" is answered Yes by recover() (ui/overlays.mjs KNOWN_DIALOGS).
import {openPlayer, actionPath, peekActions, recover, isoDate} from '../../game/ui/index.mjs';
import {log} from '../log.mjs';

export async function delegateRenewal(name, club, {dryRun = false} = {}) {
  const profile = await openPlayer(name, club);
  const {sub} = await peekActions('Contract');
  if (sub.includes('Withdraw Contract Offer') || sub.includes('Change Contract Offer')) return {name, already: true, options: sub};
  if (!sub.includes('DoF To Negotiate Contract')) return {name, done: false, reason: 'option not offered', options: sub};
  if (dryRun) return {name, dryRun: true, options: sub};
  await actionPath(['Contract', 'DoF To Negotiate Contract']);
  await recover();
  const after = (await peekActions('Contract')).sub;
  const done = after.includes('Withdraw Contract Offer') || after.includes('Change Contract Offer');
  const result = {action: 'delegate-renewal', name, club, date: isoDate(profile.date()), done};
  await log(result);
  return {...result, options: after};
}

// The renewal test (playbook §6, user 2026-10-15): renewing costs the wage rise over the contract plus
// loyalty bonus and agent fee; it protects his transfer value (which falls to nothing at a free).
// Renew when value >= min_value_x_cost x cost (above the wage cap too); else sell or let him go.
// Holding period 2 seasons (contract backtest): Casadó (125K-62K) x 52 x 2 + 5M + 375K = 12.0M
// vs £18.5M current value → 1.54x renew; Lawrence ~3.9M vs ~15.75M → 4x renew.
export function renewalVerdict({currentWage, value, demand, years, loyaltyBonus = 0, agentFee = 0, age = 0, minutes = 0}, rules) {
  // The wage rise over the holding period (we sell within ~2 seasons), not the whole contract.
  const cost = Math.max(0, demand - currentWage) * 52 * Math.min(years || 1, rules.holding_seasons ?? Infinity) + (loyaltyBonus || 0) + (agentFee || 0);
  const ratio = cost > 0 ? Math.round(100 * value / cost) / 100 : Infinity;
  const verdict = ratio >= rules.min_value_x_cost ? 'renew'
    : value >= rules.sell_over && !(age >= rules.run_down_age && minutes < rules.regular_minutes) ? 'sell' : 'run-down';
  return {cost: Math.round(cost), value, ratio, verdict};
}

// A renewal's context from the save export (current wage, value): the DoF's hand-back message
// ("Handle Casadó contract renewal") names the player, not his numbers.
export async function renewalContext(name) {
  const {exportPath} = await import('../data.mjs');
  const {execFileSync} = await import('node:child_process');
  const code = 'import csv, json, sys\nfor p in csv.DictReader(open(sys.argv[1], encoding="utf8")):\n    if p["name"] == sys.argv[2] and p["contract_club"]:\n        print(json.dumps({"currentWage": float(p["wage"] or 0), "value": float(p["value"] or 0)})); break';
  try { return JSON.parse(execFileSync('python3', ['-c', code, exportPath(), name], {encoding: 'utf8'}) || 'null'); } catch { return null; }
}

// Renew one of ours ourselves (user, 2026-10-14: "you can handle this instead of the DoF"):
// profile → Actions → Contract → Enter Contract Negotiations, then the same talks as for a signing
// (promises → contract form → salary ticks from his demand; personal-terms.mjs).
export async function renewSelf(name, club, {dryRun = false, preview = false} = {}) {
  const {openPlayer, peekActions, actionPath, profileFacts, parseMoney} = await import('../../game/ui/index.mjs');
  const {negotiatePersonalTerms} = await import('./personal-terms.mjs');
  // First his agent (user, 2026-10-19): the chat states his demands, and Contest lowers them (Burton £86-105K →
  // £77-95K). Then the talks, inside that range. The chat is one-time; without it the talks go ahead as before.
  const {discussContract} = await import('../buy/ask.mjs'), {recover} = await import('../../game/ui/index.mjs');
  const chat = dryRun ? null : await discussContract(name, club);
  if (chat?.asked) await recover();   // End Chat: still on his profile
  const {Screen} = await import('../../game/ui/index.mjs');
  // His profile is open after the chat step: no second open, no separate menu peek (Burton's renewal
  // opened the profile and the Actions menu three times in its first 20 s, 2036-07-06).
  // ...unless the game pulled the view away (a required action sends it to Messages, 2036-07-06): re-open.
  const here = await Screen.read(), onProfile = here.items.some(i => i.kind === 'menu' && i.label === 'Actions');
  const profile = dryRun || !onProfile ? await openPlayer(name, club) : here;
  if (dryRun) { const {sub} = await peekActions('Contract'); return {action: 'renew-self', name, done: false, dryRun: true, options: sub}; }
  const facts = profileFacts(profile);
  // Closing the chat can hand the view to a required action a moment later (Messages): re-open him and retry.
  const enter = () => actionPath(['Contract', 'Enter Contract Negotiations']);
  try { await enter(); }
  catch (e) {
    if (e.details?.available) return {action: 'renew-self', name, done: false, options: e.details.available, agent: chat};
    if (!/Actions menu/.test(e.message)) throw e;
    await openPlayer(name, club); await enter();
  }
  await answerEnterDialog();
  // The profile's wage/value can come back empty for our own players (Casadó, 2030-07-17): use the export's.
  const live = {currentWage: facts.wage ?? parseMoney(/£[\d.,]+K?/.exec(facts.contract || '')?.[0] ?? '') ?? null,
    value: facts.valueRange ? (facts.valueRange[0] + facts.valueRange[1]) / 2 : null};
  const ctx = await renewalContext(name);
  const renewal = {currentWage: live.currentWage ?? ctx?.currentWage, value: live.value ?? ctx?.value};
  const r = await negotiatePersonalTerms({player: name, entered: true, renewal, preview});
  return {...r, agent: chat?.asked ? chat.demands : chat?.why};
}
// "Enter contract negotiations?" (talking to the player without the agent chat first): Yes.
export async function answerEnterDialog() {
  const {Screen, overlays, click, settle} = await import('../../game/ui/index.mjs');
  await settle(1200);
  if (overlays(await Screen.read()).some(o => o.kind === 'dialog' && o.title === 'Enter contract negotiations?')) { await click('Yes', {recoverOnOcclusion: false}); await settle(1500); }
}
