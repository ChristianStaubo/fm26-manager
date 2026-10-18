import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {traceLine, resetStatus, OFF} from '../telemetry/trace.mjs';
import {prune} from '../telemetry/retention.mjs';
import {traceStats, loopStats} from '../telemetry/stats.mjs';
import {resolve} from '../cli/friction.mjs';

test('tests never write telemetry', () => assert.equal(OFF, true));

test('a trace line keeps the call, its target, its cost and the first line of an error', () => {
  const at = new Date('2026-10-18T10:00:00Z');
  const ui = traceLine({op: 'ui', action: 'click', expectedName: 'CancelButton', expectedLabel: 'Cancel', snapshot: 's1', id: 4}, 12,
    {error: new Error('Element is occluded (by DarkeningBG)\n    at resolveTarget')}, at);
  assert.deepEqual({op: ui.op, action: ui.action, target: ui.target, ms: ui.ms, error: ui.error},
    {op: 'ui', action: 'click', target: 'CancelButton | Cancel', ms: 12, error: 'Element is occluded (by DarkeningBG)'});
  const read = traceLine('uitree', 640, {result: {nodes: new Array(6000), elapsedMs: 520}}, at);
  assert.deepEqual([read.nodes, read.gameMs], [6000, 520]);
});

test('status polls are traced only when the state changes (holiday polls every 5 s)', () => {
  resetStatus();
  const st = name => traceLine('status', 3, {result: {stateName: name}});
  assert.ok(st('OnHoliday'));
  assert.equal(st('OnHoliday'), null);
  assert.equal(st('OnHoliday'), null);
  assert.equal(st('NeedAction').state, 'NeedAction');
});

test('retention gzips finished days, drops traces after 30 days, keeps the newest 50 incidents', () => {
  const root = mkdtempSync(join(tmpdir(), 'fm-telemetry-')), trace = join(root, 'trace'), inc = join(root, 'incidents');
  mkdirSync(trace); mkdirSync(inc);
  for (const d of ['2026-09-01', '2026-10-17', '2026-10-18']) writeFileSync(join(trace, `${d}.jsonl`), '{"op":"uitree"}\n');
  for (let i = 0; i < 53; i++) mkdirSync(join(inc, `2026-10-18T00-00-${String(i).padStart(2, '0')}`));
  const url = p => pathToFileURL(p + '/');
  const done = prune({now: new Date('2026-10-18T12:00:00Z'), traceDir: url(trace), incidentDir: url(inc)});
  assert.deepEqual(readdirSync(trace).sort(), ['2026-10-17.jsonl.gz', '2026-10-18.jsonl']);
  assert.equal(readdirSync(inc).length, 50);
  assert.ok(!existsSync(join(inc, '2026-10-18T00-00-00')), 'the oldest incidents go first');
  assert.deepEqual(done.gzipped, ['2026-10-17.jsonl']);
});

test('trace stats: time per command, split into screen reads and actions', () => {
  const l = (run, cmd, op, ms, extra = {}) => ({run, cmd, op, ms, ...extra});
  const s = traceStats([
    l('a', 'buy', 'uitree', 600, {gameMs: 500, nodes: 6000}), l('a', 'buy', 'uitree', 600, {gameMs: 500}),
    l('a', 'buy', 'ui', 30, {action: 'click'}), l('b', 'buy', 'uitree', 600), l('b', 'buy', 'ui', 20, {action: 'click', error: 'occluded'}),
  ]);
  assert.deepEqual(s.byCommand.buy, {runs: 2, calls: 5, seconds: 2, perRunSeconds: 0.9, reads: 3, readShare: 0.97, msPerRead: 600, gameMsPerRead: 333, actions: 2, errors: 1});
  assert.equal(s.byCall['ui:click'].calls, 2);
});

test('loop stats: game days per stop, and friction by cause with repeats', () => {
  const j = [
    {at: '2026-10-18T01:00:00Z', argv: ['cycle'], reason: 'checkpoint', gameFrom: '2035-08-18', gameTo: '2035-09-02'},
    {at: '2026-10-18T02:00:00Z', argv: ['cycle'], reason: 'needs-analyst', gameFrom: '2035-09-02', gameTo: '2035-09-12'},
    {at: '2026-10-18T03:00:00Z', argv: ['screen'], gameFrom: '2035-09-12', gameTo: '2035-09-12'},
  ];
  const s = loopStats(j, [{status: 'resolved', cause: 'timing', id: 'x'}, {status: 'resolved', cause: 'timing', id: 'y', repeatOf: 'x'}, {status: 'open'}]);
  assert.deepEqual(s.byDay['2026-10-18'], {drives: 2, stops: 1, gameDays: 25, reasons: {'needs-analyst': 1}, gameDaysPerStop: 25});
  assert.deepEqual(s.frictionByCause, {timing: 2});
  assert.deepEqual(s.repeats, [{id: 'y', repeatOf: 'x', cause: 'timing'}]);
  assert.equal(s.open, 1);
});

test('resolving friction needs a cause', async () => {
  await assert.rejects(resolve('2026-10-18T01-08-23', 'fixed'), /--cause/);
  await assert.rejects(resolve('2026-10-18T01-08-23', 'fixed', {cause: 'vibes'}), /--cause/);
});

test('the bridge black box: trims like the fixtures, stores a screen once per change, dumps gzip', () => {
  const py = `
import sys, json, gzip, base64
sys.path.insert(0, 'game/bridge')
from blackbox import BlackBox, trim, screen_key
tree = json.loads(gzip.decompress(open('test/screens/choose-captain-savinho-left.json.gz', 'rb').read()))
box = BlackBox(screens=3)
for _ in range(3): box.request({'op': 'uitree'}, 500, tree)
box.request({'op': 'ui', 'action': 'click', 'expectedLabel': 'Confirm Captain'}, 20, None, Exception('Element is occluded\\n at x'))
for _ in range(3): box.request({'op': 'status'}, 2, {'stateName': 'NeedAction'})
other = dict(tree, nodes=tree['nodes'][:-1])
box.request({'op': 'uitree'}, 500, other)
d = box.dump()
back = json.loads(gzip.decompress(base64.b64decode(d['screens'][0]['gz'])))
print(json.dumps({'screens': len(d['screens']), 'seen': d['screens'][0]['seen'], 'events': [e['op'] for e in d['events']],
  'error': d['events'][3].get('error'), 'same': len(back['nodes']) == len(trim(tree)['nodes']), 'stable': screen_key(tree) == screen_key(json.loads(json.dumps(tree)))}))`;
  const r = JSON.parse(execFileSync('python3', ['-c', py]).toString());
  assert.deepEqual(r, {screens: 2, seen: 3, events: ['uitree', 'uitree', 'uitree', 'ui', 'status', 'uitree'], error: 'Element is occluded', same: true, stable: true});
});
