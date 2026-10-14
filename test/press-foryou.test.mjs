// Friction 2026-10-14T22-43-51: Portal opened the "For You" news page (ForYouHeader over the inbox);
// the press handler must go through the Messages tab, not click under the banner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {locate} from '../game/screens/admin/press.mjs';

test('For You page: no message listed, the Messages tab is there to open', () => {
  const l = locate(loadScreen('press-foryou-header'));
  assert.equal(l.message, null);
  assert.equal(l.messagesTab, true);
});
