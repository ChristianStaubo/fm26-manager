// Lemaitre's talks (2030-07-14): the agent accepted our first try, a second suggestion was sent
// anyway (the reply was read too early), and he answered "We had already provisionally agreed
// terms…" with Finalize Deal. That screen is agreement: finalize, don't suggest again.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {termsAccepted, tickMoves} from '../capabilities/contracts/personal-terms.mjs';
import {loadPolicy} from '../capabilities/sell/decide.mjs';

test('"already provisionally agreed terms" with Finalize Deal reads as agreed', () => {
  const s = loadScreen('contract-provisionally-agreed-lemaitre');
  assert.equal(termsAccepted(s), true);
  assert.equal(s.buttons('Finalize Deal').length, 1);
});

test('tick rule (user): opening demand, 3 presses of −, then step back up one at a time, one Reset', () => {
  assert.deepEqual(loadPolicy().contracts.salary_ticks_down, [3, 2, 1, 0]);
  assert.deepEqual(tickMoves([3, 2, 1, 0]), [-3, 1, 1, 1]);
});

test('renewal test (user, 2026-10-15): renew when the value protected is ≥ 1.5x the cost, above the cap too; else sell or run down', async () => {
  const {renewalVerdict} = await import('../capabilities/contracts/renew.mjs');
  const rules = loadPolicy().contracts.renewal;
  const lawrence = renewalVerdict({currentWage: 49500, value: 15.75e6, demand: 67000, years: 4, loyaltyBonus: 1.9e6, agentFee: 155000}, rules);
  assert.equal(lawrence.verdict, 'renew');
  // Casadó at his final-year value (£18.5M): over the whole 5 years 0.85x, over the 2-season holding period 1.54x.
  const casado = renewalVerdict({currentWage: 62352, value: 18.49e6, demand: 125000, years: 5, loyaltyBonus: 5e6, agentFee: 375000}, rules);
  assert.equal(casado.verdict, 'renew'); assert.ok(casado.ratio >= 1.5 && casado.ratio < 1.6);
  assert.equal(renewalVerdict({currentWage: 50000, value: 10e6, demand: 120000, years: 5, loyaltyBonus: 5e6}, rules).verdict, 'sell');
  assert.equal(renewalVerdict({currentWage: 40000, value: 1e6, demand: 60000, years: 2, age: 32, minutes: 300}, rules).verdict, 'run-down');
});
