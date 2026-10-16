// What we paid for a player: the fee of his last completed buy in the decision log (fm buy).
// Used as a floor when selling (user, 2032-02-02: "also what we paid for him"). Unknown (bought
// before this tooling, youth, free) → null: no floor.
import {readFileSync} from 'node:fs';

const LOG = new URL('../../local/runs/decisions.jsonl', import.meta.url);
const DONE = new Set(['agreed', 'accepted-demands', 'release-clause']);
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Fee from one buy entry: the release clause paid, the demand accepted, or the last agreed round. */
export function buyFee(e) {
  if (Number.isFinite(e.fee)) return e.fee;
  if (e.outcome === 'accepted-demands' && e.demand) return e.demand.total ?? e.demand.upfront ?? null;
  const last = (e.history || []).filter(h => ['accepted', 'made'].includes(h.state)).at(-1) ?? (e.history || []).at(-1);
  return last ? (last.total ?? last.upfront ?? last.offered ?? null) : null;
}

export function paidFor(name, entries) {
  try { entries ??= readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return null; }
  const buys = entries.filter(e => e.action === 'buy' && DONE.has(e.outcome) && norm(e.name) === norm(name));
  return buys.length ? buyFee(buys.at(-1)) : null;
}
