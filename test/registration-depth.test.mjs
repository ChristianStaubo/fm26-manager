// User, 2035-08-05: Ask Assistant to Pick, then check the depth chart is registered (the assistant left
// out Boem, Wark, Angulo with 5 places free), then Confirm.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationPlan} from '../game/screens/admin/registration.mjs';

const p = (name, registered, age = 25, enabled = true) => ({name, registered, age, enabled});
const roles = {Boem: ['ST', 'starter'], Wark: ['LW', 'starter'], Angulo: ['CB', 'starter'], Gray: ['ST', 'backup'], Rosete: ['DM', 'starter'], Ketu: ['DM', 'surplus'], Savinho: ['RW', 'backup']};

test('registers the depth players the assistant left out; under-21s need no place', () => {
  const list = [p('Boem', false), p('Wark', false), p('Angulo', false), p('Gray', true), p('Rosete', false, 20), p('Ketu', true)];
  assert.deepEqual(registrationPlan(list, roles, 5), {add: ['Boem', 'Wark', 'Angulo'], drop: [], short: 0});
});

test('no room: drop players we are selling first, then ones with no depth role', () => {
  const list = [p('Boem', false), p('Wark', false), p('Ketu', true), p('Savinho', true)];
  const r = registrationPlan(list, roles, 0, n => n === 'Savinho');
  assert.deepEqual(r, {add: ['Boem', 'Wark'], drop: ['Savinho', 'Ketu'], short: 0});
  assert.equal(registrationPlan([p('Boem', false)], roles, 0).short, 1, 'nobody to drop: stop for the user');
});
