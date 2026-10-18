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
  // auto: a verdict the table already settled (no money, no judgement): recorded by code, so the model
  // answers only the rows that need it (2026-10-19: 39 of 63 rows were restated table outcomes, ~10 min).
  const add = (step, item, detail, auto) => item && out.push({step, item: String(item), detail, ...(auto ? {auto} : {})});
  // A player raised by an earlier step is answered there (Luiz was a free-agent, upgrade, bargain and audit row).
  const named = new Set(), first = (step, name, detail, auto) => { const k = String(name).toLowerCase(); if (named.has(k)) return; named.add(k); add(step, name, detail, auto); };
  for (const p of data('contracts')?.expiring || []) add('contracts', p.name, `${p.issue} (to ${p.expires}), ${money(p.value)}: ${p.do}`);
  for (const p of data('final_year')?.players || []) add('final_year', p.name, `final year, ${money(p.value)}: ${p.decision?.action ?? '?'}${p.decision?.reason ? ' (' + p.decision.reason + ')' : ''}`);
  for (const p of data('free_agents')?.players || []) first('free_agents', p.name, `${p.age}, ${p.slot ?? p.positions}${p.ca ? `, CA ${p.ca}/PA ${p.pa}` : ''}, worth ${money(p.worth)}${p.always_buy ? ', ALWAYS BUY' : ''}, ${p.contract_club || 'free'} to ${p.contract_until || '-'}: ${p.route ?? ''}`);
  for (const p of data('wonderkids')?.players || []) add('wonderkids', p.name, `${p.age}, ${p.positions}, ${p.nation}, PA ${p.pa} CA ${p.ca}, ${p.club}, ${money(p.value)}`);
  for (const p of data('newgens')?.signable_now || []) add('newgens', p.name, `${p.age}, ${p.positions}, ${p.nation}, PA ${p.pa} CA ${p.ca}, ${p.club}, ${money(p.value)}`);
  // The squad step is the picture; the buy and sell tables decide. Its own needs (output-based upgrade
  // flags, specialist counts) and sell candidates contradicted the tables on 2036-06-04 (CB depth, Brady
  // 30+): rows only when the tables didn't run.
  const sq = data('squad'), buys = data('buys'), sells = Array.isArray(data('sells')) ? data('sells') : null;
  if (!buys) for (const n of sq?.needs || []) add('squad', `${n.position} ${n.kind}`, n.why);
  if (!sells) for (const c of sq?.sell_candidates || []) add('squad', `sell? ${c.name}`, c.why);
  for (const r of buys?.positions || []) for (const n of r.needs || [])
    add('buys', `${r.position} ${n.kind}${n.for ? ' for ' + n.for : ''}`, `${n.if_sold ? `only once ${n.if_sold} is sold; ` : ''}CA >= ${n.min_ca}: ${(n.candidates || []).slice(0, 3).map(c => `${c.name} (${c.age}, CA ${c.ca}, ${c.club}) ${money(c.value)}`).join(' · ') || 'none in range'}`);
  // Upgrades (user, 2026-10-18): one the season surplus pays for, or one a sale at that position funds.
  for (const r of buys?.positions || []) for (const c of r.upgrade_option?.candidates || []) if ((c.buy || c.buy_if_sold) && !named.has(c.name.toLowerCase()))
    add('buys', `${r.position} upgrade ${c.name}`, `${c.age}, CA ${c.ca}, ${c.club}, ${money(c.value)}: ${c.buy ? 'the season surplus pays' : `only once ${c.buy_if_sold.join(' or ')} is sold`} (starters ${r.starters.join(', ')})`);
  for (const c of buys?.wonderkids || []) if (!named.has(c.name.toLowerCase())) named.add(c.name.toLowerCase()), add('buys', `wonderkid ${c.name}`, `PA ${c.pa}, ${c.positions}, ${c.club}, ${money(c.value)}${c.replaces ? `; replaces ${c.replaces} in the portfolio (he is sold)` : ''}`);
  const bargains = data('bargains');
  for (const c of (bargains?.undervalued || []).slice(0, 5)) first('bargains', c.name, `undervalued ${c.ratio}x (typical ${money(c.typical)}): ${c.age}, ${c.positions}, CA ${c.ca}/PA ${c.pa}, ${c.club}, ${money(c.value)}`);
  for (const c of (bargains?.buried || []).slice(0, 5)) first('bargains', c.name, `buried talent: ${c.age}, ${c.positions}, CA ${c.ca}/PA ${c.pa}, ${c.club}, ${money(c.value)}`);
  for (const x of sells || []) if (x.action !== 'keep') add('sells', x.name, `${x.action}${x.ask ? ' at ' + money(x.ask) : ''} (${x.role ?? ''})`,
    ['loan', 'let-go'].includes(x.action) ? {verdict: 'act', why: `${x.action === 'loan' ? 'Loan' : 'Let go'} by the sell table: ${x.why} (${x.age}, CA ${x.ca}/PA ${x.pa}, ${x.role})`} : null);
  const plan = data('plan');
  for (const b of plan?.buy || []) add('plan', `buy ${b.name}`, `${b.slot} ${b.role}, ${money(b.value)}, walk away ${money(b.walk_away)}`);
  for (const x of plan?.sell || []) add('plan', `sell ${x.name}`, (x.why || []).join('; '));
  for (const d of data('audit')?.decide || []) { const fa = /^free agent (.+?) \(/.exec(d); if (!fa || !named.has(fa[1].toLowerCase())) add('audit', d.slice(0, 70), d); }
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
const isSale = r => r.step === 'sells' || /^sell\b/i.test(r.item);
/** Profit is per season (user, 2026-10-18): the season's net transfer money if every proposal went through
 *  at its price (sales at their minimum, buys at their maximum), from the surplus the buy table started with.
 *  A player raised by two steps (Pepper: wonderkid and bargain) counts once; overturned proposals don't. */
export function seasonNet(rows, surplus = 0) {
  const seen = new Set(), name = r => r.item.replace(/^(sell\??|buy|wonderkid|\w+ upgrade)\s+/i, '').toLowerCase();
  let sales = 0, buys = 0;
  for (const r of rows) {
    if (r.verdict !== 'propose' || r.review === 'overturned' || !Number.isFinite(r.price) || seen.has(name(r))) continue;
    seen.add(name(r));
    if (isSale(r)) sales += r.price; else buys += r.price;
  }
  return {surplus, sales, buys, net: surplus + sales - buys};
}
/** Every row with its verdict (if any) and review (if any). */
export function review(base, report) {
  const v = load(base), rows = rowsOf(report).map(r => {
    const got = v.get(key(r.step, r.item));
    return {...r, ...(got?.verdict ? got : {...got, ...(r.auto ? {verdict: r.auto.verdict, why: r.auto.why, auto: true} : {})}), step: r.step, item: r.item, detail: r.detail};
  });
  const surplus = report?.steps?.buys?.data?.season_surplus;
  return {rows, missing: rows.filter(r => !r.verdict).length, unreviewed: rows.filter(r => r.verdict && !r.review).length,
    season: seasonNet(rows, Number.isFinite(surplus) ? surplus : 0)};
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
