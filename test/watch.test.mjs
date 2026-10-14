import test from 'node:test';
import assert from 'node:assert/strict';
import {diff} from '../cli/watch.mjs';

const scr = items => ({items});
test('fm watch diff: a changed salary, an added dialog button, a removed warning', () => {
  const a = scr([{kind: 'button', label: '£73,000 p/w', bounds: [1100, 203, 180, 32]}, {kind: 'text', label: "Exceeds board's max allowance", bounds: [482, 269, 186, 18]}]);
  const b = scr([{kind: 'button', label: '£70,000 p/w', bounds: [1100, 203, 180, 32]}, {kind: 'button', label: 'Yes', bounds: [900, 600, 80, 32]}]);
  const d = diff(a, b);
  assert.equal(d.changed[0].to.label, '£70,000 p/w');
  assert.equal(d.added[0].label, 'Yes');
  assert.match(d.removed[0].label, /Exceeds/);
});
