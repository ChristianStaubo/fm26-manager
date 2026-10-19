// The decision check (docs/workflow-map.md, user 2026-10-19: "a smarter agent to judge the output"): a
// stronger model reads each logged decision with the same facts, the house rules in brief, and what the
// rule did, and says whether it agrees and what it would do. Disagreements are where a guardrail is too
// tight or the guidance is wrong (Arnalot: "not for sale below £123.5M" against £115M with Luiz signed).
// Log: local/runs/judge.jsonl.
import {readFileSync, appendFileSync, mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {claudeRunner} from '../capabilities/season/fallback.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RULES = `You review a Football Manager club's transfer decisions. The club (Brentford, 2nd in the Premier League,
Champions League finalist) is run Moneyball style. House rules:
- Profit is per season overall, not per window; but the XI must stay strong enough for the top 4.
- Never just reject a bid: counter at the price we'd sell for. A listed player sells at our target, then minimum.
- Price by how much we need him: a starter ~1.5x the top of his value, a backup ~1.2x, surplus ~1.0x;
  young rising players a bit more. Never below what we paid unless he is 30+ or in his final year.
- Strong starters, cheap backups. A starter whom a better signing displaced is now an expensive backup: sell.
- Prospects (young, PA well above CA) start or develop on loan; never give one away for nothing.
- A player in his final year who won't renew should be sold now rather than lost free.
- FM promises (e.g. "sold if a bid of £81M arrives") must be honoured.
Judge the decision on these rules and plain football-business sense. Be concrete about the price.`;

const SCHEMA = {type: 'object', additionalProperties: false, required: ['agrees', 'decision', 'why'],
  properties: {agrees: {type: 'boolean'}, decision: {type: 'string', enum: ['accept', 'counter', 'reject']},
    price: {type: ['number', 'null'], description: 'for a counter: the total fee to ask, in pounds'}, why: {type: 'string'}}};

const money = v => Number.isFinite(v) ? `£${(v / 1e6).toFixed(2)}M` : '?';
/** Our players as the judge needs them (export + depth roles): one Python call. */
export function squadFacts() {
  const code = `import json, manager as m, depth
rows, tactic = m.load()
_, roles = depth.roles(rows, tactic)
out = {}
for p in rows:
    if p['contract_club'] == m.CLUB:
        pos, role = roles.get(p['name'], (None, 'surplus'))
        out[p['name']] = {'age': m.intval(p, 'age'), 'ca': m.intval(p, 'ca'), 'pa': m.intval(p, 'pa'), 'wage': int(float(p['wage'] or 0)), 'expires': (p['contract_expires'] or '')[:10], 'role': role, 'position': pos}
print(json.dumps(out))`;
  try { return JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8', maxBuffer: 64 << 20})); } catch { return {}; }
}
export function bidCase(e, squad = {}) {
  const o = e.offer || {}, d = e.decision || {}, p = squad[o.player] || {};
  return [`Bid for our player ${o.player} from ${o.club} on ${e.date}.`,
    `Bid: ${money(o.guaranteed)} guaranteed (${money(o.upfront)} up front), ${money(o.total)} including add-ons; ${o.negotiable ? 'negotiable' : 'NON-negotiable (a counter is impossible: a counter means reject)'}.`,
    `His value range ${money(o.vLow)}-${money(o.vHigh)}; our minimum ${money(o.minimum)}, target ${money(o.target)}${o.priceBook ? ' (price book)' : ''}${Number.isFinite(o.releaseClause) && o.releaseClause > 0 ? `; RELEASE CLAUSE ${money(o.releaseClause)} (any club may pay it: our price can't exceed it)` : ''}; ${o.monthsLeft ?? '?'} months left on his contract.`,
    `Age ${p.age ?? o.age ?? '?'}, CA ${p.ca ?? '?'}/PA ${p.pa ?? '?'}, wage £${Math.round((p.wage || 0) / 1000)}K/wk, contract to ${p.expires || '?'}; role in our depth chart now: ${p.role ?? o.depth?.role ?? '?'}${p.position ? ' at ' + p.position : ''}; we paid ${money(o.paid?.fee ?? o.paid)}.`,
    o.moneyball ? `Our pricing note: ${String(o.moneyball).slice(0, 300)}` : '',
    o.coach ? `Coach: ${String(o.coach).slice(0, 160)}` : '',
    `The rule decided: ${d.action}${d.guaranteedAsk ? ` asking ${money(d.guaranteedAsk)} guaranteed + their add-ons = ${money(d.totalAsk)} total` : ''} (${String(d.reason || '').slice(0, 200)}).`].filter(Boolean).join('\n');
}

export async function judgeBids({last = 12, model = 'opus', runner = claudeRunner({timeoutMs: 180000}), recompute = false} = {}) {
  // recompute: replay each logged bid through today's rule (capabilities/sell/decide.mjs) and judge that.
  const {decideSale} = recompute ? await import('../capabilities/sell/decide.mjs') : {};
  const rows = readFileSync(`${ROOT}local/runs/decisions.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const bids = new Map();
  for (const e of rows) if (e.action === 'incoming-offer' && e.offer?.player && e.decision) bids.set(`${e.offer.player}|${e.offer.club}`, e);
  const cases = [...bids.values()].slice(-last), out = [], squad = squadFacts();
  mkdirSync(`${ROOT}local/runs`, {recursive: true});
  for (const e0 of cases) {
    const e = recompute ? {...e0, decision: decideSale({countersSoFar: 0, ...e0.offer})} : e0;
    const prompt = bidCase(e, squad);
    const v = await runner({system: RULES, prompt, schema: SCHEMA, model});
    const r = {at: new Date().toISOString(), kind: recompute ? 'bid-recomputed' : 'bid', date: e.date, player: e.offer.player, club: e.offer.club, rule: e.decision.action, ruleAsk: e.decision.guaranteedAsk ?? null, judge: v};
    appendFileSync(`${ROOT}local/runs/judge.jsonl`, JSON.stringify(r) + '\n');
    out.push(r);
  }
  return {cases: out.length, agree: out.filter(r => r.judge?.agrees).length, disagree: out.filter(r => r.judge && !r.judge.agrees).map(r => ({player: r.player, club: r.club, date: r.date, rule: r.rule, judge: r.judge.decision, price: r.judge.price, why: r.judge.why})), failed: out.filter(r => !r.judge).length};
}
