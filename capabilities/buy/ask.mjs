// Ask the player's agent about availability before bidding (user, 2026-10-14). Mapped on Banks,
// 2030-07-14: profile → Actions → "Ask Agent About Availability" (top level) opens a Quick Chat on
// the profile ("<agent> / <Player>'s agent / What can I do for you?") with four answers, from
// "We're very keen…" to "…come up on our radar…". We pick the 2nd ("We're keen on signing <X> and
// would like to know more about what the demands would be."), and the 2nd again if the agent offers
// another round (he sometimes lowers his demands). His reply says whether the player would join,
// the fee range the club wants ("I believe FC Augsburg will want somewhere between £26M and £31M"),
// and the player's demands; the profile's value range then updates to that range.
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

export function readReply(lines) {
  const text = lines.join(' ');
  const fee = /between (£[\d.,]+[MK]?) and (£[\d.,]+[MK]?)/i.exec(text);
  const wage = /(£[\d.,]+K?)\s*(p\/w|per week|a week)/i.exec(text);
  return {
    willing: !UNWILLING.test(text),
    feeRange: fee ? [parseMoney(fee[1]), parseMoney(fee[2])] : null,
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
  const s = await Screen.read();
  const reply = readReply(chat(s));
  const entry = {action: 'ask-agent', date: isoDate(s.date()), name, club, asked: true, ...reply, transcript, valueRangeBefore: facts.valueRange};
  await log(entry);
  return entry;
}
