// The wage model (user, 2038-05-30, Holbem: a CA 151 backup was heading for £150K/wk as "Important Player").
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pickPromise} from '../capabilities/contracts/personal-terms.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const run = code => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8'}));

test('a backup gets 0.6x the league rate for his CA, capped; a starter the full rate; the floor beats a low target', () => {
  const d = run(`import json, wage_model as w
print(json.dumps([w.offer(122563, 'backup', 19385), w.offer(160000, 'backup', 20000), w.offer(232929, 'starter', 198451), w.offer(50000, 'third', 80000)]))`);
  assert.equal(d[0].offer, 73537); assert.equal(d[0].promise, 'Squad Player'); assert.equal(d[0].walk_away_above, 95598);
  assert.equal(d[1].offer, 90000, 'backup cap');
  assert.equal(d[2].offer, 232929); assert.equal(d[2].promise, 'Regular Starter');
  assert.equal(d[3].offer, 60000, 'his £80K x 1.1 floor is above the third cap: capped, with a note'); assert.ok(d[3].note);
});

test('the league rate is the median of players within 4 CA, widened until there are enough', () => {
  const d = run(`import json, wage_model as w
rows = [(150, 100000), (151, 120000), (152, 140000)] + [(170, 300000)] * 20
print(json.dumps([w.market_rate(rows, 151, within=4, min_peers=3), w.market_rate(rows, 151, within=4, min_peers=10)]))`);
  assert.deepEqual(d[0], [120000, 4, 3]);
  assert.equal(d[1][0], 300000, 'widened to 20 CA once the near peers are too few');
});

test('playing time is lowered to the role (Important Player → Squad Player), never raised', () => {
  const opts = ['Important Player', 'Regular Starter', 'Squad Player (Recommended)', 'Impact Sub'];
  assert.equal(pickPromise('Important Player', opts, 'Squad Player').to, 'Squad Player');
  assert.equal(pickPromise('Impact Sub', opts, 'Squad Player'), null, 'he asked less than the role: keep it');
  assert.equal(pickPromise('Star Player', ['Important Player', 'Regular Starter'], 'Squad Player').to, 'Regular Starter', 'nearest offered option');
});
