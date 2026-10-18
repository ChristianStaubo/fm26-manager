// A stray £17.25M offer for Pepper (2036-06-04): our tools couldn't withdraw it. The user's way, recorded
// with fm record/fm watch: select the deal, tick the box by "N Active Offers" (Withdraw Offer is disabled
// until then), Withdraw Offer; no confirmation, the offer is gone the next day.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {offersBox} from '../game/screens/transfer-activity.mjs';

test('the box that enables Withdraw Offer is found by the Active Offers line', () => {
  const box = offersBox(loadScreen('activity-withdraw-pepper'));
  assert.ok(box);
  assert.equal(Math.round(box.bounds[1]), 879);
});
