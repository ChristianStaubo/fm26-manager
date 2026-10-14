import test from 'node:test';
import assert from 'node:assert/strict';
import {sameName, fold} from '../game/ui/navigate.mjs';

test('search names: accents and word order (Zukic/Žukić, Fujikawa Kenta), clubs accent-free', () => {
  assert.equal(sameName('Kenan Žukić', 'Kenan Zukic'), true);
  assert.equal(sameName('Fujikawa Kenta', 'Kenta Fujikawa'), true);
  assert.equal(sameName('Sebastian Ablaß', 'Sebastian Ablass'), true);
  assert.equal(sameName('Kenan Zukic', 'Kenan Zukić Jr'), false);
  assert.equal(fold('FK Budućnost Podgorica').includes(fold('Budućnost')), true);
});
