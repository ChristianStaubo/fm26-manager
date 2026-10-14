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
