// Promises we can't keep (user, 2033-07-04: Germany was promised "play as an overlapping centre-back").
import test from 'node:test';
import assert from 'node:assert/strict';
import {POSITION_PROMISE} from '../capabilities/contracts/personal-terms.mjs';

test('a promise to play him in a set position or role is caught; other promises are not', () => {
  for (const t of ['Play as an overlapping centre-back', 'Play in his preferred position', 'Use him as a ball-playing defender', 'Playing as a wing-back'])
    assert.ok(POSITION_PROMISE.test(t), t);
  for (const t of ['Improve coaching staff', 'Sign a quality striker', 'Contract Start Date', 'Immediate - 7/4/2033'])
    assert.ok(!POSITION_PROMISE.test(t), t);
});
