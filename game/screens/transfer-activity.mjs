// Our current transfer activity: Recruitment → Transfer Activity. The authoritative list of
// bids we made (and offers received), with status, plus the potential budget impact.
import {goTo, click, waitFor, Screen, parseMoney, toggle, settle} from '../ui/index.mjs';

export async function transferActivity() {
  await goTo('Recruitment');
  // The Recruitment page builds its sub-tabs after the click: wait for the tab first.
  await waitFor(x => x.buttons('Transfer Activity').length === 1, {what: 'Transfer Activity tab'});
  await click('Transfer Activity');
  const s = await waitFor(x => x.hasText('Potential Transfer Budget Impact') && x.items.some(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label), {what: 'Transfer Activity list'}).catch(() => Screen.read());
  // Left list: one toggle per deal, label "<Player> <Status>".
  const deals = s.items.filter(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label).map(i => i.label);
  const after = t => parseMoney(s.after(t, i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  // Detail pane of the selected deal: "Offer Made £7.5M".
  const selected = s.items.find(i => i.kind === 'button' && i.name === 'transfer-link-button')?.label;
  return {deals, selected, potentialBudgetImpact: after('Potential Transfer Budget Impact'), transferBudget: after('Transfer Budget'), payrollAvailable: after('Payroll Budget')};
}

// One deal's details: select its toggle ("<Player> <Stage>") and read the pane on the right
// (value, wage, contract, and the buttons: Accept/Stall/Reject Offer, Cancel Offer, …).
export async function deal(name) {
  await transferActivity();
  const pick = x => x.items.find(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label.toLowerCase().startsWith(name.toLowerCase()));
  const s0 = await Screen.read();
  if (!pick(s0)) throw new Error(`No deal for "${name}" in Transfer Activity: ${s0.items.filter(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label).map(i => i.label).join(' | ')}`);
  await toggle(pick, true, `deal ${name}`);
  await settle(1500);
  const s = await Screen.read();
  // Middle pane, under the player: the other club and the stage with the fee, e.g.
  // "Aston Villa" + "Contract £7M (£13M)" (fee, his value in brackets). Right pane: actions.
  const mid = s.items.filter(i => i.bounds[0] > 480 && i.bounds[0] < 1180 && i.bounds[1] > 330 && i.label);
  const stage = mid.findIndex(i => i.kind === 'button' && /^\w[\w ]* £[\d.]+[KM]? \(£[\d.]+[KM]?\)$/.test(i.label));
  const right = s.items.filter(i => i.bounds[0] >= 1180 && i.bounds[1] > 300 && i.kind === 'button' && /Offer|Accept|Reject|Stall|Withdraw/.test(i.label));
  return {deal: pick(s)?.label, club: stage > 0 ? mid[stage - 1].label : null, stage: stage >= 0 ? mid[stage].label : null, actions: right.map(i => i.label)};
}

// Answer a bid for one of our players from Transfer Activity, without advancing time: open his
// first offer row (the detail page loads slowly) and run the incoming-offer handler on it. `fm run`
// presses Continue first, and the inbox can't scroll to older offer messages (2031-06-19).
export async function answer(name, {club, upfront, dryRun = false} = {}) {
  // A deal can hold several clubs' rows ("Negotiated …" after our counter, "Offer Made …" still open);
  // each row is the club's button, then its stage link. --club picks one.
  const d = await deal(name);
  const row = x => x.items.find((i, k) => i.kind === 'button' && i.name === 'transfer-link-button' && /^Offer Made/.test(i.label)
    && (!club || x.items.slice(Math.max(0, k - 4), k).some(b => b.kind === 'button' && b.label.toLowerCase() === club.toLowerCase())));
  if (!row(await Screen.read())) throw new Error(`No open offer for ${name}${club ? ' from ' + club : ''}: ${d.deal} (${d.stage || '-'})`);
  const {clickWhere} = await import('../ui/controls.mjs');
  // A loan offer opens its own page (Alavés for Ørjasæter, 2031-07-08): any offer handler that matches.
  const {incomingOffer, loanOfferPage} = await import('./transfer-offers.mjs');
  const handler = x => [loanOfferPage, incomingOffer].find(h => h.match(x));
  await clickWhere(row, 'offer row');
  const s = await waitFor(x => handler(x), {what: 'offer details', timeout: 15000});
  return handler(s).run(s, {dryRun, upfront});
}
