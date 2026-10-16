import test from 'node:test';
import assert from 'node:assert/strict';
import {paidFor} from './paid.mjs';

test('what we paid: the last completed buy (agreed round, release clause, accepted demands)', () => {
  const log = [
    {action: 'buy', name: 'Hamza Güreler', outcome: 'agreed', history: [{round: 1, offered: 17e6, state: 'accepted', upfront: 17e6}]},
    {action: 'buy', name: 'Kayhan Sayman', outcome: 'release-clause', fee: 1.7e6},
    {action: 'buy', name: 'Peyton Miller', outcome: 'unwilling'},
  ];
  assert.equal(paidFor('Hamza Gureler', log), 17e6);
  assert.equal(paidFor('Kayhan Sayman', log), 1.7e6);
  assert.equal(paidFor('Peyton Miller', log), null);
});
