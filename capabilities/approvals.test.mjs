import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {approve, revoke, find, gate, mode, hold, held} from './approvals.mjs';
import {loadPolicy} from './sell/decide.mjs';

const tmp = () => pathToFileURL(`${mkdtempSync(`${tmpdir()}/approvals-`)}/approvals.json`);
const policy = {autonomy: {buy: 'approve', sell: 'approve', incoming_offers: 'approve', season: 'auto'}};

test('buying and selling need approval in the shipped policy (user, 2026-10-14)', () => {
  const p = loadPolicy();
  for (const c of ['buy', 'sell', 'incoming_offers']) assert.equal(mode(c, p), 'approve');
  assert.equal(mode('season', p), 'auto');
  assert.equal(mode('something-new', p), 'approve', 'unknown capabilities default to approval');
});

test('no approval → stop with what to ask the user', () => {
  const file = tmp();
  assert.throws(() => gate('buy', 'buy', 'Marcus Edwards', {price: 20e6, policy, file}),
    e => e.details?.approval === 'missing' && /fm approve buy "Marcus Edwards" --max/.test(e.message));
});

test('buy: allowed up to the approved max, stops above it', () => {
  const file = tmp();
  approve('buy', 'Marcus Edwards', {max: 25e6, file});
  assert.equal(gate('buy', 'buy', 'marcus edwards', {price: 25e6, policy, file}).limit, 25e6);
  assert.equal(gate('buy', 'buy', 'Marcus Edwards', {policy, file}).limit, 25e6, 'no --max: the limit caps the default');
  assert.throws(() => gate('buy', 'buy', 'Marcus Edwards', {price: 26e6, policy, file}), e => e.details?.approval === 'outside-limit');
});

test('sell: allowed at or above the approved minimum, accents ignored', () => {
  const file = tmp();
  approve('sell', 'Nikola Katić', {min: 30e6, file});
  assert.ok(gate('incoming_offers', 'sell', 'Nikola Katic', {price: 31e6, policy, file}));
  assert.throws(() => gate('incoming_offers', 'sell', 'Nikola Katić', {price: 29e6, policy, file}), e => e.details?.limit === 30e6);
});

test('auto capabilities pass without approval; approvals can be replaced and revoked', () => {
  const file = tmp();
  assert.equal(gate('buy', 'buy', 'Anyone', {policy: {autonomy: {buy: 'auto'}}, file}), null);
  approve('buy', 'X', {max: 1e6, file}); approve('buy', 'X', {max: 2e6, file});
  assert.equal(find('buy', 'X', {file}).limit, 2e6);
  assert.equal(revoke('buy', 'X', {file}).revoked, 1);
  assert.equal(find('buy', 'X', {file}), null);
  assert.throws(() => approve('buy', 'Y', {file}), /needs --max/);
});

test('holds: the user is deciding a deal (Ortega); accents ignored; --off releases it', () => {
  const file = tmp();
  hold('Camilo Ortega', {file});
  assert.equal(held('camilo ortega', {file}), true);
  hold('Camilo Ortega', {off: true, file});
  assert.equal(held('Camilo Ortega', {file}), false);
});
