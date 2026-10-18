import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rowsOf, record, review, markReview, ledgerKind, seasonNet} from '../capabilities/season/verdicts.mjs';
import {checkCheckpoints} from '../capabilities/audit/audit.mjs';

// A small January-style report: the rows the manager must answer.
const report = {checkpoint: 'january', date: '2036-01-05', verdicts: true, steps: {
  ledger: {ok: true, data: {}},
  contracts: {ok: true, data: {expiring: [{name: 'Chris Brady', issue: 'two seasons left', expires: '2037-06-30', value: 36.5e6, do: 'renew if the test passes'}]}},
  final_year: {ok: true, data: {players: [{name: 'Mattia Romeo', value: 1e5, decision: {action: 'ask-demands', reason: 'no cheap equal'}}]}},
  free_agents: {ok: true, data: {players: [{name: 'Yumeki Yokoyama', age: 30, slot: 'LW', worth: 36.8e6, always_buy: false, contract_club: 'Parthenope', contract_until: '2036-06-30'}]}},
  wonderkids: {ok: true, data: {players: [{name: 'Ethan Hewitt', age: 17, positions: 'WBR', nation: 'England', pa: 175, ca: 101, club: 'Stoke City', value: 7.4e6}]}},
  squad: {ok: true, data: {needs: [{position: 'DM', kind: 'upgrade', why: 'starter Arnal Ylla ranks 22/31'}], sell_candidates: [{name: 'Manuel Saavedra', why: 'surplus'}]}},
  buys: {ok: true, data: {positions: [{position: 'ST', needs: [{kind: 'backup', min_ca: 124, candidates: [{name: 'Vladimir Mitrović', age: 19, ca: 141, club: 'Caen', value: 3.3e6}]}]}]}},
  bargains: {ok: true, data: {undervalued: [{name: 'Radovan Rusnák', ratio: 5.9, typical: 25e6, age: 20, positions: 'AML', ca: 147, pa: 155, club: 'Baník Ostrava', value: 4.3e6}], buried: []}},
  audit: {ok: true, data: {decide: []}},
  sells: {ok: false, error: 'not run'},
}};

test('every table row becomes a row to answer, named so the agent can address it', () => {
  const rows = rowsOf(report).map(r => `${r.step}|${r.item}`);
  // The buy table ran, so the squad step's own needs are not rows (the tables decide); the sell table
  // didn't, so its sell candidates still are.
  assert.deepEqual(rows, ['contracts|Chris Brady', 'final_year|Mattia Romeo', 'free_agents|Yumeki Yokoyama', 'wonderkids|Ethan Hewitt',
    'squad|sell? Manuel Saavedra', 'buys|ST backup', 'bargains|Radovan Rusnák']);
});

test('a verdict needs a known kind, a reason, a price when it proposes, and a real row', () => {
  const base = join(mkdtempSync(join(tmpdir(), 'fm-verdicts-')), '2036-01-05-january'), rows = rowsOf(report);
  assert.throws(() => record(base, {step: 'buys', item: 'ST backup', verdict: 'maybe', why: 'x'}, rows), /act \| propose \| pass/);
  assert.throws(() => record(base, {step: 'buys', item: 'ST backup', verdict: 'pass'}, rows), /--why/);
  assert.throws(() => record(base, {step: 'buys', item: 'ST backup', verdict: 'propose', why: 'a backup striker'}, rows), /--price/);
  assert.throws(() => record(base, {step: 'buys', item: 'CB depth', verdict: 'pass', why: 'x'}, rows), /No row/);
  record(base, {step: 'buys', item: 'st backup', verdict: 'propose', why: 'Mitrović, 19, CA 141', price: 4e6}, rows);
  record(base, {step: 'contracts', item: 'Chris Brady', verdict: 'act', why: 'renewal test passed'}, rows);
  const r = review(base, report);
  assert.equal(r.missing, 5);
  assert.equal(r.rows.find(x => x.item === 'ST backup').price, 4e6);
});

test('the review marks each verdict, and maps to the autonomy ledger', () => {
  const base = join(mkdtempSync(join(tmpdir(), 'fm-verdicts-')), '2036-01-05-january'), rows = rowsOf(report);
  record(base, {step: 'contracts', item: 'Chris Brady', verdict: 'act', why: 'renewal test passed'}, rows);
  markReview(base, {step: 'contracts', item: 'Chris Brady', review: 'agreed'});
  const r = review(base, report);
  assert.equal(r.rows.find(x => x.item === 'Chris Brady').review, 'agreed');
  assert.equal(r.unreviewed, 0);
  assert.equal(ledgerKind('propose', 'agreed'), 'approved-unchanged');
  assert.equal(ledgerKind('act', 'agreed'), 'review-agreed');
  assert.equal(ledgerKind('pass', 'overturned'), 'review-overturned');
});

test('the judge fails the latest verdict-era checkpoint while rows are unanswered; older reports are exempt', () => {
  const cycle = {checkpoints: []};
  const old = {name: 'january', date: '2036-01-05', report: {checkpoint: 'january'}, file: 'x/2036-01-05-january.json'};
  const fresh = {name: 'newgen', date: '2036-05-01', report: {checkpoint: 'newgen', verdicts: true}, file: 'x/2036-05-01-newgen.json'};
  assert.deepEqual(checkCheckpoints({today: '2036-05-02', cycle, reports: [old], missingVerdicts: () => 9}).fail, []);
  assert.match(checkCheckpoints({today: '2036-05-02', cycle, reports: [old, fresh], missingVerdicts: () => 3}).fail[0], /newgen checkpoint 2036-05-01: 3 row\(s\) without a verdict/);
  assert.deepEqual(checkCheckpoints({today: '2036-05-02', cycle, reports: [old, fresh], missingVerdicts: () => 0}).fail, []);
});

test('upgrade rows: one the surplus pays, or one a sale at that position funds (user, 2026-10-18)', () => {
  const r = {...report, steps: {...report.steps, buys: {ok: true, data: {season_surplus: 35e6, positions: [{position: 'DM', starters: ['Rosete 180', 'Ylla 161'], needs: [],
    upgrade_option: {candidates: [{name: 'Senhaji', age: 23, ca: 178, club: 'Espanyol', value: 73e6, buy: false, buy_if_sold: ['Arnal Ylla', 'Victor Froholdt']}, {name: 'Other', age: 24, ca: 170, value: 90e6, buy: false}]}}]}}}};
  const row = rowsOf(r).find(x => x.step === 'buys');
  assert.equal(row.item, 'DM upgrade Senhaji');
  assert.match(row.detail, /only once Arnal Ylla or Victor Froholdt is sold/);
});

test('profit is per season: the net if every proposal went through, each player once, overturned ones out', () => {
  const rows = [{step: 'sells', item: 'Froholdt', verdict: 'propose', price: 40e6}, {step: 'buys', item: 'DM upgrade Senhaji', verdict: 'propose', price: 80e6},
    {step: 'buys', item: 'wonderkid Pepper', verdict: 'propose', price: 11e6}, {step: 'bargains', item: 'Pepper', verdict: 'propose', price: 11e6},
    {step: 'free_agents', item: 'Luiz', verdict: 'propose', price: 0}, {step: 'buys', item: 'wonderkid Sweeney', verdict: 'propose', price: 12e6, review: 'overturned'},
    {step: 'squad', item: 'sell? Gray', verdict: 'propose', price: 51e6}];
  assert.deepEqual(seasonNet(rows, 35e6), {surplus: 35e6, sales: 91e6, buys: 91e6, net: 35e6});
});

test('settled rows are answered by code; a player raised by several steps is one row (2026-10-19: 63 rows took ~10 min)', () => {
  const r = {...report, steps: {...report.steps,
    free_agents: {ok: true, data: {players: [{name: 'Alexandre Luiz', age: 24, slot: 'LB', worth: 89e6, always_buy: true}]}},
    bargains: {ok: true, data: {undervalued: [{name: 'Alexandre Luiz', ratio: 32, typical: 89e6}], buried: []}},
    audit: {ok: true, data: {decide: ['free agent Alexandre Luiz (24, LB) worth £89M: fm precontract']}},
    sells: {ok: true, data: [{name: 'Slatina', action: 'loan', why: 'prospect outside the depth chart', age: 19, ca: 148, pa: 189, role: 'surplus'},
      {name: 'Gray', action: 'sell', ask: 61e6, role: 'backup', why: 'lucky season'}]}}};
  const rows = rowsOf(r);
  assert.equal(rows.filter(x => x.item === 'Alexandre Luiz' || /Luiz/.test(x.item)).length, 1);
  const base = join(mkdtempSync(join(tmpdir(), 'fm-verdicts-')), '2036-06-04-season_end'), rv = review(base, r);
  const slat = rv.rows.find(x => x.item === 'Slatina'), gray = rv.rows.find(x => x.item === 'Gray');
  assert.equal(slat.verdict, 'act'); assert.equal(slat.auto, true); assert.match(slat.why, /Loan by the sell table/);
  assert.equal(gray.verdict, undefined, 'a sale is the manager\'s call');
  record(base, {step: 'sells', item: 'Slatina', verdict: 'pass', why: 'override'}, rows);
  assert.equal(review(base, r).rows.find(x => x.item === 'Slatina').verdict, 'pass', 'the manager can override a settled row');
});

test('a promised sale (Miceli: sold if £81M is bid) counts in the season net, once', () => {
  const rows = [{step: 'buys', item: 'CB replace for Edoardo Miceli', verdict: 'propose', price: 21e6}];
  assert.deepEqual(seasonNet(rows, 35e6, [{name: 'Edoardo Miceli', price: 81e6}]), {surplus: 35e6, sales: 81e6, buys: 21e6, net: 95e6});
});

test('a free agent whose transfer to us is arranged is answered as done (Luiz, Rusnák, 2036-06-04)', () => {
  const r = {...report, steps: {...report.steps, free_agents: {ok: true, data: {players: [
    {name: 'Alexandre Luiz', age: 24, slot: 'LB', worth: 89e6, always_buy: true, arranged: {club: 'Brentford', date: '2036-07-01'}}]}}}};
  const base = join(mkdtempSync(join(tmpdir(), 'fm-verdicts-')), '2036-06-04-season_end');
  const row = review(base, r).rows.find(x => x.item === 'Alexandre Luiz');
  assert.equal(row.verdict, 'act'); assert.equal(row.auto, true); assert.match(row.why, /joining Brentford on 2036-07-01/);
});
