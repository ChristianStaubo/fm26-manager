// A signing nobody approved (user, 2035-01: the staff bid for Koumeyi, a 19-year-old at Bayern II,
// on their own; before him Zack Taylor, Lomax, Romeo). We only sign what the buy table and an
// approval say: withdraw the bid instead of stopping the season.
import * as approvals from '../approvals.mjs';

/** A deals alert → 'withdraw' (our pending bid, unapproved) | 'ignore' (gone, unapproved) | null (ours: keep the alert). */
export function unapprovedAction(alert, find = approvals.find) {
  if (alert.dir === 'out' || !alert.player || find('buy', alert.player)) return null;
  if (alert.kind === 'stuck' || alert.kind === 'unknown-transition') return 'withdraw';
  if (alert.kind === 'vanished') return 'ignore';
  return null;
}

/** Act on the unapproved alerts; each one handled stops nothing. Returns the decisions. */
export async function handleUnapproved(alerts, {find = approvals.find, withdraw, clubOf} = {}) {
  const out = [];
  for (const a of alerts) {
    const act = unapprovedAction(a, find);
    if (!act) continue;
    a.stop = false; a.resolved = `unapproved signing: ${act}`;
    if (act !== 'withdraw') { out.push({action: 'unapproved-signing', name: a.player, outcome: 'ignored', from: a.from}); continue; }
    try {
      withdraw ||= (await import('./buy.mjs')).withdrawOffer;
      clubOf ||= (await import('../deals/store.mjs')).clubOf;
      out.push(await withdraw(a.player, await clubOf(a.player), {why: 'unapproved signing (staff bid)'}));
    } catch (e) { a.stop = true; out.push({action: 'withdraw-offer', name: a.player, error: e.message}); }
  }
  return out;
}
