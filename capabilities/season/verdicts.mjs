// Verdicts (user, 2026-10-18): after a checkpoint the manager answers every row its tables raised:
//   act      done, within its autonomy (a renewal by the test, a pass on a free agent…)
//   propose  needs the user's approval first (a buy or sale on 'approve'): with a price
//   pass     not doing it, and why
// The report says what the tables found; the verdicts say what the manager did about each row and why.
// The user reviews them (fm verdicts) and agrees or overturns each: agreement is what earns a capability
// 'auto' (review-agreed / approved-unchanged in the ledger, PLAYBOOK §10). The judge fails a checkpoint
// with rows left unanswered (verdictsMissing, capabilities/audit).
// Store: local/reports/checkpoints/<date>-<name>.verdicts.jsonl (latest line per row wins).
import {readFileSync, appendFileSync, existsSync} from 'node:fs';

export const KINDS = ['act', 'propose', 'pass'];
// Each step's rows test one capability's judgement (policy.autonomy).
export const CAPABILITY = {contracts: 'contracts', final_year: 'contracts', free_agents: 'buy', wonderkids: 'buy', newgens: 'buy',
  buys: 'buy', bargains: 'buy', plan: 'buy', squad: 'squad', sells: 'sell', audit: 'squad'};
// Reports from before verdicts existed have no rows to answer.
export const SINCE = '2026-10-18';

const money = v => Number.isFinite(v) ? `£${(v / 1e6).toFixed(1)}M` : '?';
/** The rows a checkpoint report asks the manager to answer: [{step, item, detail}]. */
export function rowsOf(report) {
  const s = report?.steps || {}, out = [];
  const data = k => (s[k] && s[k].ok !== false ? s[k].data : null);
  const add = (step, item, detail) => item && out.push({step, item: String(item), detail});
  for (const p of data('contracts')?.expiring || []) add('contracts', p.name, `${p.issue} (to ${p.expires}), ${money(p.value)}: ${p.do}`);
  for (const p of data('final_year')?.players || []) add('final_year', p.name, `final year, ${money(p.value)}: ${p.decision?.action ?? '?'}${p.decision?.reason ? ' (' + p.decision.reason + ')' : ''}`);
  for (const p of data('free_agents')?.players || []) add('free_agents', p.name, `${p.age}, ${p.slot ?? p.positions}${p.ca ? `, CA ${p.ca}/PA ${p.pa}` : ''}, worth ${money(p.worth)}${p.always_buy ? ', ALWAYS BUY' : ''}, ${p.contract_club || 'free'} to ${p.contract_until || '-'}: ${p.route ?? ''}`);
  for (const p of data('wonderkids')?.players || []) add('wonderkids', p.name, `${p.age}, ${p.positions}, ${p.nation}, PA ${p.pa} CA ${p.ca}, ${p.club}, ${money(p.value)}`);
  for (const p of data('newgens')?.signable_now || []) add('newgens', p.name, `${p.age}, ${p.positions}, ${p.nation}, PA ${p.pa} CA ${p.ca}, ${p.club}, ${money(p.value)}`);
  const sq = data('squad');
  for (const n of sq?.needs || []) add('squad', `${n.position} ${n.kind}`, n.why);
  for (const c of sq?.sell_candidates || []) add('squad', `sell? ${c.name}`, c.why);
  const buys = data('buys');
  for (const r of buys?.positions || []) for (const n of r.needs || [])
    add('buys', `${r.position} ${n.kind}${n.for ? ' for ' + n.for : ''}`, `CA >= ${n.min_ca}: ${(n.candidates || []).slice(0, 3).map(c => `${c.name} (${c.age}, CA ${c.ca}, ${c.club}) ${money(c.value)}`).join(' · ') || 'none in range'}`);
  for (const c of buys?.wonderkids || []) add('buys', `wonderkid ${c.name}`, `PA ${c.pa}, ${c.positions}, ${c.club}, ${money(c.value)}`);
  const bargains = data('bargains');
  for (const c of (bargains?.undervalued || []).slice(0, 5)) add('bargains', c.name, `undervalued ${c.ratio}x (typical ${money(c.typical)}): ${c.age}, ${c.positions}, CA ${c.ca}/PA ${c.pa}, ${c.club}, ${money(c.value)}`);
  for (const c of (bargains?.buried || []).slice(0, 5)) add('bargains', c.name, `buried talent: ${c.age}, ${c.positions}, CA ${c.ca}/PA ${c.pa}, ${c.club}, ${money(c.value)}`);
  for (const x of Array.isArray(data('sells')) ? data('sells') : []) if (x.action !== 'keep') add('sells', x.name, `${x.action}${x.ask ? ' at ' + money(x.ask) : ''} (${x.role ?? ''})`);
  const plan = data('plan');
  for (const b of plan?.buy || []) add('plan', `buy ${b.name}`, `${b.slot} ${b.role}, ${money(b.value)}, walk away ${money(b.walk_away)}`);
  for (const x of plan?.sell || []) add('plan', `sell ${x.name}`, (x.why || []).join('; '));
  for (const d of data('audit')?.decide || []) add('audit', d.slice(0, 70), d);
  return out;
}

const fileOf = base => `${base}.verdicts.jsonl`;
const key = (step, item) => `${step}|${String(item).toLowerCase()}`;
export function load(base) {
  if (!existsSync(fileOf(base))) return new Map();
  const m = new Map();
  for (const l of readFileSync(fileOf(base), 'utf8').split('\n').filter(Boolean)) {
    const v = JSON.parse(l), k = key(v.step, v.item);
    m.set(k, {...(m.get(k) || {}), ...v});   // a review line adds to the verdict it reviews
  }
  return m;
}
/** The manager's answer to one row. */
export function record(base, {step, item, verdict, why, price, date}, rows) {
  if (!KINDS.includes(verdict)) throw new Error(`verdict: ${KINDS.join(' | ')}`);
  if (!why) throw new Error('--why required: the reason is what the user reviews');
  if (verdict === 'propose' && !Number.isFinite(price)) throw new Error('a proposal needs a --price (the maximum to approve)');
  const row = rows && rows.find(r => key(r.step, r.item) === key(step, item));
  if (rows && !row) throw new Error(`No row "${item}" in step ${step}: fm verdicts lists the rows`);
  const v = {at: new Date().toISOString(), date, step, item: row?.item ?? item, verdict, why, ...(Number.isFinite(price) ? {price} : {})};
  appendFileSync(fileOf(base), JSON.stringify(v) + '\n');
  return v;
}
/** Every row with its verdict (if any) and review (if any). */
export function review(base, report) {
  const v = load(base), rows = rowsOf(report).map(r => ({...r, ...(v.get(key(r.step, r.item)) || {}), step: r.step, item: r.item, detail: r.detail}));
  return {rows, missing: rows.filter(r => !r.verdict).length, unreviewed: rows.filter(r => r.verdict && !r.review).length};
}
/** The user's review of one verdict: agreed or overturned (with what they decided instead). */
export function markReview(base, {step, item, review: kind, decided}) {
  if (!['agreed', 'overturned'].includes(kind)) throw new Error('review: agreed | overturned');
  appendFileSync(fileOf(base), JSON.stringify({step, item, review: kind, ...(decided ? {decided} : {}), reviewedAt: new Date().toISOString()}) + '\n');
}
/** The ledger entry a review makes: a proposal approved as proposed, or the manager's own call graded. */
export function ledgerKind(verdict, kind) {
  if (kind === 'agreed') return verdict === 'propose' ? 'approved-unchanged' : 'review-agreed';
  return verdict === 'propose' ? 'approved-changed' : 'review-overturned';
}
