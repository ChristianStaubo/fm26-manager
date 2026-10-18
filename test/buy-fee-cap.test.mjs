// Pepper (2036-06-04): max £11.47M, the Fee box steps £0.25M; 'nearest' bid £11.5M, Forest accepted, and the
// walk-away guard withdrew the bid. Bids now stay at or under the fee chosen; the cancelled talks reopened
// as a dead form (no Suggest Terms / Make Offer) and `fm buy` timed out on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {keepStep} from '../game/ui/controls.mjs';
import {talksCancelled} from '../capabilities/buy/buy.mjs';
import {loadScreen} from './screens.mjs';

test('a bid fee never ends above the target; nearest keeps the closer step', () => {
  assert.equal(keepStep(11.25e6, 11.5e6, 11.47e6, 'atMost'), false, 'undo to £11.25M');
  assert.equal(keepStep(11.25e6, 11.5e6, 11.47e6, 'nearest'), true, 'the old behaviour: £11.5M');
  assert.equal(keepStep(11.75e6, 11.25e6, 11.47e6, 'atMost'), true, 'stepping down past the target keeps the lower fee');
});

test('the dead form of cancelled talks is recognised (Pepper)', () => {
  assert.ok(talksCancelled(loadScreen('buy-talks-cancelled-pepper')));
  assert.ok(!talksCancelled(loadScreen('profile-transfer-arranged')));
});
