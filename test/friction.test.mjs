import test from 'node:test';
import assert from 'node:assert/strict';
import {trimTree} from '../cli/friction.mjs';
import {Screen} from '../game/ui/screen.mjs';

const node = (id, parent, extra = {}) => ({id, parent, name: '', type: 'VisualElement', visible: true, enabled: true, bounds: [0, 0, 100, 20], ...extra});
const tree = {snapshot: 1, nodes: [
  node(0, null, {bounds: [0, 0, 1680, 1050]}),
  node(1, 0, {visible: false}),                       // hidden container…
  node(2, 1, {button: true, label: 'Continue'}),       // …whose visible child must keep it
  node(3, 0, {visible: false, text: 'hidden'}),        // hidden leaf: dropped
  node(4, 0, {text: 'Inbox'}),
]};

test('trimTree keeps visible nodes and their ancestors only', () => {
  assert.deepEqual(trimTree(tree).nodes.map(n => n.id), [0, 1, 2, 4]);
});
test('a trimmed tree reads as the same screen', () => {
  assert.deepEqual(new Screen(trimTree(tree)).items, new Screen(tree).items);
});
