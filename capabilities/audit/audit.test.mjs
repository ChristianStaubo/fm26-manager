// The outside judge, on the cases the user caught by eye in the summer 2030 window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSquad, checkDeals, checkMoney} from './audit.mjs';
import {loadPolicy} from '../sell/decide.mjs';

const rules = loadPolicy().scoreboard;
const tactic = n => ({slots: [{slot: 'GK'}, ...Array.from({length: n - 1}, (_, i) => ({slot: `S${i}`}))]});

test('squad: Eyestone in the U21s fails; no contract and final year are the user\'s decisions; released players pass', () => {
  const r = checkSquad({tactic: tactic(11), released: ['Mikkel Damsgaard'], alerts: [
    {name: 'Kristoffer Ajer', positions: 'DC', minutes: 2888, issue: 'no contract'},
    {name: 'Mikkel Damsgaard', positions: 'AMC', minutes: 715, issue: 'no contract'},
    {name: 'Franculino', positions: 'ST', age: 26, minutes: 3165, value: 37.9e6, expires: '2031-06-30', issue: 'final year'},
    {name: 'Julian Eyestone', positions: 'GK', minutes: 4230, issue: 'regular in Brentford U21'}]});
  assert.equal(r.fail.length, 1); assert.equal(r.decide.length, 2);
  assert.match(r.decide[1], /Franculino .* final year .* renew or sell this window/);
  assert.match(checkSquad({tactic: {slots: [{slot: 'LB'}]}}).fail[0], /no GK/);
});

test('deals: over the approval fails, add-ons over it warn, no approval fails; contract strings that cap resale warn', () => {
  const approvals = [{kind: 'buy', player: 'Pablo Gaitán', limit: 13e6}, {kind: 'buy', player: 'Camilo Ortega', limit: 64e6}, {kind: 'buy', player: 'X', limit: 1e6}];
  const r = checkDeals({rules, cap: 123750, approvals, decisions: [
    {action: 'buy', name: 'Pablo Gaitán', outcome: 'release-clause', fee: 12.75e6, reply: {upfront: 12.83e6, total: 13.62e6}},
    {action: 'buy', name: 'X', outcome: 'agreed', history: [{upfront: 2e6, total: 2e6}]},
    {action: 'buy', name: 'Nobody', outcome: 'agreed', history: [{upfront: 1e6, total: 1e6}]},
    {action: 'buy', name: 'Richard Ortiz', outcome: 'release-clause', fee: 2.5e6},
    {action: 'manual-click', label: 'Confirm', screen: ['Bookmarks', '(Richard Ortiz)', 'Entire offer', 'Cancel Negotiations', 'Are you sure you want to cancel negotiations?']},
    {action: 'buy', name: 'Camilo Ortega', outcome: 'accepted-demands', demand: {upfront: 51e6, total: 61.25e6}},
    {action: 'personal-terms', player: 'Camilo Ortega', outcome: 'agreed', salary: 88000, demanded: {releaseClause: 82e6, playerSellOnPct: 10}},
    {action: 'personal-terms', player: 'Jair Espino', outcome: 'agreed', salary: 250000, renewal: {verdict: 'renew', ratio: 2.96}},
    {action: 'personal-terms', player: 'Big Wage', outcome: 'agreed', salary: 250000},
    {action: 'personal-terms', player: 'Leo Lemaitre', outcome: 'accepted-pending', salary: 19000,
      tries: [{reply: 'My client feels these terms are acceptable'}, {reply: 'acceptable'}]}]});
  assert.ok(r.fail.some(f => /^X: £2.00M up front, above/.test(f)));
  assert.ok(r.fail.some(f => /Nobody: bought with no approval/.test(f)));
  assert.ok(!r.fail.some(f => /Espino/.test(f)), 'a renewal that passed the test may exceed the cap (PLAYBOOK §6)');
  assert.ok(r.fail.some(f => /Big Wage: £250000\/wk, above the wage cap/.test(f)));
  assert.ok(!r.fail.some(f => /Ortiz/.test(f)), 'talks cancelled after the fee: not a buy');
  assert.ok(r.warn.some(w => /Pablo Gaitán: .* with add-ons/.test(w)));
  assert.ok(r.warn.some(w => /Ortega: the player takes 10%/.test(w)));
  assert.ok(r.warn.some(w => /Ortega: release clause £82.00M is under 1.5x/.test(w)));
  assert.ok(r.warn.some(w => /Lemaitre: suggested again after the agent had agreed/.test(w)));
});

test('money: net transfer profit is cumulative; wages and the relegation floor', () => {
  const ledger = {seasons: {a: {in: 37e6, out: 110e6}, b: {in: 159e6, out: 226e6}}};
  const r = checkMoney({rules, ledger, position: 18, club: {month_end_balance: 1, month_end_wage_bill_pw: 1.9e6, wage_budget_pw: 1.8e6}});
  assert.equal(r.score.netTransferProfit, 140e6);
  assert.ok(r.fail.some(f => /wage bill 106%/.test(f)));
  assert.ok(r.fail.some(f => /relegation/.test(f)));
  assert.equal(checkMoney({rules, ledger, position: 15}).warn.length, 1);
});

test('a U21 regular already moved to the senior squad (fm move) is not a failure (McFall, 2034-01)', async () => {
  const {checkSquad} = await import('./audit.mjs');
  const tactic = {slots: Array.from({length: 11}, (_, i) => ({slot: i ? 'X' + i : 'GK'}))};
  const alerts = [{name: 'Tom McFall', positions: 'DR', minutes: 1967, issue: 'regular in Brentford U21'}];
  assert.equal(checkSquad({alerts, tactic}).fail.length, 1);
  assert.equal(checkSquad({alerts, tactic, moved: ['Tom McFall']}).fail.length, 0);
});
