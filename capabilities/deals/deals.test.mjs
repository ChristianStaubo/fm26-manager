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
  assert.equal(canMove('confirmation', 'offer'), false);
  const {deals} = reduce({}, {date: '2032-01-29', rows: [{player: 'Michael Kayode', stage: 'Confirmation'}]});
  deals['michael kayode'].state = 'confirmation';
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

test('an acknowledged stuck deal raises no alert until its date (Didi, 2032-06-21)', () => {
  const deals = {didi: {player: 'Didi', dir: 'in', state: 'contract', since: '2032-06-16', seen: '2032-06-16', history: [], ackUntil: '2032-06-25'}};
  assert.deepEqual(reduce(deals, {date: '2032-06-22', rows: [{player: 'Didi', stage: 'Contract'}]}).alerts, []);
  assert.ok(reduce(deals, {date: '2032-06-26', rows: [{player: 'Didi', stage: 'Contract'}]}).alerts.some(a => a.kind === 'stuck'));
});

test('a slow sale at contract (the buyer talking to our player) is reported, not a stop', () => {
  const deals = {'matvey kislyak': {player: 'Matvey Kislyak', dir: 'out', state: 'contract', since: '2032-07-02', seen: '2032-07-02', history: []}};
  const r = reduce(deals, {date: '2032-07-09', rows: [{player: 'Matvey Kislyak', stage: 'Contract'}]});
  assert.ok(r.alerts.some(a => a.kind === 'stuck' && !a.stop));
});

test('a vanished deal that comes back goes on, no alert (Miceli, Ingand, Ketu, 2032-07-12)', () => {
  const deals = {'edoardo miceli': {player: 'Edoardo Miceli', dir: 'out', state: 'vanished', since: '2032-07-10', seen: '2032-07-10', history: []}};
  const r = reduce(deals, {date: '2032-07-12', rows: [{player: 'Edoardo Miceli', stage: '2 Offers'}]});
  assert.deepEqual(r.alerts, []); assert.equal(r.deals['edoardo miceli'].state, 'offer');
});

test('a completed deal that shows up again is a new deal (Luna joined, then a bid for him)', () => {
  const deals = {'martin luna': {player: 'Martín Luna', dir: 'in', state: 'completed', since: '2032-06-24', seen: '2032-06-24', history: []}};
  const r = reduce(deals, {date: '2032-07-22', rows: [{player: 'Martín Luna', stage: 'Offer Made', dir: 'out'}]});
  assert.deepEqual(r.alerts, []);
  assert.equal(r.deals['martin luna'].state, 'offer'); assert.equal(r.deals['martin luna'].previous.state, 'completed');
});

test('an odd move on a sale is reported, not a stop (Bouhoudane: contract → 2 Offers)', () => {
  const deals = {'sami bouhoudane': {player: 'Sami Bouhoudane', dir: 'out', state: 'contract', since: '2032-07-22', seen: '2032-07-22', history: []}};
  const r = reduce(deals, {date: '2032-07-24', rows: [{player: 'Sami Bouhoudane', stage: '2 Offers'}]});
  assert.ok(r.alerts.some(a => a.kind === 'unknown-transition' && !a.stop));
});

test('a reloaded save rewinds the deals to its date (2033-08-05: redoing three buys)', async () => {
  const {rewind} = await import('./store.mjs');
  const deals = {
    'arnal ylla': {player: 'Arnal Ylla', dir: 'in', state: 'contract', since: '2033-08-06', seen: '2033-08-09', history: [['2033-08-05', 'offer'], ['2033-08-06', 'contract']]},
    'jorthy mokio': {player: 'Jorthy Mokio', dir: 'in', state: 'work-permit', since: '2033-08-08', seen: '2033-08-09', history: [['2033-08-05', 'offer'], ['2033-08-06', 'contract'], ['2033-08-08', 'work-permit']]},
    'later one': {player: 'Later One', dir: 'in', state: 'offer', since: '2033-08-07', seen: '2033-08-09', history: [['2033-08-07', 'offer']]},
  };
  const r = rewind(deals, '2033-08-05');
  assert.deepEqual(Object.keys(r), ['arnal ylla', 'jorthy mokio']);
  assert.equal(r['jorthy mokio'].state, 'offer'); assert.equal(r['jorthy mokio'].seen, '2033-08-05');
});
