import test from 'node:test';
import assert from 'node:assert/strict';
import {unapprovedAction, handleUnapproved} from './unapproved.mjs';

const find = (k, p) => (p === 'Harry Gray' ? {kind: 'buy', player: p} : null);

test('an unapproved signing stuck → withdraw; vanished → ignore; approved or a sale → keep the alert', () => {
  assert.equal(unapprovedAction({kind: 'stuck', player: 'Dodzi Koumeyi', dir: 'in'}, find), 'withdraw');
  assert.equal(unapprovedAction({kind: 'stuck', player: 'Dodzi Koumeyi', dir: null}, find), 'withdraw');
  assert.equal(unapprovedAction({kind: 'vanished', player: 'Dodzi Koumeyi', dir: 'in'}, find), 'ignore');
  assert.equal(unapprovedAction({kind: 'stuck', player: 'Harry Gray', dir: 'in'}, find), null);
  assert.equal(unapprovedAction({kind: 'stuck', player: 'Didi', dir: 'out'}, find), null);
});

test('handleUnapproved withdraws and clears the stop; a failed withdraw keeps it', async () => {
  const alerts = [{kind: 'stuck', player: 'Dodzi Koumeyi', dir: null, stop: true}, {kind: 'stuck', player: 'X', dir: 'in', stop: true}, {kind: 'stuck', player: 'Harry Gray', dir: 'in', stop: true}];
  const withdraw = async (name) => { if (name === 'X') throw new Error('no dialog'); return {action: 'withdraw-offer', name}; };
  const r = await handleUnapproved(alerts, {find, withdraw, clubOf: async () => 'FC Bayern München'});
  assert.deepEqual(alerts.map(a => a.stop), [false, true, true]);
  assert.equal(r.length, 2);
});
