// "Transfer arranged / Joining Brentford on 7/1/2036" on Alexandre Luiz's profile (2036-06-04): the agent
// couldn't see the agreed pre-contract and set out to re-offer (user, 2026-10-19).
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {profileFacts} from '../game/ui/navigate.mjs';

test('a profile with a transfer arranged reads the club and date', () => {
  const f = profileFacts(loadScreen('profile-transfer-arranged'));
  assert.deepEqual(f.arranged, {club: 'Brentford', date: '2036-07-01'});
  assert.equal(f.wage, 6000);
});

test('the profile gives the contract end date (for the approval facts check)', () => {
  assert.equal(profileFacts(loadScreen('profile-transfer-arranged')).contractEnds, '2036-06-30');
});
