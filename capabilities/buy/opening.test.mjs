import test from 'node:test';
import assert from 'node:assert/strict';
import {openingBid, isPriority, inFinalYear} from './buy.mjs';

test('opening bids (user, 2035-06-18): priority = asking price; final year = 0.7x profile value; else 0.85x', () => {
  assert.equal(openingBid({valueRange: [45e6, 45e6], askingPrice: 45e6}, {priority: true}), 45e6, 'Wark');
  assert.equal(openingBid({valueRange: [12.5e6, 15e6], valueRangeProfile: [12.4e6, 12.4e6]}, {finalYear: true}), 8680000, 'Yılmaz: not the agent range');
  assert.equal(openingBid({valueRange: [10e6, 10e6]}), 8500000);
  assert.equal(isPriority({note: 'wonderkid: ST 18, PA 189'}), true);
  assert.equal(isPriority({note: 'GK backup'}), false);
  assert.equal(inFinalYear('£60K p/w 6/30/2036', '2035-07-03'), true);
  assert.equal(inFinalYear('£79K p/w 6/30/2040', '2035-07-03'), false);
});

test('rebids: queued today, due the next game day, placed once', async () => {
  process.env.FM_REBIDS = `/tmp/rebids-test-${process.pid}.json`;
  const r = await import('./rebids.mjs?t=' + Date.now());
  r.add({name: 'Konner Wark', club: 'Fulham', open: 45e6, max: 60e6, after: '2035-06-18'});
  assert.deepEqual(r.takeDue('2035-06-18'), []);
  assert.equal(r.takeDue('2035-06-19')[0].name, 'Konner Wark');
  assert.deepEqual(r.takeDue('2035-06-20'), []);
});
