import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {allResultsRow, clubLike} from '../game/ui/navigate.mjs';

// Ângelo (2031-05-28): 222 results, not in the search dropdown; the user opened "See All Results".
test('Search Results page: find Ângelo of Hamburger SV by name and club', () => {
  const s = loadScreen('search-all-results-angelo');
  const hit = allResultsRow(s, 'Ângelo', 'Hamburger Sport-Verein');
  assert.ok(hit, 'row found');
  assert.equal(hit.name, 'NameButton');
  assert.ok(Math.abs(hit.bounds[1] - 562) < 5, 'his row, not Angelo Surace above');
  assert.equal(allResultsRow(s, 'Ângelo', 'Arsenal'), null);
});
test('club names: export vs game', () => {
  assert.ok(clubLike('Hamburger SV', 'Hamburger Sport-Verein'));
  assert.ok(clubLike('LOSC', 'LOSC Lille'));
  assert.ok(!clubLike('Hamburger SV', 'Hertha BSC'));
});
