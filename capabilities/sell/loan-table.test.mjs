// The loan decision table, cell by cell (user, 2033-08-17 and 2033-09-01).
import test from 'node:test';
import assert from 'node:assert/strict';
import {decideLoanOffer as d, playerType} from './loan-table.mjs';

test('player type: a starter is first-team; <=21, or <=23 with PA >= 160, is a prospect; else senior', () => {
  assert.equal(playerType({role: 'starter', age: 20, pa: 170}), 'first-team');
  assert.equal(playerType({role: 'surplus', age: 21, pa: 120}), 'prospect');
  assert.equal(playerType({role: 'surplus', age: 22, pa: 169}), 'prospect');
  assert.equal(playerType({role: 'third', age: 23, pa: 150}), 'senior');
  assert.equal(playerType(null, {age: 19}), 'prospect');
});

test('listed prospect: starting at 50%+; without a start promise 75%+', () => {
  assert.equal(d({type: 'prospect', listed: true, playingTime: 'Important Player', wageShare: 0.5}).action, 'accept');
  assert.equal(d({type: 'prospect', listed: true, playingTime: 'Squad Player', wageShare: 0.6}).action, 'reject');
  assert.equal(d({type: 'prospect', listed: true, playingTime: 'Squad Player', wageShare: 0.8}).action, 'accept');
});

test('not listed prospect: money AND a role (starts and 75%+)', () => {
  assert.equal(d({type: 'prospect', listed: false, playingTime: 'Regular Starter', wageShare: 0.8}).action, 'accept');
  assert.equal(d({type: 'prospect', listed: false, playingTime: 'Important Player', wageShare: 0.5}).action, 'reject', 'Đukić to Köln');
  assert.equal(d({type: 'prospect', listed: false, playingTime: 'Squad Player', wageShare: 1}).action, 'reject');
});

test('listed senior: only at a profit (fees + share >= 100% of his wage); not listed senior: reject', () => {
  assert.equal(d({type: 'senior', listed: true, wageShare: 0, fees: 1.6e6, wageCost: 0.56e6}).action, 'accept', 'Sayman: £1.6M fee');
  assert.equal(d({type: 'senior', listed: true, wageShare: 0.8, fees: 0, wageCost: 1e6}).action, 'reject', '80% is not a profit');
  assert.equal(d({type: 'senior', listed: false, wageShare: 1, fees: 5e6, wageCost: 1e6}).action, 'reject', 'Lemaitre to AZ');
});

test('first-team: always reject', () => {
  assert.equal(d({type: 'first-team', listed: true, playingTime: 'Star Player', wageShare: 1}).action, 'reject');
  assert.equal(d({type: 'first-team', listed: false, wageShare: 1}).action, 'reject');
});

test('a prospect is never loaned with an option to buy (user, 2034-08)', () => {
  assert.equal(d({type: 'prospect', listed: true, playingTime: 'Regular Starter', wageShare: 1, optionFee: 8e6}).action, 'reject');
  assert.equal(d({type: 'prospect', listed: true, playingTime: 'Regular Starter', wageShare: 1}).action, 'accept');
});
