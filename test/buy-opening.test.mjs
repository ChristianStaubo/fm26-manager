import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openingBid} from '../capabilities/buy/buy.mjs';

// Maza (2026-10-10): value ~£70M (range £56M-£84M) opened at ~£45M (0.9 x low) and was rejected flat.
test('opening bid is FM value (mid-range), lower only when the club wants to sell', () => {
  const facts = {valueRange: [56_000_000, 84_000_000]};
  assert.equal(openingBid(facts), 70_000_000);
  assert.equal(openingBid(facts, {keenToSell: true}), 59_500_000);
});

import {replyState} from '../capabilities/buy/buy.mjs';
const fake = gm => ({buttons: m => (m instanceof RegExp ? [{label: gm}] : []), hasText: () => false});
test('club replies are read from the General Manager line', () => {
  assert.equal(replyState(fake('General Manager: SC Freiburg believe the offer for Noah Atubolu is unacceptable')), 'rejected');
  assert.equal(replyState(fake('General Manager: Palace are prepared to accept the latest offer')), 'accepted');
  assert.equal(replyState(fake('General Manager: Palace have responded to the latest offer')), 'countered');
  assert.equal(replyState(fake('General Manager: waiting')), null);
});

import {termsAccepted} from '../capabilities/contracts/personal-terms.mjs';
const said = line => ({buttons: () => [{label: line}]});
test('a pending-decision reply counts as accepted terms (no more raises)', () => {
  assert.ok(termsAccepted(said('Momoka Hamaya Agent Suggest Terms My client is pleased with the negotiations and what appears to be a solution everyone agrees with, but would like to go away and think things over')));
  assert.ok(termsAccepted(said('Matt Grimes Player Suggest Terms These terms are acceptable but I wish to evaluate all my options')));
  assert.ok(!termsAccepted(said('Momoka Hamaya Agent There are several clubs taking a keen interest in my client')));
});
