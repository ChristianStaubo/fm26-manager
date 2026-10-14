// The shape we play (user, 2026-10-14: a 5-2-3, not the 4-2-3-1): the window report must follow
// config/tactic.json: three CB slots + one spare, wing-backs, no AM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
test('tactic.json is the back five, and fm window takes its slots from it', () => {
  const t = JSON.parse(readFileSync(`${ROOT}config/tactic.json`, 'utf8'));
  assert.deepEqual(t.slots.map(s => s.slot), ['GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LDM', 'RDM', 'LW', 'RW', 'ST']);
  const shape = JSON.parse(execFileSync('python3', ['-c', `import json, window as w\nt = json.load(open('../config/tactic.json'))\nprint(json.dumps({k: v[4] for k, v in w.shape(t).items()}))`], {cwd: `${ROOT}analysis`, encoding: 'utf8'}));
  assert.equal(shape.CB, 4); assert.equal(shape.AM, undefined); assert.equal(shape.DM, 3);
});
