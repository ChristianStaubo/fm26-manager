import test from 'node:test';
import assert from 'node:assert/strict';
import {offerState} from './buy.mjs';
import {Screen} from '../../ui/screen.mjs';

// Minimal offer screen: a General Manager line (button) and optional Suggest Terms / Accept Demands.
const screen = (gm, buttons = []) => new Screen({nodes: [
  {id: 0, parent: null, visible: true, bounds: [0, 0, 1680, 1050]},
  {id: 1, parent: 0, visible: true, button: true, enabled: true, label: `Phil Giles General Manager ${gm}`, bounds: [1200, 100, 400, 60]},
  ...buttons.map((label, k) => ({id: 2 + k, parent: 0, visible: true, button: true, enabled: true, label, bounds: [1200, 400 + k * 40, 200, 32]})),
]});

test('a stale counter line with Suggest Terms on screen is our pending edit (Ribeiro pre-filled, 2026-07-13)', () => {
  assert.equal(offerState(screen('LOSC have negotiated the offer for Alexsandro Ribeiro.', ['Suggest Terms', 'Make Offer'])).state, 'editing');
});
test('a counter without Suggest Terms is a counter; an offer made always wins', () => {
  assert.equal(offerState(screen('LOSC have negotiated the offer for X.', ['Accept Demands', 'Withdraw Offer'])).state, 'countered');
  assert.equal(offerState(screen('An offer has been made for X.', ['Suggest Terms'])).state, 'made');
});
