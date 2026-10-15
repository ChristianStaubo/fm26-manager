// The cycle as code (playbook/cycle.json): the next checkpoint, every step runs in order, a failing
// step is reported (never skipped silently), and the judge asks about missed checkpoints and
// unanswered "always buy" free agents (Ethan Mbappé, Jesús Fortea, 2031).
import test from 'node:test';
import assert from 'node:assert/strict';
import {nextCheckpoint, seasonOf, runCheckpoint, loadCycle} from './checkpoint.mjs';
import {checkCheckpoints} from '../audit/audit.mjs';

const cycle = loadCycle();

test('the cycle has the free-agent step in January and in summer', () => {
  for (const name of ['january', 'summer']) assert.ok(cycle.checkpoints.find(c => c.name === name).steps.includes('free_agents'), name);
});

test('next checkpoint: same day, later this year, and across the new year', () => {
  assert.deepEqual([nextCheckpoint('2031-01-02', cycle).name, nextCheckpoint('2031-01-02', cycle).date], ['january', '2031-01-02']);
  assert.equal(nextCheckpoint('2031-05-29', cycle).name, 'summer');
  assert.deepEqual([nextCheckpoint('2031-08-10', cycle).name, nextCheckpoint('2031-08-10', cycle).date], ['january', '2032-01-02']);
});

test('season of a date', () => {
  assert.equal(seasonOf('2031-01-10'), '2030/31');
  assert.equal(seasonOf('2031-07-02'), '2031/32');
});

test('runCheckpoint runs every step in order and reports a failure', async () => {
  const ran = [];
  const steps = Object.fromEntries(['results', 'contracts', 'free_agents', 'squad', 'audit'].map(k => [k, async () => { ran.push(k); if (k === 'squad') throw new Error('boom'); return {data: k, md: [k]}; }]));
  const r = await runCheckpoint('january', {date: '2031-01-02', save: false, write: false, steps, cycle});
  assert.deepEqual(ran, ['results', 'contracts', 'free_agents', 'squad', 'audit']);
  assert.equal(r.steps.squad.ok, false);
  assert.match(r.markdown, /STEP FAILED: boom/);
  assert.equal(r.steps.free_agents.ok, true);
});

const report = (name, date, players = []) => ({name, date, report: {steps: {free_agents: {ok: true, data: {players}}}}});
const mbappe = {name: 'Ethan Mbappé', age: 24, slot: 'RW', worth: 31e6, contract_club: 'LOSC Lille', contract_until: '2031-06-30', always_buy: true};

test('judge: a missed January checkpoint is a decision', () => {
  const r = checkCheckpoints({today: '2031-02-20', cycle, reports: [report('summer', '2030-07-02')]});
  assert.ok(r.decide.some(x => /january checkpoint/.test(x)));
  assert.ok(!r.decide.some(x => /summer checkpoint/.test(x)));
});

test('judge: an always-buy free agent needs an answer', () => {
  const reports = [report('summer', '2030-07-02'), report('january', '2031-01-02', [mbappe])];
  assert.ok(checkCheckpoints({today: '2031-01-20', cycle, reports}).decide.some(x => /Ethan Mbappé/.test(x)));
  // Answered: an agent chat / pre-contract in the decision log, or a recorded pass.
  assert.ok(!checkCheckpoints({today: '2031-01-20', cycle, reports, decisions: [{action: 'precontract', name: 'Ethan Mbappe'}]}).decide.some(x => /Mbapp/.test(x)));
  assert.ok(!checkCheckpoints({today: '2031-01-20', cycle, reports, interventions: [{capability: 'free_agents', proposed: 'Ethan Mbappé (RW)'}]}).decide.some(x => /Mbapp/.test(x)));
});

test('cycle: drives the window with the autopilot, holidays outside it (user, 2031-08-08)', async () => {
  const {cycle} = await import('./checkpoint.mjs');
  const {inWindow, nextWindowOpen, windowEnd} = await import('./season.mjs');
  let today = '2031-08-08';
  const legs = [];
  const fake = {
    date: async () => today, inWindow, nextOpen: nextWindowOpen, closeOf: windowEnd,
    drive: async until => { legs.push(['drive', until]); today = until; return {reason: 'until'}; },
    away: async until => { legs.push(['holiday', until]); today = until; return {reason: 'returned'}; },
  };
  // The checkpoint itself is faked too: a test must never save or click in the live game.
  const r = await cycle({}, {...fake, check: async name => ({checkpoint: name})});
  assert.deepEqual(legs, [['drive', '2031-09-02'], ['holiday', '2032-01-01'], ['drive', '2032-01-02']]);
  assert.equal(r.checkpoint, 'january');
});
