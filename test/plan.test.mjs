// fm plan (capability plan): a starter must be proven on a real sample, every target list counts,
// depth is cheap, and the budget holds (2030-07: Torrente counted as a starter on attributes after
// 27 minutes, Kovář was missed in 'bench', Zaragoza £52M was proposed as depth).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = code => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8'}));
const card = (name, blended, moneyball, value) => ({name, blended, attributes: blended, moneyball, value, age: 27, league: 'X', chabot: false, minutes: moneyball === null ? 27 : 2500});

test('shopping: proven starters, all lists, cheap depth, within budget', () => {
  const report = {slots: [
    {slot: 'CB', need: 4, solid: 3, ours: [card('Torrente', 83, null, 7e6), card('Lawrence', 68, 52, 1e7), card('Muharemovic', 60, 57, 3e7)],
     best: [card('Hajdari', 90, 97, 24e6)], value: [], bench: [card('Camara', 52, 78, 2e6)], free: []},
    {slot: 'GK', need: 2, solid: 0, ours: [card('Eyestone', 34, 50, 4e6)],
     best: [card('Trubin', 83, null, 44e6)], value: [], bench: [card('Kovar', 75, 100, 3.75e6)], free: []},
    {slot: 'RW', need: 2, solid: 1, ours: [card('Doak', 56, 50, 6e7)],
     best: [card('Zaragoza', 58, null, 43e6)], value: [], bench: [], free: []},
  ]};
  const tactic = {slots: ['GK', 'LCB', 'CB', 'RCB', 'RW'].map(slot => ({slot}))};
  const out = run(`import json, plan as p
p.m.price = lambda rows, n: {'club': 'C', 'value': V[n], 'open_at': V[n], 'walk_away': V[n] * 1.2, 'wage': 1, 'wage_ok': True}
V = {c['name']: c['value'] for s in ${JSON.stringify(JSON.stringify(report))} and json.loads(${JSON.stringify(JSON.stringify(report))})['slots'] for k in ('best','value','bench','free') for c in s[k]}
picks, skipped, left, shortlist = p.shopping(json.loads(${JSON.stringify(JSON.stringify(report))}), [], json.loads(${JSON.stringify(JSON.stringify(tactic))}), 40e6)
print(json.dumps({'picks': [[x['slot'], x['role'], x['name']] for x in picks], 'skipped': skipped, 'left': left}))`);
  assert.deepEqual(out.picks.filter(p => p[1] === 'starter').map(p => p[2]).sort(), ['Hajdari', 'Kovar']);
  assert.ok(out.picks.some(p => p[0] === 'CB' && p[1] === 'depth' && p[2] === 'Camara'));
  assert.ok(!out.picks.some(p => p[2] === 'Zaragoza'), 'no £43M+ depth signing');
  assert.ok(out.left >= 0);
});

test('attributes lens: young players above our weakest starter; the wage cap holds', () => {
  const young = (name, attributes, age, value, wage) => ({name, attributes, blended: attributes, moneyball: null, value, age, wage, league: 'X', chabot: false, minutes: 0});
  const report = {slots: [{slot: 'CB', need: 4, solid: 2, attr_bar: 63, ours: [{name: 'Lawrence', blended: 68, attributes: 83, moneyball: 52}, {name: 'Muharemovic', blended: 60, attributes: 63, moneyball: 57}],
    best: [], value: [], bench: [], free: [], by_attributes: [young('Gadou', 89, 23, 48e6, 1), young('Banks', 63, 23, 26e6, 1), young('Rich', 95, 22, 30e6, 9e5), young('Old', 99, 29, 1e6, 1)]}]};
  const tactic = {slots: ['LCB', 'CB', 'RCB'].map(slot => ({slot}))};
  const out = run(`import json, plan as p
R = json.loads(${JSON.stringify(JSON.stringify(report))})
V = {c['name']: c for c in R['slots'][0]['by_attributes']}
p.m.price = lambda rows, n: {'club': 'C', 'value': V[n]['value'], 'open_at': V[n]['value'], 'walk_away': V[n]['value'] * 1.2, 'wage': V[n]['wage'], 'wage_ok': V[n]['wage'] < 2e5}
picks, skipped, left, shortlist = p.shopping(R, [], json.loads(${JSON.stringify(JSON.stringify(tactic))}), 200e6, 'attributes', 24)
print(json.dumps({'picks': [x['name'] for x in picks if x['role'] == 'starter'], 'short': [[c['name'], c['beats_our_weakest_starter']] for c in shortlist['CB']]}))`);
  assert.deepEqual(out.picks, ['Gadou'], 'Rich is over the wage cap, Old over the age limit, Banks only equals the bar');
  assert.deepEqual(out.short, [['Rich', true], ['Gadou', true], ['Banks', false]]);
});
