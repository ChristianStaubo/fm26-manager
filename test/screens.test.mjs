// Recorded screens (test/screens/*.json.gz, from friction reports) and what must recognise them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {HANDLERS} from '../tasks/progression/autopilot.mjs';

const handlerFor = s => HANDLERS.filter(h => h.match(s)).map(h => h.name);

test('Confirm Transfer (signing agreed, before the window opens) → delegate finalizing', () => {
  const s = loadScreen('confirm-transfer-lopez');
  assert.equal(s.continueLabel(), 'Confirm Transfer');
  assert.deepEqual(handlerFor(s), ['delegate-finalizing']);
});
