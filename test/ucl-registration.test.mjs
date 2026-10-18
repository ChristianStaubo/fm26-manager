// Mapping session 2026-10-18 (incident 2026-10-18T02-31-01): the user registered the Champions League
// latter-stages squad by hand: Respond, Ask Assistant to Pick, Confirm, Confirm (21/25).
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {registrationHandler, onRegistration, onRegistrationPage, registrationList, registrationPlan} from '../game/screens/admin/registration.mjs';
import {HANDLERS} from '../capabilities/season/autopilot.mjs';

test('the "to register players for latter stages" message is squad registration', () => {
  const s = loadScreen('ucl-registration-message');
  assert.equal(registrationHandler.match(s), true);
  assert.equal(HANDLERS.find(h => h.match(s))?.name, 'squad-registration');
});

test('an empty registration list is the registration page (no "Squad selection is" line yet)', () => {
  const empty = loadScreen('ucl-registration-empty');
  assert.equal(onRegistration(empty), false);
  assert.equal(onRegistrationPage(empty), true);
  assert.equal(onRegistrationPage(loadScreen('ucl-registration-picked')), true);
});

test("after the assistant's pick our depth rule adds no one; an on-loan depth player's switch is disabled", () => {
  const s = loadScreen('ucl-registration-picked'), list = registrationList(s);
  assert.ok(list.length >= 20);
  const casado = list.find(p => p.name === 'Marc Casadó');
  assert.deepEqual([casado.registered, casado.enabled], [false, false]);
  const roles = Object.fromEntries(list.map(p => [p.name, ['X', p.name === 'Sebastian Ablaß' ? 'surplus' : 'backup']]));
  assert.deepEqual(registrationPlan(list, roles, 4), {add: [], drop: [], short: 0});
});
