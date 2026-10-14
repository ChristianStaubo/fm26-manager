// Racing Santander's counter for Gaitán (2030-07-14) added "Percentage Of Profit From Next Sale" 40%
// and a loan-back: fm buy must find the sell-on row and its remove button (user: remove sell-ons).
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {sellOnRow, offerState} from '../capabilities/buy/buy.mjs';

test('sell-on clause row: label, 40%, and the remove button on its line', () => {
  const s = loadScreen('offer-sell-on-gaitan');
  const row = sellOnRow(s);
  assert.equal(row.label, 'Percentage Of Profit From Next Sale');
  assert.equal(row.pct, '40%');
  assert.equal(row.remove.name, 'buttons-controls-pc-default');
  assert.ok(Math.abs(row.remove.bounds[1] - s.items.find(i => i.label === '40%').bounds[1]) < 20, 'same line as its value, not the loan-back row');
  assert.equal(offerState(s).state, 'countered');
});

test('release clause: read from the offer screen, and every extra found (appearance add-on, loan back, sell-on)', async () => {
  const {releaseClause, clauseRows} = await import('../capabilities/buy/buy.mjs');
  const s = loadScreen('offer-sell-on-gaitan');
  assert.equal(releaseClause(s), 12750000);
  assert.equal(clauseRows(s).length, 3);
});
