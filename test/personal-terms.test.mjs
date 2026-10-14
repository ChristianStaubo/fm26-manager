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

test('probe (user, 2026-10-15): firm counter → 1 tick under it, flexible → 2; expensive wages open 5 ticks under', async () => {
  const {nextOfferTicks} = await import('../capabilities/contracts/personal-terms.mjs');
  const p = loadPolicy().contracts.probe;
  assert.equal(nextOfferTicks({demand: 73000, counter: 66000, tick: 1000}, p), 2, 'Lawrence: countered 7 ticks down → flexible → £64K');
  assert.equal(nextOfferTicks({demand: 125000, counter: 125000, tick: 5000}, p), 1, 'held at the demand → firm');
  assert.equal(nextOfferTicks({demand: 125000, counter: 120000, tick: 5000}, p), 1, 'one tick down → still firm');
  assert.equal(p.open_ticks_expensive, 5); assert.equal(p.expensive_over, 75000);
});

test('a counter is not an agreement: "latest demands" with Finalize Deal (Casadó, 2030-07-17)', async () => {
  const {counterLine} = await import('../capabilities/contracts/personal-terms.mjs');
  const scr = line => ({buttons: re => [{label: line}].filter(b => re.test(b.label))});
  assert.equal(counterLine(scr("Iarley Silva Agent Suggest Terms What a promising start to these discussions. We are very close to concluding some form of deal here. Here are my client's latest demands:")), true);
  assert.equal(counterLine(scr("Manuel Vogt Agent Suggest Terms Everything here appears to be in order, you'll hear from us after we've taken some time to think things over.")), false);
});
