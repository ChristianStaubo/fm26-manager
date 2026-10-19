// Transfer Activity in one place (user, 2026-10-19: "we can stay on this tab"): read every deal and every
// offer row once, and accept / reject / stall an offer with the row's own buttons, without opening offer
// pages or navigating back each time. Mapped 2036-07-06:
//   left list: one toggle per deal ("<Player> Offer Made", "<Player> 2 Offers", "<Player> Contract");
//     the list re-orders after an action and the last rows sit behind the pane's footer: scroll first.
//   right pane, per offer: a row ("Transfer £17,000,000 over 2 Instalments …" or "Loan End of season
//     Important Player …"), the club's button, the stage link ("Offer Made £62M (£89M)": upfront (total);
//     loans "Offer Made £7K (£9.75K) p/m Wages: 50% (60%)"), then accept / stall / cancel-reject buttons.
//   A reject takes effect at once, with no dialog (Arsenal for Rosete: the budget impact fell by £62M).
// One `fm answer` per offer took 7-13 s and re-navigated each time; a deal here reads in ~1.7 s.
import {Screen, toggle, waitFor, settle, clickWhere, scrollWithin, parseMoney} from '../ui/index.mjs';
import {transferActivity} from './transfer-activity.mjs';

const onPage = s => s.hasText('Potential Transfer Budget Impact') && s.items.some(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label);
const dealToggles = s => s.items.filter(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label);
const LIST_BOTTOM = 760;   // rows below this sit behind the pane's footer (Rosete at y 803, 2036-07-06)

/** The offer rows of the selected deal. */
export function offerRows(s) {
  return s.items.filter(i => i.kind === 'row' && i.bounds[0] > 470).map(r => {
    const inRow = s.items.filter(i => i.bounds[1] >= r.bounds[1] - 2 && i.bounds[1] < r.bounds[1] + r.bounds[3] && i.bounds[0] >= r.bounds[0]);
    const stage = inRow.find(i => i.name === 'transfer-link-button')?.label || '';
    const btn = n => { const b = inRow.find(i => i.name === n); return b ? b.enabled !== false : null; };
    const money = /^\w[\w ]*? (£[\d.,]+[KM]?)(?: \((£[\d.,]+[KM]?)\))?/.exec(stage);
    const loan = /^Loan\b/.test(r.label || '');
    return {club: inRow.find(i => i.name === 'ClubButton' && i.label)?.label ?? null, kind: loan ? 'loan' : 'transfer', terms: r.label, stage,
      status: /^(Offer Made|Contract|Negotiat\w*|Work Permit|Confirmation|Medical)/.exec(stage)?.[1] ?? stage.split(' £')[0],
      upfront: money ? parseMoney(money[1]) : null, total: money?.[2] ? parseMoney(money[2]) : null,
      wageShare: loan ? Number(/Wages: (\d+)%/.exec(stage)?.[1]) / 100 : null, playingTime: loan ? /(Star Player|Important Player|Regular Starter|Squad Player|Impact Sub|Fringe Player|Breakthrough Prospect)/.exec(r.label || '')?.[1] ?? null : null,
      actions: {accept: btn('accept-button'), stall: btn('stall-button'), reject: btn('cancel-reject-button')}};
  });
}

async function open() {
  if (!onPage(await Screen.read())) await transferActivity();
}

/** Select one deal (scrolling it into view first). */
export async function selectDeal(player) {
  await open();
  const pick = x => dealToggles(x).find(i => i.label.toLowerCase().startsWith(player.toLowerCase()));
  for (let k = 0; k < 4; k++) {
    if (!onPage(await Screen.read())) await transferActivity();   // the game can pull us to Messages (a required action)
    const t = pick(await Screen.read());
    if (!t) throw new Error(`No deal for "${player}": ${dealToggles(await Screen.read()).map(i => i.label).join(' | ')}`);
    if (t.bounds[1] + t.bounds[3] <= LIST_BOTTOM) break;
    // Scroll the list from a deal that is fully in view (the hidden one's own box is occluded).
    await scrollWithin(x => dealToggles(x).find(i => i.bounds[1] + i.bounds[3] <= LIST_BOTTOM), 250, 'deal list'); await settle(300);
  }
  // The list re-renders after every action: wait for his row, and retry a click that lands mid-render.
  await waitFor(x => onPage(x) && pick(x), {what: `deal ${player} in the list`, timeout: 8000});
  for (let k = 0; ; k++) {
    try { await toggle(pick, true, `deal ${player}`); break; }
    catch (e) { if (k >= 2 || !/UI content changed|occluded/.test(e.message)) throw e; await settle(500); }
  }
  await waitFor(x => pick(x)?.checked, {what: `deal ${player} selected`});
  await settle(350);
  return pick(await Screen.read()).label;
}

/** Every deal with its offer rows, in one pass on the tab. */
export async function readActivity() {
  await open();
  const names = dealToggles(await Screen.read()).map(i => i.label);
  const deals = [];
  for (const label of names) {
    const player = label.replace(/ (Offer Made|\d+ Offers|Contract|Work Permit|Confirmation|Medical|Negotiat\w*)$/, '');
    try {
      await selectDeal(player);
      deals.push({player, deal: label, offers: offerRows(await Screen.read())});
    } catch (e) { deals.push({player, deal: label, error: e.message.slice(0, 120)}); }
  }
  return {deals};
}

/** Accept / reject / stall one offer from its row (club picks the row when a deal holds several). */
export async function actOnOffer(player, club, action, {dryRun = false} = {}) {
  const name = {accept: 'accept-button', reject: 'cancel-reject-button', stall: 'stall-button'}[action];
  if (!name) throw new Error('action: accept | reject | stall');
  await selectDeal(player);
  const s = await Screen.read(), rows = offerRows(s);
  const row = club ? rows.find(r => r.club?.toLowerCase() === club.toLowerCase()) : rows.length === 1 ? rows[0] : null;
  if (!row) throw new Error(`${player}: name the club (--club): ${rows.map(r => `${r.club} ${r.stage}`).join(' | ')}`);
  if (!row.actions[action]) throw new Error(`${player} / ${row.club}: ${action} is not available (${row.stage})`);
  if (dryRun) return {action, player, club: row.club, offer: row, dryRun: true};
  const before = s.texts().find(t => /^\(?-?£/.test(t) && s.texts().indexOf(t) === s.texts().indexOf('Potential Transfer Budget Impact') + 1);
  const target = x => { const c = x.items.find(i => i.name === 'ClubButton' && i.label === row.club && i.bounds[0] > 470); return c && x.items.find(i => i.name === name && Math.abs(i.bounds[1] - c.bounds[1]) < 20 && i.enabled !== false); };
  await clickWhere(target, `${player} ${row.club} ${action}`);
  await settle(900);
  const after = await Screen.read();
  return {action, player, club: row.club, offer: row, budgetImpact: {before, after: after.texts()[after.texts().indexOf('Potential Transfer Budget Impact') + 1]}};
}
