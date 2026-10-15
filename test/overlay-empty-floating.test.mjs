import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overlays} from '../game/ui/overlays.mjs';

// 2031-05-28: an empty floating root lingered after a nav dropdown; every command stopped on
// "Could not clear overlays". Empty = nothing on top.
const screen = (floating, menu = false) => ({
  tree: {nodes: [{name: 'floating-element-root', visible: true, bounds: [0, 0, 10, 10]}, ...(menu ? [{type: 'EntryElement', visible: true, bounds: [0, 0, 5, 5]}] : [])]},
  floatingItems: () => floating, buttons: () => [], items: [], within: () => false,
});

test('an empty floating root is not an overlay', () => assert.deepEqual(overlays(screen([])), []));
test('a dropdown list still is', () => assert.deepEqual(overlays(screen([{kind: 'button', label: 'x'}])), [{kind: 'popup', menu: false}]));
