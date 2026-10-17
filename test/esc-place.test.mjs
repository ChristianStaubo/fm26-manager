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
