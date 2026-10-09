import test from 'node:test';
import assert from 'node:assert/strict';
import {windowEnd} from './season.mjs';

const W = [{opens: '06-16', closes: '09-01'}, {opens: '01-01', closes: '02-02'}];
const d = s => new Date(`${s}T00:00:00Z`), end = s => windowEnd(d(s), W).toISOString().slice(0, 10);

test('before the summer window opens, run until it closes (pre-window deals complete on 16 Jun)', () => {
  assert.equal(end('2026-06-11'), '2026-09-01');   // friction 2026-10-08T00-26-22
});
test('inside a window: its own close date', () => {
  assert.equal(end('2026-08-31'), '2026-09-01');
  assert.equal(end('2027-01-15'), '2027-02-02');
});
test('after the summer window: the January window', () => {
  assert.equal(end('2026-09-02'), '2027-02-02');
});
