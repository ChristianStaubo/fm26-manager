// Ask the player's agent about availability before bidding (user, 2026-10-14). Mapped on Banks,
// 2030-07-14: profile → Actions → "Ask Agent About Availability" (top level) opens a Quick Chat on
// the profile ("<agent> / <Player>'s agent / What can I do for you?") with four answers, from
// "We're very keen…" to "…come up on our radar…". We pick the 2nd ("We're keen on signing <X> and
// would like to know more about what the demands would be."), and the 2nd again if the agent offers
// another round (he sometimes lowers his demands). His reply says whether the player would join,
// the fee range the club wants ("I believe FC Augsburg will want somewhere between £26M and £31M"),
// and the player's demands; the profile's value range then updates to that range.
// Then Contest the demands (user): he lowers his wage demand or stays firm.
// One-time per player: once asked, the action is gone from his menu.
import {Screen, waitFor, click, openPlayer, actionPath, peekActions, profileFacts, parseMoney, isoDate} from '../../game/ui/index.mjs';
import {log} from '../log.mjs';

export const ASK = 'Ask Agent About Availability';
const UNWILLING = /doesn't want to join|wouldn't be interested in joining|not interested in (joining|a move)|under any circumstances/i;

// The chat's answer buttons: long sentences about the player (his first or last name in them).
const options = (s, name) => {
  const parts = name.split(/\s+/).filter(p => p.length > 2);
  return s.buttons(/./).filter(b => b.label.length > 40 && parts.some(p => b.label.includes(p)) && /^(We|We're|[A-Z][a-z]+ [A-Z][a-z]+ has come up)/.test(b.label));
};
// What the agent said: the chat texts after "Quick Chat" that are not our options.
const chat = s => { const t = s.texts(), i = t.lastIndexOf('Quick Chat'); return i < 0 ? [] : t.slice(i + 1, i + 40); };

// The Contest answer (mapped on Miretti, 2031-01-01): after our answer the right-hand panel lists
// reply groups under headers "Agree", "Contest", "Stall" (SIText GroupTitle); each header is followed
// by one or more reply buttons (StandardButton, the message text as label). The user's step is the
// FIRST reply under "Contest". Never Agree.
const header = (s, title) => s.tree.nodes.find(n => n.visible && n.name === 'GroupTitle' && (n.text || '').trim() === title);
export const contestTarget = s => replyUnder(s, 'Contest');
// After Contest (user, 2031-01-01): Agree to the (lowered) demands: contract talks follow, which for
// an expiring contract is a pre-contract.
export const agreeTarget = s => replyUnder(s, 'Agree');
function replyUnder(s, title) {
  const c = header(s, title);
  if (!c) return null;
  const next = ['Agree', 'Contest', 'Stall'].map(t => header(s, t)).filter(h => h && h.bounds[1] > c.bounds[1]).sort((a, b) => a.bounds[1] - b.bounds[1])[0];
  const below = s.items.filter(i => i.kind === 'button' && i.name === 'StandardButton' && i.label && Math.abs(i.bounds[0] - c.bounds[0]) < 60
    && i.bounds[1] > c.bounds[1] && (!next || i.bounds[1] < next.bounds[1])).sort((a, b) => a.bounds[1] - b.bounds[1]);
  return below[0] ? s.node(below[0].id) : null;
}
export function readReply(lines) {
  const text = lines.join(' ');
  // "somewhere between £26M and £31M" (Banks) or "somewhere around £17M" (Güreler, 2030-07-14).
  const fee = /between (£[\d.,]+[MK]?) and (£[\d.,]+[MK]?)/i.exec(text) || /around (£[\d.,]+[MK]?)/i.exec(text);
  const wage = /(£[\d.,]+K?)\s*(p\/w|per week|a week)/i.exec(text);
  return {
    willing: !UNWILLING.test(text),
    feeRange: fee ? [parseMoney(fee[1]), parseMoney(fee[2] || fee[1])] : null,
    wage: wage ? parseMoney(wage[1]) : null,
    justSigned: /only just signed a new contract/i.test(text),
  };
}

/**
 * askAgent('Noahkai Banks', 'Augsburg') → {asked, willing, feeRange, wage, transcript, valueRange}
 * asked: false when the action isn't offered (already asked, or not available for him).
 */
export async function askAgent(name, club, {dryRun = false} = {}) {
  const profile = await openPlayer(name, club);
  const facts = profileFacts(profile);
  const {top} = await peekActions('Transfer');
  if (!top.includes(ASK)) return {action: 'ask-agent', name, club, asked: false, why: 'not offered: already asked (one-time per player) or not available', valueRange: facts.valueRange};
  if (dryRun) return {action: 'ask-agent', name, club, asked: false, dryRun: true, valueRange: facts.valueRange};
  await actionPath([ASK]);
  const transcript = [];
  for (let round = 1; round <= 2; round++) {
    const s = await waitFor(x => options(x, name).length >= 2 || (round > 1 && chat(x).length), {what: 'agent chat', timeout: 10000}).catch(() => null);
    const opts = s ? options(s, name) : [];
    if (opts.length < 2) break;   // no (more) answers to give: the agent has replied
    transcript.push({we: opts[1].label});
    await click(opts[1].label);
    const r = await waitFor(x => options(x, name).every(o => o.label !== opts[1].label) || chat(x).some(t => /£|join|interested/i.test(t)), {what: 'agent reply', timeout: 10000});
    transcript.push({agent: chat(r).filter(t => !options(r, name).some(o => o.label === t))});
  }
  // Contest (user, 2026-10-15): after our answer the agent states the demands with Agree / Contest /
  // Stall. The user's step is Contest: he either lowers his wage demand or stays firm. Never Agree.
  let contested = null;
  const s1 = await Screen.read();
  const contestNode = contestTarget(s1);
  if (contestNode) {
    const before = readReply(chat(s1)), lines = chat(s1).join(' ');
    const {ui} = await import('../../game/bridge/client.mjs');
    await ui.click(s1.tree, contestNode);
    const r = await waitFor(x => chat(x).join(' ') !== lines, {what: 'agent reply to Contest', timeout: 10000}).catch(() => Screen.read());
    const after = readReply(chat(r));
    contested = {wageBefore: before.wage, wageAfter: after.wage, firm: after.wage == null || after.wage >= (before.wage ?? Infinity)};
    transcript.push({we: 'Contest'}, {agent: chat(r).slice(0, 12)});
    // Then Agree to the (lowered) demands (user, 2031-01-01).
    const s2 = await Screen.read(), agree = agreeTarget(s2);
    if (agree) { await ui.click(s2.tree, agree); await new Promise(res => setTimeout(res, 2000)); transcript.push({we: 'Agree'}); contested.agreed = true; }
  }
  const s = await Screen.read();
  const reply = readReply(chat(s));
  const entry = {action: 'ask-agent', date: isoDate(s.date()), name, club, asked: true, ...reply, contested, transcript, valueRangeBefore: facts.valueRange};
  await log(entry);
  return entry;
}

// Renewals (user, 2026-10-19: "we just immediately go into discussing the contract"): profile → Actions →
// "Discuss New Contract With Agent" (top level) opens the same Quick Chat. Mapped on Burton, 2036-07-06:
// answers from "We're very keen on re-signing…" to "…has come up on our radar…"; we pick the 2nd ("We're keen
// on renewing <X>'s contract and would like to know more about what the demands would be."). The agent lists
// "Player Demands": playing time, "a salary of between £86K per week and £105K per week", "a long term
// contract until 6/30/2041". Contest ("I think you're asking for too much…") lowered it to £77K-£95K, then
// Agree: the demands stand for the contract talks that follow.
export const DISCUSS = 'Discuss New Contract With Agent';
export function readDemands(lines) {
  const text = lines.join(' ');
  const wage = /salary of between (£[\d.,]+K?) per week and (£[\d.,]+K?) per week/i.exec(text);   // the first range is the current one ("now instead of …")
  const until = /contract until (\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text);
  const role = lines.find(l => /^Will expect to be /i.test(l)) || null;
  return {wage: wage ? [parseMoney(wage[1]), parseMoney(wage[2])] : null, until: until ? until[1] : null, role};
}
export async function discussContract(name, club, {dryRun = false} = {}) {
  await openPlayer(name, club);
  if (dryRun) return {action: 'discuss-contract', name, asked: false, dryRun: true};
  // Straight to the menu entry (a separate peek opened the Actions menu twice, 2036-07-06); a missing
  // entry (one-time: already discussed) comes back as NeedsAnalyst with the menu's entries.
  try { await actionPath([DISCUSS]); }
  catch (e) { if (e.details?.available) return {action: 'discuss-contract', name, asked: false, why: 'not offered (already discussed, or not available)'}; throw e; }
  const s0 = await waitFor(x => options(x, name).length >= 2, {what: 'agent chat', timeout: 10000});
  const pick = options(s0, name)[1];
  await click(pick.label);
  const s1 = await waitFor(x => !!contestTarget(x) || !!agreeTarget(x), {what: 'agent demands', timeout: 10000});
  const asked = readDemands(chat(s1));
  const {ui} = await import('../../game/bridge/client.mjs');
  let after = asked, s2 = s1;
  if (contestTarget(s1)) {
    const lines = chat(s1).join(' ');
    await ui.click(s1.tree, contestTarget(s1));
    s2 = await waitFor(x => chat(x).join(' ') !== lines, {what: 'agent reply to Contest', timeout: 10000}).catch(() => Screen.read());
    after = {...asked, ...Object.fromEntries(Object.entries(readDemands(chat(s2))).filter(([, v]) => v))};
  }
  if (agreeTarget(s2)) await ui.click(s2.tree, agreeTarget(s2));
  const entry = {action: 'discuss-contract', date: isoDate(s2.date()), name, asked: true, we: pick.label, demands: after, before: asked.wage};
  await log(entry);
  return entry;
}
