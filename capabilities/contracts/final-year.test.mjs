// The final-year matrix on summer 2032's cases (user, 2032-07-02).
import test from 'node:test';
import assert from 'node:assert/strict';
import {decideFinalYear} from './final-year.mjs';
import {loadPolicy} from '../sell/decide.mjs';

const pol = loadPolicy().contracts, cfg = {finalYear: pol.final_year, renewal: pol.renewal};
const savinho = {name: 'Savinho', age: 28, value: 76.8e6, wage: 180000, minutes: 2657, starts: true, role_score: 15.6, replacement: null};

test('no contract → release; a cheap fringe player runs down', () => {
  assert.equal(decideFinalYear({no_contract: true}, cfg).action, 'release');
  assert.equal(decideFinalYear({age: 21, value: 0.5e6, minutes: 129, starts: false}, cfg).action, 'run-down');
});
test('replaceable for much less → sell (Kislyak: Marco Company 15.3 vs 14.6, £10.3M)', () => {
  const d = decideFinalYear({name: 'Matvey Kislyak', age: 26, value: 32.1e6, wage: 79860, minutes: 2144, starts: true, role_score: 14.6,
    replacement: {name: 'Marco Company', club: 'Capitolini Celesti', age: 23, value: 10.3e6, role_score: 15.3}}, cfg);
  assert.equal(d.action, 'sell'); assert.equal(d.replacement.name, 'Marco Company');
});
test('30+ and not starting → sell (Torrente)', () => {
  assert.equal(decideFinalYear({age: 30, value: 8.9e6, wage: 26500, minutes: 408, starts: false, replacement: null}, cfg).action, 'sell');
});
test('worth keeping → ask his demands; then the renewal test decides (Savinho)', () => {
  assert.equal(decideFinalYear(savinho, cfg).action, 'ask-demands');
  assert.equal(decideFinalYear(savinho, cfg, {salary: 210000, years: 4, loyaltyBonus: 3e6, agentFee: 1e6}).action, 'renew');
  assert.equal(decideFinalYear(savinho, cfg, {salary: 600000, years: 4, loyaltyBonus: 10e6, agentFee: 5e6}).action, 'sell');
});
