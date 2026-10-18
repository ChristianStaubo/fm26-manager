// Friction 2035-01-30: after a failed appeal FM offers our ESC work-permit slot (Ahmed Mohammed).
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {escPlace, escDecision} from '../game/screens/admin/handlers.mjs';

test('ESC place: matched; the slot goes to a depth-chart player or a wonderkid only', () => {
  assert.equal(escPlace.match(loadScreen('esc-place-mohammed')), true);
  assert.equal(escDecision({role: 'surplus', pa: 139}), 'keep');
  assert.equal(escDecision({role: 'backup', pa: 139}), 'allocate');
  assert.equal(escDecision({role: 'surplus', pa: 180}), 'allocate');
  assert.equal(escDecision({}), 'keep');
});

test('mid-season "Choose <Club> captain" (Savinho left, 2035-08-18) → holiday handler', async () => {
  const {chooseCaptain, HANDLERS} = await import('../game/screens/admin/handlers.mjs');
  const s = loadScreen('choose-captain-savinho-left');
  assert.equal(chooseCaptain.match(s), true);
  assert.equal(HANDLERS.filter(h => h.match(s))[0].name, 'choose-captain-holiday');
});

test('a staff-agreed loan confirmation ("Duarte set to move on loan to Preston") is matched by confirm-outgoing', async () => {
  const {HANDLERS} = await import('../game/screens/admin/handlers.mjs');
  const s = loadScreen('loan-confirm-duarte');
  assert.equal(HANDLERS.find(h => h.match(s))?.name, 'confirm-outgoing');
});

test('a loan confirmation with the youth-loan Delegate button (Taylor to Wolves, incident 2026-10-18T02-24-02) is confirm-outgoing', async () => {
  const {HANDLERS} = await import('../game/screens/admin/handlers.mjs');
  const s = loadScreen('confirm-outgoing-youth-delegate-taylor');
  assert.equal(HANDLERS.find(h => h.match(s))?.name, 'confirm-outgoing');
});
