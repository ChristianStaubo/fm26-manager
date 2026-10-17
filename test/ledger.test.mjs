// The scoreboard from the game (audit 2033-08 G1): the club page's Transfer History and Finances tiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {readClubTiles, positionOf} from '../capabilities/ledger/ledger.mjs';

test('club page tiles → season transfer totals, balance and wages (2033-09-01)', () => {
  const s = loadScreen('club-overview-2033-09');
  const r = readClubTiles(s.items.map(i => i.label || ''));
  assert.deepEqual(r, {season: '2033/34', in: 136e6, inPlayers: 6, out: 181e6, outPlayers: 9, balance: 252787937, wages: 2649518, wageBudget: 2814586});
});

test('league position from a standings row', () => {
  assert.equal(positionOf(['Pos', '3 Brentford 38 23 6 9 26 75', '4 Chelsea 38 22 5 11 20 71'], 'Brentford'), 3);
  assert.equal(positionOf(['Pos'], 'Brentford'), null);
});
