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

test('attributes lens ranks cheap-for-their-attributes first within an attribute band (resale backtest)', () => {
  const young = (name, attributes, x_market) => ({name, attributes, x_market, blended: attributes, moneyball: null, value: 1e7, age: 21, wage: 1, league: 'X', chabot: false, minutes: 0});
  const report = {slots: [{slot: 'ST', need: 2, solid: 0, attr_bar: 50, ours: [], best: [], value: [], bench: [], free: [],
    by_attributes: [young('Pricey', 82, 2.5), young('Cheap', 81, 0.4), young('Lower', 74, 0.1)]}]};
  const out = run(`import json, plan as p
p.m.price = lambda rows, n: {'club': 'C', 'value': 1e7, 'open_at': 1e7, 'walk_away': 1.2e7, 'wage': 1, 'wage_ok': True}
picks, skipped, left, shortlist = p.shopping(json.loads(${JSON.stringify(JSON.stringify(report))}), [], {'slots': [{'slot': 'ST'}]}, 1e8, 'attributes', 24)
print(json.dumps([x['name'] for x in picks if x['role'] == 'starter']))`);
  assert.deepEqual(out, ['Cheap']);
});

test('depth (user): cheapest solid backup at any age, even under the young lens', () => {
  const c = (name, blended, age, value) => ({name, blended, attributes: blended, moneyball: 60, value, age, wage: 1, league: 'X', chabot: false, minutes: 2000});
  const report = {slots: [{slot: 'RW', need: 2, solid: 1, attr_bar: 50, ours: [c('Doak', 56, 24, 6e7)], best: [], value: [], by_attributes: [],
    bench: [c('Old cheap', 55, 29, 2e6), c('Young dear', 60, 21, 9e6)], free: []}]};
  const out = run(`import json, plan as p
p.m.price = lambda rows, n: {'club': 'C', 'value': 1, 'open_at': 1, 'walk_away': 1, 'wage': 1, 'wage_ok': True}
picks, skipped, left, shortlist = p.shopping(json.loads(${JSON.stringify(JSON.stringify(report))}), [], {'slots': [{'slot': 'RW'}]}, 1e8, 'attributes', 24)
print(json.dumps([[x['role'], x['name']] for x in picks]))`);
  assert.deepEqual(out, [['depth', 'Old cheap']]);
});

test('red team: Ortega-style picks carry their case against (wage, price per point, no sample, permit)', () => {
  const out = run(`import json, plan as p
pick = {'wage': 88000, 'value': 52.6e6, 'blended': 50, 'moneyball': None, 'minutes': 180, 'age': 20}
row = {'Injury Proneness': '6', 'Consistency': '14', 'nation': 'Colombia'}
print(json.dumps(p.red_team(pick, row, 40000)))`);
  assert.ok(out.some(x => /wage £88K\/wk is 2.2x/.test(x)));
  assert.ok(out.some(x => /per point/.test(x)));
  assert.ok(out.some(x => /no full season/.test(x)));
  assert.ok(out.some(x => /Colombia: likely a work permit/.test(x)));
});

test('growth lens (user, 2026-10-15): young players ranked by own-league output x league strength, then price', () => {
  const g = (name, growth, x_market) => ({name, growth, x_market, attributes: 20, blended: 20, moneyball: 40, value: 5e6, age: 22, wage: 1, league: 'X', chabot: false, minutes: 2000});
  const report = {slots: [{slot: 'ST', need: 2, solid: 0, attr_bar: 50, ours: [], best: [], value: [], bench: [], free: [], by_attributes: [],
    growth: [g('Pricey', 63, 7.6), g('Cheap', 61, 1.2), g('Weak', 40, 0.1)]}]};
  const out = run(`import json, plan as p
p.m.price = lambda rows, n: {'club': 'C', 'value': 5e6, 'open_at': 5e6, 'walk_away': 6e6, 'wage': 1, 'wage_ok': True}
picks, skipped, left, shortlist = p.shopping(json.loads(${JSON.stringify(JSON.stringify(report))}), [], {'slots': [{'slot': 'ST'}]}, 1e8, 'growth', 23)
print(json.dumps([x['name'] for x in picks if x['role'] == 'starter']))`);
  assert.deepEqual(out, ['Cheap'], 'same growth band → cheaper for his profile first');
});

test('wonderkid lens (user, 2026-10-15): best for his age (z vs age group), cheaper first within a band', () => {
  const k = (name, age_z, value) => ({name, age_z, value, attributes: 10, blended: 10, moneyball: null, age: 17, wage: 1, league: 'X', chabot: false, minutes: 0, x_market: null});
  const report = {slots: [{slot: 'ST', need: 2, solid: 0, attr_bar: 50, ours: [], best: [], value: [], bench: [], free: [], by_attributes: [], growth: [],
    wonderkids: [k('Dear', 2.6, 22e6), k('Cheap', 2.5, 0.9e6), k('Lower', 2.0, 0.1e6)]}]};
  const out = run(`import json, plan as p
p.m.price = lambda rows, n: {'club': 'C', 'value': 1e6, 'open_at': 1e6, 'walk_away': 1.2e6, 'wage': 1, 'wage_ok': True}
picks, skipped, left, shortlist = p.shopping(json.loads(${JSON.stringify(JSON.stringify(report))}), [], {'slots': [{'slot': 'ST'}]}, 1e8, 'wonderkid', 21)
print(json.dumps([x['name'] for x in picks if x['role'] == 'starter']))`);
  assert.deepEqual(out, ['Cheap'], 'z 2.6 and 2.5 share a half-SD band: the £0.9M one first');
});
