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

test('wage ceiling for a signing: the lower of our peers x 1.15 and his current wage x 2.5 (Ylla, Espino, Mokio, 2033-08-05)', async () => {
  const {wageCeiling} = await import('../capabilities/contracts/personal-terms.mjs');
  const wc = {peer_factor: 1.15, current_factor: 2.5};
  assert.equal(wageCeiling({peerMedian: 105250, currentWage: 42472}, wc), 106180, 'Ylla: 2.5 x £42.5K (he got £180K)');
  assert.equal(wageCeiling({peerMedian: 135000, currentWage: 79000}, {peer_factor: 1.0, current_factor: 2.0}), 135000, 'Espino under the tightened ceiling (2034-06-11): walk away above £135K');
  assert.equal(wageCeiling({peerMedian: 81515, currentWage: 30312}, wc), 75780, 'Espino: 2.5 x £30.3K (he got £145K)');
  assert.equal(wageCeiling({peerMedian: 127750, currentWage: 68000}, wc), 146913, 'Mokio: peers x 1.15');
  assert.equal(wageCeiling({peerMedian: null, currentWage: null}, wc), null);
});
