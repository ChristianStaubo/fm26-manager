import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rowsOf, record, review, markReview, ledgerKind} from '../capabilities/season/verdicts.mjs';
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
  assert.deepEqual(rows, ['contracts|Chris Brady', 'final_year|Mattia Romeo', 'free_agents|Yumeki Yokoyama', 'wonderkids|Ethan Hewitt',
    'squad|DM upgrade', 'squad|sell? Manuel Saavedra', 'buys|ST backup', 'bargains|Radovan Rusnák']);
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
  assert.equal(r.missing, 6);
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
