// The deal state machine, replayed on what happened in January 2032.
import test from 'node:test';
import assert from 'node:assert/strict';
import {reduce, resolve, splitLabel, stageState, canMove} from './deals.mjs';

test('Transfer Activity labels: player + stage, or a bare stage', () => {
  assert.deepEqual(splitLabel('Kellen Fisher Contract'), {player: 'Kellen Fisher', stage: 'Contract'});
  assert.deepEqual(splitLabel('Ben Gannon Doak 2 Offers'), {player: 'Ben Gannon Doak', stage: '2 Offers'});
  assert.deepEqual(splitLabel('Simen Harper Contract Rejected'), {player: 'Simen Harper', stage: 'Contract Rejected'});
  assert.deepEqual(splitLabel('Contract'), {player: null, stage: 'Contract'});
  assert.equal(stageState('Offer Made £27.5M (£39.5M)'), 'offer');
  assert.equal(stageState('Work Permit'), 'work-permit');
});

test('wonderkids: a fee agreed, then stuck at contract talks → stop after 3 days', () => {
  let {deals} = reduce({}, {date: '2032-01-01', events: [{player: 'Pius Collins', dir: 'in', state: 'fee-agreed'}]});
  ({deals} = reduce(deals, {date: '2032-01-02', rows: [{player: 'Pius Collins', stage: 'Contract'}]}));
  const r = reduce(deals, {date: '2032-01-06', rows: [{player: 'Pius Collins', stage: 'Contract'}]});
  assert.ok(r.alerts.some(a => a.kind === 'stuck' && a.player === 'Pius Collins' && a.stop));
});

test('wonderkids: a fee agreed, then gone from Transfer Activity → vanished, stop', () => {
  const {deals} = reduce({}, {date: '2032-01-01', events: [{player: 'Emre Schmitt', dir: 'in', state: 'fee-agreed'}]});
  const r = reduce(deals, {date: '2032-01-03', rows: []});
  assert.deepEqual(r.alerts.map(a => [a.kind, a.player, a.stop]), [['vanished', 'Emre Schmitt', true]]);
  assert.equal(resolve(r.deals, 'Emre Schmitt', false, '2032-01-03')['emre schmitt'].state, 'collapsed');
});

test('Fisher: offer → contract → work permit → confirmation → off the list = completed, no alerts', () => {
  let s = {}, alerts = [];
  for (const [date, stage] of [['2032-01-29', 'Offer Made'], ['2032-01-31', 'Contract'], ['2032-02-01', 'Work Permit'], ['2032-02-02', 'Confirmation']]) {
    const r = reduce(s, {date, rows: [{player: 'Kellen Fisher', stage, dir: 'in'}]}); s = r.deals; alerts.push(...r.alerts);
  }
  const r = reduce(s, {date: '2032-02-03', rows: []});
  assert.equal(r.deals['kellen fisher'].state, 'completed');
  assert.deepEqual([...alerts, ...r.alerts], []);
});

test('an impossible move is an unknown transition (stop); unnamed rows are reported', () => {
  assert.equal(canMove('completed', 'offer'), false);
  const {deals} = reduce({}, {date: '2032-01-29', rows: [{player: 'Michael Kayode', stage: 'Confirmation'}]});
  deals['michael kayode'].state = 'completed';
  const r = reduce(deals, {date: '2032-01-30', rows: [{player: 'Michael Kayode', stage: 'Offer Made'}, {player: null, stage: 'Contract'}]});
  assert.ok(r.alerts.some(a => a.kind === 'unknown-transition' && a.stop));
  assert.ok(r.alerts.some(a => a.kind === 'unnamed-deal'));
});

test('our own actions become deal events (fee agreed, bid accepted, counter accepted)', async () => {
  const {events} = await import('./store.mjs');
  const ev = events([
    {at: '2026-10-16T00:20:00Z', action: 'buy', name: 'Pius Collins', outcome: 'agreed'},
    {at: '2026-10-16T00:21:00Z', action: 'buy', name: 'Kenan Zukic', outcome: 'cannot-sign'},
    {at: '2026-10-16T00:22:00Z', action: 'incoming-offer', executed: true, offer: {player: 'Hamza Güreler'}, decision: {action: 'counter'}, accepted: true},
  ], '2026-10-16T00:00:00Z');
  assert.deepEqual(ev, [{player: 'Pius Collins', dir: 'in', state: 'fee-agreed'}, {player: 'Hamza Güreler', dir: 'out', state: 'contract'}]);
});

test('a fee agreed, then the formal offer shows as Offer Made: allowed (Collins, Luna, 2032-06-16)', () => {
  const {deals} = reduce({}, {date: '2032-06-16', events: [{player: 'Pius Collins', dir: 'in', state: 'fee-agreed'}]});
  const r = reduce(deals, {date: '2032-06-16', rows: [{player: 'Pius Collins', stage: 'Offer Made'}]});
  assert.deepEqual(r.alerts, []);
});
test('the first observation only takes this window\'s actions', async () => {
  const {events} = await import('./store.mjs');
  const ev = events([{action: 'buy', name: 'Satoshi Tanaka', outcome: 'agreed', date: '2028-06-27'}, {action: 'buy', name: 'Martín Luna', outcome: 'release-clause', date: '2032-06-16'}], null, {fromDate: '2032-05-02'});
  assert.deepEqual(ev.map(e => e.player), ['Martín Luna']);
});
