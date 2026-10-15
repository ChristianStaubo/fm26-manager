// Sale negotiations as data, to find the counter formula from what clubs actually did (user,
// 2031-06-17: "store these so we can determine a rule, like this one accepted +20%, this one 15%").
// Built from the decision log: every incoming-offer entry the handler executed is one round of a
// deal (player + club). Their next offer is their reply to our counter.
import {history} from '../log.mjs';

const money = v => Number.isFinite(v) ? v : null;
// Asks are on guaranteed money (fee + instalments, decideSale); add-ons are listed apart.
const addOns = o => Math.max(0, (o.total ?? o.guaranteed) - o.guaranteed);

/** [{player, club, rounds: [{date, offer, ask, askPct, reply, closed}], outcome}] */
export function negotiations(entries) {
  const deals = new Map();
  for (const e of entries.filter(e => e.action === 'incoming-offer' && e.executed && e.offer?.player)) {
    const key = `${e.offer.player}|${e.offer.club}`;
    if (!deals.has(key)) deals.set(key, {player: e.offer.player, club: e.offer.club, vLow: e.offer.vLow, vHigh: e.offer.vHigh, minimum: e.offer.minimum, entries: []});
    deals.get(key).entries.push(e);
  }
  return [...deals.values()].map(d => {
    const rounds = d.entries.map((e, k) => {
      const offer = e.offer.guaranteed, ask = money(e.decision.guaranteedAsk), next = d.entries[k + 1];
      // Their answer on the spot (verdict) or their next offer.
      const reply = e.accepted ? ask : next ? next.offer.guaranteed : null;
      return {date: e.date, offer, upfront: e.offer.upfront, addOns: addOns(e.offer), action: e.decision.action, ask, verdict: e.verdict ?? null, accepted: !!e.accepted,
        askPct: ask ? +(ask / offer - 1).toFixed(3) : null,
        reply, replyPct: reply ? +(reply / offer - 1).toFixed(3) : null,
        // Share of the gap between their offer and our ask that their reply closed (1 = met our ask).
        closed: ask && reply ? +((reply - offer) / (ask - offer)).toFixed(2) : null};
    });
    const last = rounds.at(-1);
    const outcome = last.accepted ? `sold ${last.ask} (our counter, accepted on the spot)` : last.action === 'accept' ? `sold ${last.offer}` : last.action === 'reject' ? 'rejected' : last.action === 'counter' ? 'no reply yet (or they walked away)' : last.action;
    const {entries: _, ...rest} = d;
    return {...rest, rounds, outcome};
  });
}

export const report = async () => negotiations(await history());
