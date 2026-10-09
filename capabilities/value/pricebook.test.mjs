import test from 'node:test';
import assert from 'node:assert/strict';
import {lookup} from './pricebook.mjs';

const book = {players: {'kevin schade': {name: 'Kevin Schade', minimum: 1}, 'matias fernandez-pardo': {name: 'Matías Fernández-Pardo', minimum: 2}}};
test('lookup by full name, short name, and without accents', () => {
  assert.equal(lookup('Kevin Schade', book).minimum, 1);
  assert.equal(lookup('Schade', book).minimum, 1);
  assert.equal(lookup('Matias Fernandez-Pardo', book).minimum, 2);
  assert.equal(lookup('Thiago', book), null);
});
