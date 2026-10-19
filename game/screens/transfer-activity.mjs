// Our current transfer activity: Recruitment → Transfer Activity. The authoritative list of
// bids we made (and offers received), with status, plus the potential budget impact.
import {goTo, click, clickWhere, waitFor, Screen, parseMoney, toggle, settle, isoDate} from '../ui/index.mjs';
import {splitLabel, stageState} from '../../capabilities/deals/deals.mjs';

export async function transferActivity() {
  await goTo('Recruitment');
  // The Recruitment page builds its sub-tabs after the click: wait for the tab first.
  await waitFor(x => x.buttons('Transfer Activity').length === 1, {what: 'Transfer Activity tab'});
  await click('Transfer Activity');
  // The rows render with the stage first ("Offer Made") and the names a moment later (2033-08-05: four
  // deals read with no player): wait for named rows, else take what is there (stage-only rows exist).
  const list = x => x.hasText('Potential Transfer Budget Impact') && x.items.some(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label);
  const named = x => list(x) && x.items.filter(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label).every(i => splitLabel(i.label).player);
  const s = await waitFor(named, {what: 'Transfer Activity rows with names', timeout: 6000})
    .catch(() => waitFor(list, {what: 'Transfer Activity list', timeout: 4000})).catch(() => Screen.read());
  // Left list: one toggle per deal, label "<Player> <Status>". Some rows label the toggle with the
  // stage only ("Contract", 2032-01-06: three unnamed signings): the name is a text inside the row.
  const toggles = s.items.filter(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label);
  const deals = toggles.map(i => i.label);
  const inside = (t, i) => i.bounds[0] >= t.bounds[0] - 2 && i.bounds[1] >= t.bounds[1] - 2 && i.bounds[0] + i.bounds[2] <= t.bounds[0] + t.bounds[2] + 2 && i.bounds[1] + i.bounds[3] <= t.bounds[1] + t.bounds[3] + 2;
  const rows = toggles.map(t => {
    const r = splitLabel(t.label);
    if (!r.player) r.player = s.items.find(i => i !== t && ['text', 'button'].includes(i.kind) && i.label && inside(t, i) && !stageState(i.label) && !/^£/.test(i.label))?.label ?? null;
    return r;
  });
  const after = t => parseMoney(s.after(t, i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  // Detail pane of the selected deal: "Offer Made £7.5M".
  const selected = s.items.find(i => i.kind === 'button' && i.name === 'transfer-link-button')?.label;
  return {deals, rows, selected, potentialBudgetImpact: after('Potential Transfer Budget Impact'), transferBudget: after('Transfer Budget'), payrollAvailable: after('Payroll Budget')};
}

// One deal's details: select its toggle ("<Player> <Stage>") and read the pane on the right
// (value, wage, contract, and the buttons: Accept/Stall/Reject Offer, Cancel Offer, …).
export async function deal(name) {
  await transferActivity();
  // By full name, or a surname from a message ("Offers made for Brentford's Gallardo").
  const pick = x => x.items.find(i => i.kind === 'toggle' && i.bounds[0] < 480 && (i.label.toLowerCase().startsWith(name.toLowerCase()) || i.label.toLowerCase().includes(' ' + name.toLowerCase() + ' ')));
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
  // Select him the way fm activity does (scrolls rows hidden behind the header or footer, waits out the
  // re-render): the old deal() click hit "Element is occluded" for Gray and Finck (2036-07-10).
  const {selectDeal} = await import('./activity.mjs');
  const d = {deal: (await selectDeal(name)).items.find(i => i.kind === 'toggle' && i.checked && i.bounds[0] < 480)?.label, stage: null};
  const row = x => x.items.find((i, k) => i.kind === 'button' && i.name === 'transfer-link-button' && /^Offer Made/.test(i.label)
    && (!club || x.items.slice(Math.max(0, k - 4), k).some(b => b.kind === 'button' && b.label.toLowerCase() === club.toLowerCase())));
  if (!row(await Screen.read())) throw new Error(`No open offer for ${name}${club ? ' from ' + club : ''}: ${d.deal} (${d.stage || '-'})`);
  const {clickWhere} = await import('../ui/controls.mjs');
  // A loan offer opens its own page (Alavés for Ørjasæter, 2031-07-08): any offer handler that matches.
  const {incomingOffer, loanOfferPage, plainLoanPage} = await import('./transfer-offers.mjs');
  const handler = x => [loanOfferPage, plainLoanPage, incomingOffer].find(h => h.match(x));
  await clickWhere(row, 'offer row');
  const s = await waitFor(x => handler(x), {what: 'offer details', timeout: 15000});
  return handler(s).run(s, {dryRun, upfront});
}

// "Offers made for Brentford's <Player>" (several clubs at once, 2032-08-05), or "Loan offers made for
// Brentford's <Player>" (Köln and Werder for Đukić, 2033-08-15): answer every open offer for him, one
// club at a time, with the usual pricing (incoming-offer / loan handlers).
export const offersSummary = {
  name: 'offers-summary',
  match: s => s.hasText(/^(Loan offers|Offers) made for .+'s .+$/),
  async run(s, {dryRun = false} = {}) {
    const surname = /^(?:Loan offers|Offers) made for .+'s (.+)$/.exec(s.texts().find(t => /^(Loan offers|Offers) made for .+'s .+$/.test(t)))[1];
    const answered = [];
    for (let i = 0; i < 5; i++) {
      try { answered.push(await answer(surname, {dryRun})); }
      catch (e) { if (/No open offer/.test(e.message)) break; answered.push({error: e.message.slice(0, 160)}); if (dryRun) break; }
    }
    return {action: 'offers-summary', player: surname, answered};
  },
};

// Withdraw our bid from Transfer Activity (mapped by the user, 2036-06-04, on a stray £17.25M offer for
// Pepper): select the deal, tick the box at the foot of the pane by "N Active Offers" (Withdraw Offer stays
// disabled until it is ticked), click Withdraw Offer. No confirmation follows, and the list keeps showing
// "Offer Made" until the next day: recorded as talks ended today (capabilities/deals/cancelled.mjs), so the
// offers check doesn't flag it and no bid reopens them today.
/** The box by "N Active Offers" at the foot of a deal's pane: ticked, it enables Withdraw Offer. */
export const offersBox = x => { const f = x.items.find(i => i.kind === 'text' && /Active Offers/.test(i.label || ''));
  return f ? x.items.find(i => i.kind === 'toggle' && !i.label && i.bounds[0] < 520 && Math.abs(i.bounds[1] - f.bounds[1]) < 20) : undefined; };
export async function withdrawBid(name) {
  const d = await deal(name);
  const s = await Screen.read(), offer = s.items.find(i => i.kind === 'button' && i.name === 'transfer-link-button' && /^Offer Made/.test(i.label));
  if (!offer) return {action: 'withdraw', name, withdrawn: false, why: `no open offer in ${d.deal}`};
  await toggle(offersBox, true, 'select the offers');
  await waitFor(x => x.buttons().some(b => b.name === 'withdraw-button' && b.enabled), {what: 'Withdraw Offer enabled', timeout: 5000});
  await clickWhere(x => x.buttons().find(b => b.name === 'withdraw-button' && b.enabled), 'Withdraw Offer');
  await settle(800);
  const date = isoDate(s.date());
  (await import('../../capabilities/deals/cancelled.mjs')).recordCancelled(name, date, 'activity');   // dead today: no same-day re-bid
  return {action: 'withdraw', name, withdrawn: true, offer: offer.label, date, note: 'no confirmation; the list shows it until the next day'};
}
