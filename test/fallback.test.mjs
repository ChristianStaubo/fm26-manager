import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadScreen} from './screens.mjs';
import {makeFallback} from '../capabilities/season/fallback.mjs';

const policy = JSON.parse(readFileSync(new URL('../playbook/policy.json', import.meta.url)));
// A fake model: returns `answer` and remembers what it was asked.
const fake = answer => { const r = async q => { r.asked.push(q); return typeof answer === 'function' ? answer(q) : answer; }; r.asked = []; return r; };

test('no handler: the model presses one allowed button that is on the screen (captain)', async () => {
  const runner = fake({button: 'Confirm Captain', why: 'the default captain'}), pressed = [], logged = [], ledger = [];
  const fb = makeFallback({policy, runner, log: e => logged.push(e), ledger: e => ledger.push(e)});
  const r = await fb.pressSafe(loadScreen('choose-captain-savinho-left'), {fp: 'a', press: b => pressed.push(b)});
  assert.equal(r.pressed, true);
  assert.deepEqual(pressed, ['Confirm Captain']);
  assert.match(runner.asked[0].prompt, /ALLOWED: \["Confirm Captain"\]/, 'only allowed buttons are offered');
  assert.equal(logged[0].action, 'fallback');
  assert.equal(ledger[0].kind, 'supervisor-decision');
});

test('the model can only press an allowed button, and may stop', async () => {
  const off = await makeFallback({policy, runner: fake({button: 'Review Captaincy', why: 'x'})}).pressSafe(loadScreen('choose-captain-savinho-left'), {fp: 'a', press: () => assert.fail('pressed')});
  assert.equal(off.pressed, false);
  assert.match(off.why, /not an allowed button/);
  const stop = await makeFallback({policy, runner: fake({button: null, why: 'unsure'})}).pressSafe(loadScreen('choose-captain-savinho-left'), {fp: 'a', press: () => assert.fail('pressed')});
  assert.match(stop.why, /chose to stop: unsure/);
});

test('a screen about money always stops, and the model is never asked', async () => {
  const runner = fake({button: 'Accept Offer', why: 'x'});
  const r = await makeFallback({policy, runner}).pressSafe(loadScreen('loan-page-dukic-koln'), {fp: 'a', press: () => assert.fail('pressed')});
  assert.equal(r.pressed, false);
  assert.match(r.why, /money/);
  assert.equal(runner.asked.length, 0);
});

test('limits: never twice on one screen, at most max_per_run per run, off with FM_FALLBACK=off', async () => {
  const fb = makeFallback({policy: {autopilot: {fallback: {...policy.autopilot.fallback, max_per_run: 2}}}, runner: fake({button: null, why: 'no'})});
  const s = loadScreen('choose-captain-savinho-left');
  await fb.pressSafe(s, {fp: 'a'});
  assert.match((await fb.pressSafe(s, {fp: 'a'})).why, /already tried this screen/);
  await fb.pressSafe(s, {fp: 'b'});
  assert.match((await fb.pressSafe(s, {fp: 'c'})).why, /limit reached/);
  process.env.FM_FALLBACK = 'off';
  try { assert.match((await makeFallback({policy, runner: fake(null)}).pressSafe(s, {fp: 'd'})).why, /disabled/); }
  finally { delete process.env.FM_FALLBACK; }
});

test('unreadable facts: the model reads only those, and each must be on the screen', async () => {
  const s = loadScreen('loan-page-dukic-koln');   // shows "50% (£5,750 p/w)" and "End Of Season"
  const good = await makeFallback({policy, runner: fake({wageShare: 0.5, duration: 'End of season'})}).readFacts(s, ['wageShare', 'duration'], {player: 'Petar Đukić'}, {fp: 'a'});
  assert.deepEqual(good.facts, {wageShare: 0.5, duration: 'End of season'});
  const made = await makeFallback({policy, runner: fake({wageShare: 0.8, duration: 'Two seasons'})}).readFacts(s, ['wageShare', 'duration'], {}, {fp: 'a'});
  assert.equal(made.facts, null);
  assert.match(made.why, /not on the screen: wageShare=0.8, duration="Two seasons"/);
  const unknown = await makeFallback({policy, runner: fake({})}).readFacts(s, ['transferFee'], {}, {fp: 'a'});
  assert.match(unknown.why, /no description for transferFee/);
});

test('a renewal chat\'s demands are read from the agent\'s lines, the lowered range first (Burton, 2036-07-06)', async () => {
  const {readDemands} = await import('../capabilities/buy/ask.mjs');
  const d = readDemands(['Will expect to be considered among the most noteworthy players at the club and play as many matches as possible.',
    'Would want a salary of between £77K per week and £95K per week now instead of one between £86K per week and £105K per week as per the original request.',
    'Would want a long term contract until 6/30/2041.']);
  assert.deepEqual(d.wage, [77000, 95000]);
  assert.equal(d.until, '6/30/2041');
});
