import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openingBid} from '../capabilities/buy/buy.mjs';

// Maza (2026-10-10): value ~£70M (range £56M-£84M) opened at ~£45M (0.9 x low) and was rejected flat.
test('opening bid is FM value (mid-range), lower only when the club wants to sell', () => {
  const facts = {valueRange: [56_000_000, 84_000_000]};
  assert.equal(openingBid(facts), 70_000_000);
  assert.equal(openingBid(facts, {keenToSell: true}), 59_500_000);
});
