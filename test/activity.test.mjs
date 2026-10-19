// Transfer Activity in one pass (user, 2026-10-19): every offer row read from the tab itself, and acted on
// with the row's buttons (reject Arsenal for Rosete, Hoffenheim for Đukić, Schalke for Awudu; accept
// Leipzig for Awudu: 6-10 s each, against 7-13 s just to read one offer before).
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {offerRows} from '../game/screens/activity.mjs';

test('a loan offer row reads club, wage share, playing time and the live buttons', () => {
  const [r] = offerRows(loadScreen('activity-loan-slatina'));
  assert.equal(r.club, 'Parthenope');
  assert.equal(r.kind, 'loan');
  assert.equal(r.status, 'Offer Made');
  assert.equal(r.wageShare, 1);
  assert.equal(r.playingTime, 'Important Player');
  assert.deepEqual(r.actions, {accept: true, stall: true, reject: true});
});
