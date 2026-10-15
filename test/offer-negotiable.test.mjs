// Doak (2031-06-17): Man Utd's £27.5M (+£7.5M instalments, +£4.6M add-ons) offer was negotiable, but
// the page shows that as a dropdown, not a text: the handler read it as non-negotiable and rejected
// it below our £45.22M minimum. It should counter (at our target; fm negotiations collects how clubs
// answer, to find the counter rule from data).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {negotiable, readOffer, incomingOffer} from '../game/screens/transfer-offers.mjs';
import {decideSale} from '../capabilities/sell/decide.mjs';

const s = loadScreen('offer-negotiable-doak-manutd');

test('offer page: the Negotiable dropdown is read as negotiable', () => {
  assert.equal(negotiable(s), true);
  assert.ok(incomingOffer.match(s));
});

test('Doak: a negotiable offer below our minimum is countered at our target, not rejected', () => {
  const o = readOffer(s, {headClub: 'Man Utd', shortName: 'Gannon Doak', coach: ''});
  assert.deepEqual([o.upfront, o.guaranteed, o.total], [27.5e6, 35e6, 39.6e6]);
  const d = decideSale({...o, vLow: 48e6, vHigh: 48e6, monthsLeft: 12, countersSoFar: 0, minimum: 45.22e6, target: 48e6});
  assert.equal(d.action, 'counter');
  assert.equal(d.guaranteedAsk, 48e6);
});
