import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HANDLERS} from '../game/screens/admin/handlers.mjs';

// The pre-season camp message (2031-06-30), as the autopilot stopped on it.
const TEXTS = ['Phil Giles', 'Brentford training camp squad', 'Now', 'You have been asked to name a preliminary squad for the pre-season training camp in Dalian, China.'];
const BUTTONS = ['Respond', 'Auto Select', 'Auto Select - include youth prospects'].map(label => ({label}));
const screen = {
  texts: () => TEXTS, date: () => new Date(Date.UTC(2031, 5, 30)),
  hasText: m => TEXTS.some(t => (m instanceof RegExp ? m.test(t) : t === m)),
  buttons: m => BUTTONS.filter(b => m === undefined || (m instanceof RegExp ? m.test(b.label) : b.label === m)),
};

test('training camp squad: the staff pick it (Auto Select)', async () => {
  const h = HANDLERS.filter(x => x.match(screen));
  assert.deepEqual(h.map(x => x.name), ['training-camp-squad']);
  assert.equal((await h[0].run(screen, {dryRun: true})).detail, 'staff pick the training camp squad');
});
