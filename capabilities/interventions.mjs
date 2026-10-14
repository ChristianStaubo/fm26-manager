// Intervention ledger: the autonomy metric (notes/loop-engineering.md). Every time the user decides
// instead of the agent: a proposal approved unchanged, approved with changes, rejected, or a
// correction the agent never proposed ("Ajer is out of contract, did you see this?"). Each
// correction should leave a rule + test (field `guard`). Promotion by rule: a capability on
// 'approve' is eligible for 'auto' after policy.autonomy_promotion.consecutive_unchanged proposals
// in a row approved unchanged, with no correction since. Store: local/runs/interventions.jsonl.
import {appendFileSync, readFileSync, mkdirSync} from 'node:fs';
import {loadPolicy} from './sell/decide.mjs';

const FILE = new URL('../local/runs/interventions.jsonl', import.meta.url);
// supervisor-decision: the supervisor agent decided a novel situation instead of the user (2026-10-15:
// "a supervisor agent in the loop for tasks we don't know about yet"); the user reviews these later:
// review-agreed / review-overturned grade the supervisor like proposals grade the player.
export const KINDS = ['approved-unchanged', 'approved-changed', 'rejected', 'correction', 'supervisor-decision', 'review-agreed', 'review-overturned'];

export function record({capability, kind, proposed = null, decided = null, rule = null, guard = null, date = null}, file = FILE) {
  if (!capability) throw new Error('capability required');
  if (!KINDS.includes(kind)) throw new Error(`kind: ${KINDS.join(' | ')}`);
  const e = {at: new Date().toISOString(), date, capability, kind, proposed, decided, rule, guard};
  mkdirSync(new URL('.', file), {recursive: true});
  appendFileSync(file, JSON.stringify(e) + '\n');
  return e;
}
export function all(file = FILE) {
  try { return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; }
}

// Per capability: counts, the current streak of unchanged approvals, eligibility for 'auto'.
export function summary(entries = all(), policy = loadPolicy()) {
  const need = policy.autonomy_promotion?.consecutive_unchanged ?? 5;
  const out = {};
  for (const e of entries) {
    const c = out[e.capability] ??= {mode: policy.autonomy?.[e.capability] ?? 'approve', counts: Object.fromEntries(KINDS.map(k => [k, 0])), streak: 0, unguarded: 0};
    c.counts[e.kind] = (c.counts[e.kind] || 0) + 1;
    if (e.kind === 'supervisor-decision') continue;   // pending review: neither grows nor breaks a streak
    c.streak = ['approved-unchanged', 'review-agreed'].includes(e.kind) ? c.streak + 1 : 0;
    if (e.kind === 'correction' && !e.guard) c.unguarded++;
  }
  for (const c of Object.values(out)) {
    const interventions = c.counts['approved-changed'] + c.counts.rejected + c.counts.correction + (c.counts['review-overturned'] || 0);
    c.pendingReview = c.counts['supervisor-decision'] - (c.counts['review-agreed'] || 0) - (c.counts['review-overturned'] || 0);
    c.interventionRate = Math.round(100 * interventions / Math.max(1, Object.values(c.counts).reduce((a, b) => a + b, 0))) / 100;
    c.eligibleForAuto = c.mode === 'approve' && c.streak >= need && c.unguarded === 0;
    // Demotion by rule too: an auto capability the user had to correct, with no guard test yet.
    c.demote = c.mode === 'auto' && c.unguarded > 0;
    c.toAuto = c.mode === 'auto' ? 'already auto' : `${Math.max(0, need - c.streak)} more unchanged approvals${c.unguarded ? `, and ${c.unguarded} correction(s) without a guard test` : ''}`;
  }
  return {needed: need, capabilities: out, total: entries.length};
}
