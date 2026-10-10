import {test} from 'node:test';
import assert from 'node:assert/strict';
import {control} from '../capabilities/season/continue.mjs';

// 2028-06-23: FM sat in NewsAggregator with "News Site" in the Continue slot; control() waited
// forever (busy), and the autopilot looped on time-limit.
test('a lasting NewsAggregator state is a handoff, not busy', async () => {
  let t = 0;
  const state = {available: true, active: true, stateName: 'NewsAggregator', actionInFlight: false};
  const r = await control({}, {read: async () => state, act: async () => { throw Error('no act'); }, now: () => t, sleep: async ms => { t += ms; }});
  assert.equal(r.reason, 'handoff');
  assert.equal(r.stalled, 'NewsAggregator');
});
