// Buy a player in one sitting with "Suggest Terms" (the club answers immediately).
// Recorded from the user negotiating for Jack Grealish (2026-10-04, docs in README.md):
//   offer screen → set Fee → Suggest Terms → the General Manager line on the right says
//     "… have negotiated the offer …" / "… have responded to the latest offer …"  → a counter:
//        the club's demand is written INTO the form (fee, instalments, add-on fees);
//        buttons: Accept Demands | Withdraw Offer (or edit fields → Suggest Terms again)
//     "… are prepared to accept the latest offer …"  → Make Offer (finalize)
//     "An offer has been made for …"                → Exit Talks; the club then confirms the
//        fee and contract talks follow later as a NeedAction.
import {Screen, waitFor, click, setFee, recover, openPlayer, actionPath, peekActions, profileFacts,
  isoDate, parseMoney, parseRange, NeedsAnalyst} from '../../ui/index.mjs';
import {loadRules} from './decide.mjs';
import {log} from '../log.mjs';

// Opening bid: rules.buying.open_at × the bottom of the valuation (lower if the club wants to sell).
export function openingBid(facts, {keenToSell = false} = {}) {
  const b = loadRules().buying;
  return Math.round(facts.valueRange[0] * (keenToSell ? b.open_at_if_club_keen_to_sell : b.open_at));
}
export const defaultMax = facts => Math.round(facts.valueRange[1] * loadRules().buying.default_max);

// Is there a pending bid of ours? (Actions → Transfer then offers "Withdraw Transfer Offer".)
export async function pendingOffer(name, club) {
  await openPlayer(name, club);
  const {top, sub} = await peekActions('Transfer');
  return {pending: sub.includes('Withdraw Transfer Offer'), top, transfer: sub};
}

// ---- Reading the offer screen ----------------------------------------------------------
const gmLine = s => s.buttons(/General Manager/)[0]?.label || '';
export function offerState(s) {
  const gm = gmLine(s);
  const money = label => parseMoney(s.after(label, i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  const state = /An offer has been made/i.test(gm) || s.hasText(/An offer has been made/) ? 'made'
    : /prepared to accept/i.test(gm) ? 'accepted'
    : /negotiated the offer|responded to the latest offer/i.test(gm) ? 'countered'
    : s.buttons('Suggest Terms').length ? 'editing'
    : 'unknown';
  return {state, gm, upfront: money('Current Transfer Budget Cost:'), total: money('Future & Potential Total Cost with Additional Fees:')};
}
// Value of a deal for comparisons: guaranteed cost plus add-ons at rules.valuation.addon_weight.
const dealValue = o => (o.upfront ?? 0) + ((o.total ?? o.upfront ?? 0) - (o.upfront ?? 0)) * loadRules().valuation.addon_weight;

async function suggest() {
  await click('Suggest Terms');
  return offerState(await waitFor(x => ['countered', 'accepted', 'made'].includes(offerState(x).state) && !x.buttons('Suggest Terms').length, {what: 'club response', timeout: 10000}));
}
async function finalize() {
  await click('Make Offer');
  await waitFor(x => offerState(x).state === 'made' || x.buttons('Exit Talks').length > 0, {what: 'offer made'});
  if ((await Screen.read()).buttons('Exit Talks').length) await click('Exit Talks');
}

/**
 * Negotiate on an open offer screen (fresh, or already countered by the club).
 * firstFee: our opening fee if the screen is fresh. max: walk-away deal value
 * (up front + rules.valuation.addon_weight × add-ons). Raises by `step` per round; once the club
 * asks for more than `max`, makes one final offer worth exactly `max` (keeping their add-ons),
 * then withdraws if still refused. Returns {outcome: 'agreed'|'accepted-demands'|'walked-away', history}.
 */
export async function negotiate({firstFee, max, step, rounds = 6}) {
  const history = [];
  let fee = firstFee, finalOffer = false;
  for (let round = 1; round <= rounds; round++) {
    let reply = offerState(await Screen.read());
    if (reply.state === 'editing') {
      const set = await setFee('Fee', fee);
      reply = await suggest();
      history.push({round, offered: set.set, ...reply});
    } else history.push({round, ...reply});
    if (reply.state === 'accepted') { await finalize(); return {outcome: 'agreed', history}; }
    if (reply.state === 'made') return {outcome: 'agreed', history};
    if (reply.state !== 'countered') throw new NeedsAnalyst(`Unexpected offer state: ${reply.state}`, reply);
    if (dealValue(reply) <= max) {
      // Accept Demands submits the offer directly ("An offer has been made" → Exit Talks).
      await click('Accept Demands');
      const after = offerState(await waitFor(x => ['accepted', 'made'].includes(offerState(x).state), {what: 'demands accepted'}));
      if (after.state === 'accepted') await finalize();
      else if ((await Screen.read()).buttons('Exit Talks').length) await click('Exit Talks');
      return {outcome: 'accepted-demands', demand: reply, history};
    }
    if (finalOffer) break;
    const addons = (reply.total ?? reply.upfront) - reply.upfront;
    const next = (fee ?? 0) + step;
    // Their demand is above our max: go to max (as up-front fee net of their add-ons) as a final offer.
    // Started from a club counter (our previous fee unknown) → straight to the final offer.
    if (fee == null || next + addons * loadRules().valuation.addon_weight >= max) { fee = Math.max(0, Math.round(max - addons * loadRules().valuation.addon_weight)); finalOffer = true; }
    else fee = next;
    // Editing any field brings back Suggest Terms.
    await setFee('Fee', fee);
    await waitFor(x => x.buttons('Suggest Terms').length === 1, {what: 'Suggest Terms'});
  }
  await click('Withdraw Offer');
  return {outcome: 'walked-away', history};
}

/**
 * buyPlayer('Marius Broholm', 'LOSC Lille', {open?, max?, rounds?, dryRun?})
 * Opens Make An Offer and negotiates in one sitting (Suggest Terms). open: first fee (default
 * openingBid); max: walk-away deal value (default 1.1 × top of value).
 */
export async function buyPlayer(name, club, {open, max, rounds = 6, dryRun = false} = {}) {
  const profile = await openPlayer(name, club);
  const facts = profileFacts(profile);
  const {top, sub} = await peekActions('Transfer');
  if (sub.includes('Withdraw Transfer Offer')) return {action: 'buy', name, club, alreadyPending: true};
  if (top.includes('Make An Offer')) await actionPath(['Make An Offer']);
  else if (sub.includes('Make An Offer')) await actionPath(['Transfer', 'Make An Offer']);
  else throw new NeedsAnalyst(`No "Make An Offer" for ${name}`, {top, transfer: sub});
  // A fresh offer screen has Suggest Terms. After an earlier negotiation for the same player the
  // screen comes back PRE-FILLED with that offer (fee, instalments, add-ons) and only Make Offer
  // (Ribeiro, 2026-07-13: £18.25M + £14.5M instalments + £155K/appearance); editing a field
  // brings Suggest Terms back.
  const s = await waitFor(x => x.buttons('Suggest Terms').length === 1 || x.buttons('Make Offer').length === 1, {what: 'offer screen'});
  const prefilled = !s.buttons('Suggest Terms').length;
  // Leave without bidding: Cancel where the screen has one, else navigate away (the pre-filled
  // page has no Cancel; leaving it registered no bid, 2026-07-13).
  const leave = async () => { if ((await Screen.read()).buttons('Cancel').some(b => b.name === 'StandardButton')) await click('Cancel', {name: 'StandardButton'}); else await recover().then(() => click('Portal')); };
  facts.valueRange ??= offerValueRange(s);
  if (!facts.valueRange && (open === undefined || max === undefined)) { await leave(); throw new NeedsAnalyst(`No valuation for ${name}; pass --open and --max`, facts); }
  const keenToSell = s.hasText(/keen to offload|looking to sell|placed him on the transfer list/i);
  const walkAway = max ?? defaultMax(facts);
  let fee = Math.min(open ?? openingBid(facts, {keenToSell}), walkAway);
  // Pre-filled extras stay in the offer: set the fee so the TOTAL is our opening bid.
  const st = offerState(s), feeBox = parseMoney(s.after('Fee', i => i.kind === 'button' && parseMoney(i.label) !== null)?.label);
  const extras = prefilled && st.total != null && feeBox != null ? Math.max(0, st.total - feeBox) : 0;
  if (extras) fee = Math.max(0, fee - extras);
  const base = {action: 'buy', name, club, date: isoDate(profile.date()), facts, max: walkAway, ...(prefilled ? {prefilled: {fee: feeBox, total: st.total, extras}} : {})};
  if (dryRun) {
    // Fresh screen: fill the fee to check it, then Cancel. Pre-filled screen: change nothing.
    if (!prefilled) await setFee('Fee', fee);
    await leave();
    await waitFor(x => !x.buttons('Suggest Terms').length && !x.buttons('Make Offer').length, {what: 'offer screen closed'});
    return {...base, dryRun: true, wouldOpenAt: fee};
  }
  if (prefilled) { await setFee('Fee', fee); await waitFor(x => x.buttons('Suggest Terms').length === 1, {what: 'Suggest Terms after editing'}); }
  const r = await negotiate({firstFee: fee, max: walkAway, step: buyStep(facts), rounds});
  await log({...base, ...r});
  return {...base, ...r};
}

// Valuation shown on an offer screen ("Transfer Value": a range, or one exact amount).
export function offerValueRange(s) {
  const v = s.after('Transfer Value', i => parseRange(i.label) !== null || /^£[\d.]+[KM]$/.test(i.label))?.label;
  if (!v) return null;
  return parseRange(v) || [parseMoney(v), parseMoney(v)];
}
export const buyStep = facts => Math.max(250000, Math.round(facts.valueRange[0] * loadRules().buying.raise_step));
