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
  assert.equal(d.upfront, 40.5e6, 'the ask is on guaranteed money: £40.5M + their £7.5M instalments; add-ons on top');
});

test('Villa (user, 2031-06-17): £27.5M + £7.75M instalments + £4.4M add-ons → ask about £40M up front, as the user did', () => {
  const d = decideSale({club: 'Aston Villa', negotiable: true, guaranteed: 35.25e6, upfront: 27.5e6, total: 39.65e6, vLow: 48e6, vHigh: 48e6, monthsLeft: 12, countersSoFar: 0, minimum: 45.22e6, target: 48e6});
  assert.equal(d.action, 'counter');
  assert.equal(d.upfront, 40.25e6);
});

test("the GM's answer after Negotiate Offer", async () => {
  const {verdict} = await import('../game/screens/transfer-offers.mjs');
  const fake = {items: [{kind: 'button', label: 'Phil Giles General Manager Aston Villa feel the negotiation for Ben Gannon Doak is acceptable.'}]};
  assert.equal(verdict(fake), 'Aston Villa feel the negotiation for Ben Gannon Doak is acceptable.');
  assert.equal(verdict(s), null);
});
