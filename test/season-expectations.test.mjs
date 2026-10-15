import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HANDLERS} from '../game/screens/admin/handlers.mjs';

// The mid-season board offer (2031-01-01), as read off the screen.
const TEXTS = ['Joe Spencer', 'Change Season Expectations', 'Due to your performance in the league we would like to offer you the opportunity to change your season expectations. Please note, however, that you will be judged on any changes you make going forward'];
const BUTTONS = [
  {label: 'Qualify for the UEFA Europa League through the league', bounds: [541, 523, 394, 32]},
  {label: 'Top half finish', bounds: [541, 480, 394, 32]},
  {label: 'Qualify for the UEFA Champions League through the league', bounds: [541, 565, 396, 32]},
  {label: 'Confirm', bounds: [532, 875, 66, 32]},
];
const screen = {
  texts: () => TEXTS, date: () => new Date(Date.UTC(2031, 0, 1)),
  hasText: m => TEXTS.some(t => (m instanceof RegExp ? m.test(t) : t === m)),
  buttons: m => BUTTONS.filter(b => m === undefined || (m instanceof RegExp ? m.test(b.label) : b.label === m)),
};

test('mid-season expectations offer: keep the least ambitious target', async () => {
  const h = HANDLERS.filter(x => x.match(screen));
  assert.deepEqual(h.map(x => x.name), ['change-season-expectations']);
  const r = await h[0].run(screen, {dryRun: true});
  assert.equal(r.kept, 'Top half finish');
});
