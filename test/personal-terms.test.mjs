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
  const scr = line => ({buttons: re => [{label: line, name: 'SIButton'}].filter(b => re.test(b.label))});
  assert.equal(counterLine(scr("Iarley Silva Agent Suggest Terms What a promising start to these discussions. We are very close to concluding some form of deal here. Here are my client's latest demands:")), true);
  assert.equal(counterLine(scr("Manuel Vogt Agent Suggest Terms Everything here appears to be in order, you'll hear from us after we've taken some time to think things over.")), false);
});

test('opening (user sessions): ~10% under the demand, at least 8 ticks', async () => {
  const {openingTicks} = await import('../capabilities/contracts/personal-terms.mjs');
  const p = loadPolicy().contracts.probe;
  assert.equal(openingTicks({demand: 87000, tick: 1000}, p), 9, 'Fresneda: £87K → ~£78K (the user opened £79K)');
  assert.equal(openingTicks({demand: 20500, tick: 250}, p), 8, 'small wage: at least 8 ticks');
  assert.equal(openingTicks({demand: 125000, tick: 5000}, p), 3, 'Casadó: £5K ticks: ~10% = 3 ticks (£110K), not 8 (-32%)');
  assert.equal(openingTicks({demand: 73000, tick: 1000}, p), 8, 'Lawrence: 8 ticks (£65K); the user went deeper (£60K) and met the counter');
});

test('promises (user, Fresneda): take the "(Recommended)" playing time when it is lower than asked', async () => {
  const {lowerPromise} = await import('../capabilities/contracts/personal-terms.mjs');
  const opts = ['Star Player', 'Important Player', 'Regular Starter (Recommended)', 'Squad Player', 'Fringe Player'];
  assert.deepEqual(lowerPromise('Important Player', opts), {from: 'Important Player', to: 'Regular Starter', option: 'Regular Starter (Recommended)', index: 2});
  assert.deepEqual(lowerPromise('Regular Starter', opts), {from: 'Regular Starter', to: 'Squad Player', option: 'Squad Player', index: 3}, 'always one lower (user)');
  assert.deepEqual(lowerPromise('Squad Player', opts)?.to, 'Fringe Player', 'one lower still');
  assert.equal(lowerPromise('Fringe Player', opts), null, 'nothing lower: keep it');
  assert.equal(lowerPromise('Important Player', ['Star Player', 'Important Player']), null, 'no lower option shown');
});

test('the split (user sessions): open at half the raise, then halfway to the counter', async () => {
  const {splitOpening, splitCounter, splitTicks} = await import('../capabilities/contracts/personal-terms.mjs');
  const p = loadPolicy().contracts.probe;
  assert.equal(splitOpening({demand: 88000, current: 49000}, p), 68500, 'Fer López: the user agreed £69K');
  assert.equal(splitTicks({demand: 88000, current: 49000, target: 68500, tick: 1000}), 20, '£88K − 20 ticks = £68K-£69K');
  assert.equal(splitOpening({demand: 73000, current: 49500}, p), 61250, 'Lawrence: the user opened £60K');
  assert.equal(splitCounter({offered: 61000, counter: 66000}), 63500, 'Lawrence: countered £66K, the user settled £64K');
  assert.equal(splitTicks({demand: 50000, current: 49000, target: 30000, tick: 1000}), 1, 'never below the current wage');
});
