// Lemaitre's work permit was rejected (2030-07-18): the autopilot had no handler and stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {workPermitRejected} from '../game/screens/admin/handlers.mjs';

test('work permit rejected: matched, player and £5K cost read; the policy decides (ask = stop)', async () => {
  const s = loadScreen('work-permit-rejected');
  assert.equal(workPermitRejected.match(s), true);
  await assert.rejects(workPermitRejected.run(s, {dryRun: true}), e => e.details?.player === 'Lemaitre' && e.details?.cost === 5000);
});
