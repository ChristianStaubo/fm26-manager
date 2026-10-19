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

test('a price within the approval tolerance is within the limit (user, 2026-10-19: Pepper cancelled over £30K)', async () => {
  const {tolerance} = await import('./approvals.mjs');
  const file = tmp();
  approve('buy', 'Udo Pepper', {max: 11.47e6, file});
  assert.equal(tolerance(11.47e6, policy), 250000, 'at least one £0.25M fee step');
  assert.equal(tolerance(80e6, policy), 1.6e6, '2% of a big fee');
  assert.ok(gate('buy', 'buy', 'Udo Pepper', {price: 11.5e6, policy, file}), '£30K over: fine');
  assert.throws(() => gate('buy', 'buy', 'Udo Pepper', {price: 12e6, policy, file}), e => e.details?.approval === 'outside-limit');
  approve('sell', 'Harry Gray', {min: 51.4e6, file});
  assert.ok(gate('incoming_offers', 'sell', 'Harry Gray', {price: 51e6, policy, file}), '£400K under a £51.4M minimum: within 2%');
});

test('an approval keeps the facts it rests on; a later contract on his profile means they changed (Jiménez, 2036-07)', async () => {
  const {factsChanged} = await import('./approvals.mjs');
  const file = tmp();
  const a = approve('buy', 'Cristian Jiménez', {max: 1e6, facts: {club: 'R. Madrid', until: '2036-06-30', value: 2e5}, file});
  assert.deepEqual(a.facts, {club: 'R. Madrid', until: '2036-06-30', value: 2e5});
  assert.match(factsChanged(a, {contract: '£46.6K p/w 6/30/2041', contractEnds: '2041-06-30'}), /new contract since/);
  assert.equal(factsChanged(a, {contract: '£9K p/w 6/30/2036', contractEnds: '2036-06-30'}), null, 'same contract: go ahead');
  assert.equal(factsChanged({kind: 'buy', limit: 1}, {contractEnds: '2041-06-30'}), null, 'older approvals without facts: no check');
});
