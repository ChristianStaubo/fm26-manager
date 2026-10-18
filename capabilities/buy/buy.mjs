// Buy a player in one sitting with "Suggest Terms" (the club answers immediately).
// Recorded from the user negotiating for Jack Grealish (2026-10-04, docs in README.md):
//   offer screen → set Fee → Suggest Terms → the General Manager line on the right says
//     "… have negotiated the offer …" / "… have responded to the latest offer …"  → a counter:
//        the club's demand is written INTO the form (fee, instalments, add-on fees);
//        buttons: Accept Demands | Withdraw Offer (or edit fields → Suggest Terms again)
//     "… are prepared to accept the latest offer …"  → Make Offer (finalize)
//     "An offer has been made for …"                → Exit Talks; the club then confirms the
//        fee and contract talks follow later as a NeedAction.
import {Screen, waitFor, click, clickWhere, setFee, recover, openPlayer, actionPath, peekActions, profileFacts,
  isoDate, parseMoney, parseRange, NeedsAnalyst, overlays} from '../../game/ui/index.mjs';
import {loadRules} from '../sell/decide.mjs';
import {log} from '../log.mjs';
import {gate} from '../approvals.mjs';
import {askAgent} from './ask.mjs';
import {classify, saveReplyScreen} from '../deals/replies.mjs';

// Opening bid: rules.buying.open_at × FM's value, the middle of the range (lower if the club wants
// to sell). Bids well below value get a flat "unacceptable", which ends the deal.
export function openingBid(facts, {keenToSell = false, priority = false, finalYear = false} = {}) {
  const b = loadRules().buying, mid = (facts.valueRange[0] + facts.valueRange[1]) / 2;
  // A priority target: his asking price, not a lowball that gets flatly rejected (user, 2035-06-18).
  if (priority) return Math.round(facts.askingPrice ?? facts.valueRange[1]);
  // Last year of his contract: the club takes much less (Yılmaz at 0.69x, 2035-06-18). Profile value,
  // not the agent's range (the agent quoted £12.5-15M).
  if (finalYear) { const r = facts.valueRangeProfile || facts.valueRange; return Math.round((r[0] + r[1]) / 2 * (b.final_year_open_at ?? 0.7)); }
  return Math.round(mid * (keenToSell ? b.open_at_if_club_keen_to_sell : b.open_at));
}
/** A priority target: the approval's note says why we want him badly (policy buying.priority_notes). */
export const isPriority = (approved, b = loadRules().buying) => !!approved?.note && new RegExp(b.priority_notes || 'wonderkid', 'i').test(approved.note);
/** His contract ends within a year of `date` ("£79K p/w 6/30/2040"). */
export function inFinalYear(contract, date) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(contract || '');
  if (!m || !date) return false;
  return (Date.UTC(+m[3], +m[1] - 1, +m[2]) - Date.parse(date)) / 864e5 <= 366;
}
export const defaultMax = facts => Math.round(facts.valueRange[1] * loadRules().buying.default_max);

// Is there a pending bid of ours? (Actions → Transfer then offers "Withdraw Transfer Offer".)
export async function pendingOffer(name, club) {
  await openPlayer(name, club);
  const {top, sub} = await peekActions('Transfer');
  return {pending: sub.includes('Withdraw Transfer Offer'), top, transfer: sub};
}

/** Withdraw our pending bid (Transfer → Withdraw Transfer Offer → "Are you sure…" Yes; Koumeyi 2035-01-11). */
export async function withdrawOffer(name, club, {why = ''} = {}) {
  const {pending} = await pendingOffer(name, club);
  if (!pending) return {action: 'withdraw-offer', name, club, pending: false};
  await actionPath(['Transfer', 'Withdraw Transfer Offer']);
  await waitFor(x => x.hasText(/withdraw your transfer bid/) && x.buttons('Yes').length === 1, {what: 'Withdraw Transfer Offer dialog'});
  await click('Yes');
  await waitFor(x => !x.hasText(/withdraw your transfer bid/), {what: 'Withdraw dialog closed'});
  const entry = {action: 'withdraw-offer', name, club, date: isoDate((await Screen.read()).date()), why};
  await log(entry);
  return entry;
}

// ---- Reading the offer screen ----------------------------------------------------------
// The GM's line starts with his name ("Phil Giles General Manager …"); a news story that mentions
// another club's general manager ("…Man Utd General Manager Jason Wilcox…", 2032-01-04) is not it.
// The GM's own messages only: his panel's label runs on into other staff's advice ("… Harry Kane
// Assistant Coach Advice … wage total to be seen as acceptable", 2034-08-19: Girona's counter for
// Arnalot was read as accepted). Cut at the next staff role.
export const gmLine = s => (s.buttons(/^\S+(?: \S+){0,3} General Manager /)[0]?.label || '')
  .replace(/(?<=[.!?])\s+(?:\S+\s+){1,3}(?:Assistant Coach|Assistant Manager|Assistant|Head of [A-Z]\w+|Director of Football|Chief Scout|Head Coach)\b[\s\S]*$/, '');
export function offerState(s) {
  const gm = gmLine(s);
  const money = label => parseMoney(s.after(label, i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  // Suggest Terms on screen = our edit is pending: the General Manager line can still show an
  // earlier reply ("LOSC have negotiated the offer…" from June on Ribeiro's pre-filled screen,
  // 2026-07-13), which read as 'countered' and made fm buy reach for Accept Demands.
  const state = /An offer has been made/i.test(gm) || s.hasText(/An offer has been made/) ? 'made'
    : s.buttons('Suggest Terms').length ? 'editing'
    // A flat no: nothing written into the form, no Accept Demands ("LOSC believe the offer for
    // Alexsandro Ribeiro is unacceptable", 2026-07-13). Raise and suggest again.
    : /is unacceptable|have rejected/i.test(gm) ? 'rejected'
    // "… are prepared to accept the latest offer", or "LOSC feel the offer … is acceptable and are
    // pleased at such swift negotiations. Finalize the offer …" (2026-07-13).
    : /prepared to accept|(?<!un)acceptable/i.test(gm) ? 'accepted'
    : /negotiated the offer|responded to the latest offer/i.test(gm) ? 'countered'
    : 'unknown';
  return {state, gm, upfront: money('Current Transfer Budget Cost:'), total: money('Future & Potential Total Cost with Additional Fees:')};
}
// Value of a deal for comparisons: guaranteed cost plus add-ons at rules.valuation.addon_weight.
// The counter's clause rows (Racing Santander for Gaitán, 2030-07-14): "Additional Clauses" + Add,
// then per row a label ("Percentage Of Profit From Next Sale"), its value dropdown ("40%") and a
// remove button (buttons-controls-pc-default) on the same line. Also seen: "Loan Back Length".
/** A sell-on clause we won't sign: above policy buying.max_sell_on_pct (0: none at all). */
export const sellOnBlocks = (pct, policy = loadRules()) => (parseFloat(String(pct)) || 0) > (policy.buying?.max_sell_on_pct ?? 0);
export function sellOnRow(s) {
  const t = s.items.find(i => i.kind === 'text' && SELL_ON.test(i.label));
  if (!t) return null;
  const sameRow = i => Math.abs(i.bounds[1] - t.bounds[1]) < 20 && i.bounds[0] > t.bounds[0];
  const value = s.items.find(i => i.kind === 'dropdown' && sameRow(i) && /%/.test(i.label));
  const remove = s.items.find(i => i.kind === 'button' && i.name === 'buttons-controls-pc-default' && sameRow(i));
  return remove ? {label: t.label, pct: value?.label ?? null, remove} : null;
}
// "Gaitán has a minimum fee release clause of £12,750,000." on the offer screen (2030-07-14): the
// club must accept that fee, so we offer exactly it with no extra clauses (user, 2026-10-14).
export const releaseClause = s => parseMoney(s.texts().map(t => /minimum fee release clause of (£[\d,.]+[MK]?)/i.exec(t)?.[1]).find(Boolean) ?? null);
// Every extra's remove button, top to bottom: "Additional Fees" (add-ons: "Per League Appearance
// 10 games £88K", Gaitán) and "Additional Clauses" (sell-on, loan back). A release-clause payment
// left the add-on in (£12.75M became £13.75M) when only the clauses were removed.
export function clauseRows(s) {
  const head = s.items.find(i => i.kind === 'text' && i.label === 'Additional Fees') || s.items.find(i => i.kind === 'text' && i.label === 'Additional Clauses'),
    stop = s.items.find(i => i.kind === 'button' && i.label === 'Undo');
  if (!head) return [];
  return s.items.filter(i => i.kind === 'button' && i.name === 'buttons-controls-pc-default' && i.bounds[1] > head.bounds[1] && (!stop || i.bounds[1] < stop.bounds[1]));
}
// The label on a clause row's line ("Loan Back Length", "Percentage Of Profit From Next Sale", …).
// The form's labels sit at x ≈ 458; the inbox list further left (x < 400) is not the row's.
export const rowLabel = (s, btn) => s.items.filter(i => i.kind === 'text' && i.bounds[0] >= 400 && i.bounds[0] < btn.bounds[0] && Math.abs(i.bounds[1] - btn.bounds[1]) < 20)
  .sort((a, b) => Math.abs(a.bounds[1] - btn.bounds[1]) - Math.abs(b.bounds[1] - btn.bounds[1]))[0]?.label || '';
// Portfolio buys keep a loan back (user, 2026-10-15: "ideally their club asks for the loan back, and
// we accept that"): the kid stays and plays. First-team buys strip it (Gaitán's loan back).
const removable = (s, keepLoanBack) => clauseRows(s).filter(b => !(keepLoanBack && /Loan Back/i.test(rowLabel(s, b))));
async function removeAllClauses({keepLoanBack = false} = {}) {
  for (let n = removable(await Screen.read(), keepLoanBack).length; n > 0; n--) {
    await clickWhere(s => removable(s, keepLoanBack)[0], 'clause remove button');
    await waitFor(x => removable(x, keepLoanBack).length < n, {what: 'clause removed'});
  }
}
// Pay the release clause: no clauses, fee = the clause, Suggest Terms (or Make Offer), finalize.
export async function payReleaseClause(fee, {keepLoanBack = false} = {}) {
  await removeAllClauses({keepLoanBack});
  const set = await setFee('Fee', fee);
  if (await nextStep() === 'make') return {...await makeOffer([]), outcome: 'release-clause', fee: set.set};
  const reply = await suggest();
  if (reply.state === 'accepted') await finalize();
  else if (reply.state !== 'made') throw new NeedsAnalyst(`Release clause fee ${fee} not accepted: ${reply.state}`, reply);
  return {outcome: 'release-clause', fee: set.set, reply};
}
async function removeSellOn() {
  await clickWhere(s => sellOnRow(s)?.remove, 'sell-on clause remove button');
  await waitFor(x => !sellOnRow(x), {what: 'sell-on clause removed'});
}
export const SELL_ON = /sell[- ]?on|next sale|future sale|percentage of (the )?(profit|fee)/i;
const dealValue = o => (o.upfront ?? 0) + ((o.total ?? o.upfront ?? 0) - (o.upfront ?? 0)) * loadRules().valuation.addon_weight;

// The club's reply read from the General Manager line alone (offerState says 'editing' while
// Suggest Terms is on screen, whatever the line says).
export function replyState(s) {
  // The answers are an explicit set (capabilities/deals/replies.mjs). 'notes' is the line before any
  // answer; an agreement after Make Offer counts as made.
  const state = s.hasText(/An offer has been made/) ? 'made' : classify(gmLine(s));
  return state === 'notes' ? null : state === 'agreement' ? 'made' : state;
}
// Suggest Terms, then wait for the reply: a NEW General Manager line (or Suggest Terms gone).
// "Timed out waiting for club response" (Maza, Atubolu 2028-06): the reply can take longer than
// 10 s, and a reply that leaves Suggest Terms on screen was never recognised. On a timeout the
// screen is saved for the fixer (local/runs/buy-timeout-*.json) instead of guessing.
async function suggest() {
  const before = gmLine(await Screen.read());
  await click('Suggest Terms');
  const end = Date.now() + 30000;
  for (;;) {
    const x = await Screen.read(), r = replyState(x), ov = overlays(x).filter(o => o.kind === 'dialog');
    // A line we have never seen: stop now and keep the screen (it becomes a test), no 30 s wait.
    if (r === 'unknown' && gmLine(x) !== before) {
      const dump = saveReplyScreen('unknown-reply', x, {gm: gmLine(x)});
      throw new NeedsAnalyst(`Unknown club answer: ${gmLine(x).slice(0, 160)} (screen saved in local/runs/unknown-reply-*.json)`, dump);
    }
    if (r && (!x.buttons('Suggest Terms').length || gmLine(x) !== before)) return {...offerState(x), state: r};
    if (Date.now() > end || ov.length) {
      const dump = saveReplyScreen('buy-timeout', x, {gmBefore: before, gm: gmLine(x), overlays: ov});
      throw new NeedsAnalyst(ov.length ? 'A dialog opened after Suggest Terms' : 'Timed out waiting for club response (30 s); screen saved in local/runs/buy-timeout-*.json', dump);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}
async function finalize() {
  await click('Make Offer');
  await waitFor(x => offerState(x).state === 'made' || x.buttons('Exit Talks').length > 0, {what: 'offer made'});
  if ((await Screen.read()).buttons('Exit Talks').length) await click('Exit Talks');
}

// After a fee edit the page offers Suggest Terms (haggling on) or, when the club wants a formal bid,
// only Make Offer (Ylla, 2033-08-05: the edit after "can get more" timed out waiting for Suggest
// Terms). Returns 'suggest' or 'make'.
async function nextStep() {
  const make = x => x.buttons('Make Offer').some(b => b.name === 'StandardButton');
  const x = await waitFor(y => y.buttons('Suggest Terms').length === 1 || make(y), {what: 'Suggest Terms or Make Offer'});
  return x.buttons('Suggest Terms').length === 1 ? 'suggest' : 'make';
}
async function makeOffer(history) {
  await click('Make Offer', {name: 'StandardButton'});
  await waitFor(x => offerState(x).state === 'made' || x.buttons('Exit Talks').length > 0, {what: 'offer made'});
  if ((await Screen.read()).buttons('Exit Talks').length) await click('Exit Talks');
  return {outcome: 'bid-made', history};
}

/**
 * Negotiate on an open offer screen (fresh, or already countered by the club).
 * firstFee: our opening fee if the screen is fresh. max: walk-away deal value
 * (up front + rules.valuation.addon_weight × add-ons). Raises by `step` per round; once the club
 * asks for more than `max`, makes one final offer worth exactly `max` (keeping their add-ons),
 * then withdraws if still refused. Returns {outcome: 'agreed'|'accepted-demands'|'walked-away', history}.
 */
export async function negotiate({firstFee, max, step, rounds = 6, extras = 0, final = false, keepLoanBack = false}) {
  // A release clause within our max ends the negotiation: pay exactly it (Gaitán, £12.75M; we had
  // opened above it from his value range).
  // The clause is a ceiling, not an opening (user, 2033-08-05: Ylla, Espino and Mokio were all bought
  // at their clause = their full value): negotiate up from our opening and pay the clause only when
  // our offer would reach it, or when they refuse outright (the clause can't be refused).
  const release = releaseClause(await Screen.read());
  const capRelease = release != null && release <= max;
  if (capRelease && firstFee >= release) return {...await payReleaseClause(release, {keepLoanBack}), history: []};
  if (capRelease) max = release;
  const payClause = async history => ({...await payReleaseClause(release, {keepLoanBack}), history});
  const history = [];
  let fee = firstFee, finalOffer = final, sellOnTries = 0;
  for (let round = 1; round <= rounds; round++) {
    let reply = offerState(await Screen.read());
    if (reply.state === 'editing') {
      const set = await setFee('Fee', fee);
      reply = await suggest();
      history.push({round, offered: set.set, ...reply});
    } else history.push({round, ...reply});
    // Never commit above the walk-away, whatever the club says (Ribeiro was 'acceptable' at £35M
    // total against a £30M max, 2026-07-13): leave instead.
    if (reply.state === 'accepted' && dealValue(reply) > max) break;
    if (reply.state === 'accepted') { await finalize(); return {outcome: 'agreed', history}; }
    if (reply.state === 'made') return {outcome: 'agreed', history};
    // A flat "the offer is unacceptable": walk away, no raising or retrying (user, 2026-10-08:
    // LOSC rejected Ribeiro every time; a club that says no to the offer is left alone).
    if (reply.state === 'rejected') { if (capRelease) return payClause(history); break; }
    // "Declined to give an immediate answer. An offer will need to be submitted" (HSV for Ângelo):
    // a formal bid at the current fee, answered later; the deal state machine follows it from here.
    if (reply.state === 'submit') return makeOffer(history);
    // "They can get more": raise by a step (to max as the final offer) and suggest again.
    if (reply.state === 'more') {
      if (capRelease && (fee == null || fee + step >= release)) return payClause(history);
      if (finalOffer || fee == null) break;
      fee = fee + step >= max ? (finalOffer = true, max) : fee + step;
      await setFee('Fee', fee);
      if (await nextStep() === 'make') return makeOffer(history);
      continue;
    }
    // A non-negotiable counter ("have proposed a non-negotiable offer", Leverkusen for Dinger, 2034-08-19):
    // take it if it's within our max (Accept Demands, below), else walk away: no counter rounds.
    if (reply.state === 'final') finalOffer = true;
    else if (reply.state !== 'countered') throw new NeedsAnalyst(`Unexpected offer state: ${reply.state}`, reply);
    // A sell-on clause in their counter costs us resale profit, the point of buying young (user,
    // 2026-10-14): remove it and offer their up-front fee without it (within max). If they put it
    // back, it can't be removed: negotiate on as usual (the history records it).
    if (reply.state !== 'final' && sellOnRow(await Screen.read()) && sellOnTries < 2) {
      sellOnTries++;
      history.at(-1).sellOnRemoved = sellOnRow(await Screen.read()).pct;
      await removeSellOn();
      fee = Math.min(reply.upfront ?? fee, max);
      await setFee('Fee', fee);
      if (await nextStep() === 'make') return makeOffer(history);
      continue;
    }
    // Never sign a sell-on (user, 2033-07-09: Ortega came with 40% of the profit on his next sale owed
    // to Lecce, accepted in their counter in 2030; Man City's £73.75M bid then nets ~£68.6M). Still
    // there after our removals: stop for the user, never Accept Demands with it.
    const kept = sellOnRow(await Screen.read());
    if (kept && sellOnBlocks(kept.pct)) {
      history.at(-1).sellOnKept = kept.pct;
      throw new NeedsAnalyst(`They insist on a ${kept.pct} sell-on clause (removed ${sellOnTries}x): we don't sign sell-ons; walk away or decide`, {history});
    }
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
    if (capRelease && (fee == null || next + addons * loadRules().valuation.addon_weight >= release)) return payClause(history);
    if (fee == null || next + addons * loadRules().valuation.addon_weight >= max) { fee = Math.max(0, Math.round(max - addons * loadRules().valuation.addon_weight)); finalOffer = true; }
    else fee = next;
    // Editing any field brings back Suggest Terms.
    await setFee('Fee', fee);
    if (await nextStep() === 'make') return makeOffer(history);
  }
  // After a counter we withdraw; after a flat rejection there is no offer to withdraw: just leave.
  if ((await Screen.read()).buttons('Withdraw Offer').length) await click('Withdraw Offer');
  else await recover().then(() => click('Portal'));
  return {outcome: 'walked-away', history};
}

/**
 * buyPlayer('Marius Broholm', 'LOSC Lille', {open?, max?, rounds?, dryRun?})
 * Opens Make An Offer and negotiates in one sitting (Suggest Terms). open: first fee (default
 * openingBid); max: walk-away deal value (default 1.1 × top of value).
 */
export async function buyPlayer(name, club, {open, max, rounds = 6, dryRun = false, ask = true, loanBack = false} = {}) {
  // Buying needs the user's approval while policy.json autonomy.buy is 'approve': the approved
  // limit caps --max. A dry run is how the manager prices a proposal, so it passes.
  const approved = dryRun ? null : gate('buy', 'buy', name, {price: max, what: `buy ${name} (${club})`});
  // Ask his agent first (one-time per player): a player who won't join (often: just signed a new
  // contract) is not bid for; otherwise his profile's value range updates to the fee range the
  // agent gives, and the opening bid and walk-away below come from it (user, 2026-10-14).
  const agent = dryRun || !ask ? null : await askAgent(name, club);
  if (agent?.asked && !agent.willing) return {action: 'buy', name, club, outcome: 'unwilling', agent};
  const profile = await openPlayer(name, club);
  const facts = profileFacts(profile);
  // The agent's fee range is what the club will accept: use it, not the profile's range, which can
  // lag (Meïté 2030-07-21: agent £16-20M, profile still higher → we opened at £21.5M).
  if (agent?.feeRange?.every(Number.isFinite)) { facts.valueRangeProfile = facts.valueRange; facts.valueRange = agent.feeRange; }
  const {top, sub} = await peekActions('Transfer');
  if (sub.includes('Withdraw Transfer Offer')) return {action: 'buy', name, club, alreadyPending: true};
  // His price starts above what the user approved (Gadou listed at £63M vs £58M approved, 2030-07):
  // a bid at our cap would be flatly rejected, which ends the deal. Ask for a new approval instead.
  if (approved && facts.valueRange && facts.valueRange[0] > approved.limit)
    throw new NeedsAnalyst(`${name}: his range starts at £${(facts.valueRange[0] / 1e6).toFixed(2)}M, above the approved £${(approved.limit / 1e6).toFixed(2)}M. Ask the user for a higher limit (formula walk-away £${(defaultMax(facts) / 1e6).toFixed(2)}M) or drop him.`,
      {approval: 'below-range', valueRange: facts.valueRange, approved: approved.limit, formulaMax: defaultMax(facts), agent});
  if (top.includes('Make An Offer')) await actionPath(['Make An Offer']);
  else if (sub.includes('Make An Offer')) await actionPath(['Transfer', 'Make An Offer']);
  else throw new NeedsAnalyst(`No "Make An Offer" for ${name}`, {top, transfer: sub});
  // A fresh offer screen has Suggest Terms. After an earlier negotiation for the same player the
  // screen comes back PRE-FILLED with that offer (fee, instalments, add-ons) and only Make Offer
  // (Ribeiro, 2026-07-13: £18.25M + £14.5M instalments + £155K/appearance); editing a field
  // brings Suggest Terms back.
  // "Cannot sign <name>: on loan with a future fee clause in place" (Zukic, Schreiber, 2032-01): no bid possible.
  const cannot = x => overlays(x).find(o => o.kind === 'dialog' && /^Cannot sign /.test(o.title || ''));
  const s = await waitFor(x => x.buttons('Suggest Terms').length === 1 || x.buttons('Make Offer').length === 1 || cannot(x), {what: 'offer screen'});
  if (cannot(s)) {
    const why = cannot(s).description;
    await recover();
    const r = {action: 'buy', name, club, date: isoDate(s.date() || new Date()), outcome: 'cannot-sign', why};
    await log(r);
    return r;
  }
  // Leave without bidding: Cancel where the screen has one, else navigate away (the pre-filled
  // page has no Cancel; leaving it registered no bid, 2026-07-13).
  const leave = async () => { if ((await Screen.read()).buttons('Cancel').some(b => b.name === 'StandardButton')) await click('Cancel', {name: 'StandardButton'}); else await recover().then(() => click('Portal')); };
  facts.valueRange ??= offerValueRange(s);
  if (!facts.valueRange && (open === undefined || max === undefined)) { await leave(); throw new NeedsAnalyst(`No valuation for ${name}; pass --open and --max`, facts); }
  const keenToSell = s.hasText(/keen to offload|looking to sell|placed him on the transfer list/i);
  const walkAway = Math.min(max ?? defaultMax(facts), approved?.limit ?? Infinity);
  const priority = isPriority(approved ?? (await import('../approvals.mjs')).find('buy', name)), finalYear = inFinalYear(facts.contract, isoDate(profile.date()));
  let fee = Math.min(open ?? openingBid(facts, {keenToSell, priority, finalYear}), walkAway);
  // Pre-filled extras stay in the offer: set the fee so the TOTAL is our opening bid. Measure them
  // on every screen (total − fee): the pre-filled page sometimes shows Suggest Terms too, and
  // taking it for a fresh one turned an £18.9M opening into ~£35M (Ribeiro, 2026-07-13).
  const st = offerState(s), feeBox = parseMoney(s.after('Fee', i => i.kind === 'button' && parseMoney(i.label) !== null)?.label);
  const extras = st.total != null && feeBox != null ? Math.max(0, st.total - feeBox) : 0;
  const prefilled = extras > 0 || !s.buttons('Suggest Terms').length;
  if (extras) fee = Math.max(0, fee - extras);
  const base = {action: 'buy', name, club, date: isoDate(profile.date()), facts, max: walkAway, ...(prefilled ? {prefilled: {fee: feeBox, total: st.total, extras}} : {})};
  if (dryRun) {
    // Fresh screen: fill the fee to check it, then Cancel. Pre-filled screen: change nothing.
    if (!prefilled) await setFee('Fee', fee);
    await leave();
    await waitFor(x => !x.buttons('Suggest Terms').length && !x.buttons('Make Offer').length, {what: 'offer screen closed'});
    return {...base, dryRun: true, wouldOpenAt: fee};
  }
  if (prefilled && !s.buttons('Suggest Terms').length) { await setFee('Fee', fee); await waitFor(x => x.buttons('Suggest Terms').length === 1, {what: 'Suggest Terms after editing'}); }
  const r = await negotiate({firstFee: fee, max: walkAway, step: buyStep(facts), rounds, extras, keepLoanBack: loanBack});
  // A priority target flatly rejected: FM takes a new bid the next day; bid his asking price then.
  if (priority && r.outcome === 'walked-away' && r.history?.at(-1)?.state === 'rejected') {
    const again = Math.min(Math.round(facts.askingPrice ?? facts.valueRange[1]), walkAway);
    if (again > fee) { (await import('./rebids.mjs')).add({name, club, open: again, max: walkAway, after: base.date}); r.rebid = again; }
  }
  await log({...base, ...r, priority, finalYear});
  return {...base, ...r, priority, finalYear};
}

// Valuation shown on an offer screen ("Transfer Value": a range, or one exact amount).
export function offerValueRange(s) {
  const v = s.after('Transfer Value', i => parseRange(i.label) !== null || /^£[\d.]+[KM]$/.test(i.label))?.label;
  if (!v) return null;
  return parseRange(v) || [parseMoney(v), parseMoney(v)];
}
export const buyStep = facts => Math.max(250000, Math.round(facts.valueRange[0] * loadRules().buying.raise_step));
