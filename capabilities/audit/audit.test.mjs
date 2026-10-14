// The outside judge, on the cases the user caught by eye in the summer 2030 window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSquad, checkDeals, checkMoney} from './audit.mjs';
import {loadPolicy} from '../sell/decide.mjs';

const rules = loadPolicy().scoreboard;
const tactic = n => ({slots: [{slot: 'GK'}, ...Array.from({length: n - 1}, (_, i) => ({slot: `S${i}`}))]});

test('squad: Ajer without a contract and Eyestone in the U21s fail; a fringe player warns; the shape needs 11 with a GK', () => {
  const r = checkSquad({tactic: tactic(11), alerts: [
    {name: 'Kristoffer Ajer', positions: 'DC', minutes: 2888, issue: 'no contract'},
    {name: 'Mikkel Damsgaard', positions: 'AMC', minutes: 715, issue: 'no contract'},
    {name: 'Julian Eyestone', positions: 'GK', minutes: 4230, issue: 'regular in Brentford U21'}]});
  assert.equal(r.fail.length, 2); assert.equal(r.warn.length, 1);
  assert.match(checkSquad({tactic: {slots: [{slot: 'LB'}]}}).fail[0], /no GK/);
});

test('deals: over the approval fails, add-ons over it warn, no approval fails; contract strings that cap resale warn', () => {
  const approvals = [{kind: 'buy', player: 'Pablo Gaitán', limit: 13e6}, {kind: 'buy', player: 'Camilo Ortega', limit: 64e6}, {kind: 'buy', player: 'X', limit: 1e6}];
  const r = checkDeals({rules, cap: 123750, approvals, decisions: [
    {action: 'buy', name: 'Pablo Gaitán', outcome: 'release-clause', fee: 12.75e6, reply: {upfront: 12.83e6, total: 13.62e6}},
    {action: 'buy', name: 'X', outcome: 'agreed', history: [{upfront: 2e6, total: 2e6}]},
    {action: 'buy', name: 'Nobody', outcome: 'agreed', history: [{upfront: 1e6, total: 1e6}]},
    {action: 'buy', name: 'Camilo Ortega', outcome: 'accepted-demands', demand: {upfront: 51e6, total: 61.25e6}},
    {action: 'personal-terms', player: 'Camilo Ortega', outcome: 'agreed', salary: 88000, demanded: {releaseClause: 82e6, playerSellOnPct: 10}},
    {action: 'personal-terms', player: 'Leo Lemaitre', outcome: 'accepted-pending', salary: 19000,
      tries: [{reply: 'My client feels these terms are acceptable'}, {reply: 'acceptable'}]}]});
  assert.ok(r.fail.some(f => /^X: £2.00M up front, above/.test(f)));
  assert.ok(r.fail.some(f => /Nobody: bought with no approval/.test(f)));
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
