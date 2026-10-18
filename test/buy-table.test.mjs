// The buy decision table (user, 2033-09-01): backups by the squad's level, cover counts, cheapest within
// 10 CA of the best affordable, upgrades only young + within the season's surplus, none in January.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = code => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8', env: {...process.env, FM_GAME_DATE: '2033-09-01'}}));
const setup = `import json, buy_table as bt
C = bt.m.CLUB
def p(name, club, ca, gk=1, lb=1, age=25, value=1e6, wage=20000, cc=None, other=1):
    return {'name': name, 'club': club, 'contract_club': cc if cc is not None else club, 'on_loan_at': '', 'age': str(age), 'ca': str(ca), 'pa': str(ca),
            'value': str(int(value)), 'wage': str(wage), 'contract_expires': '2036-06-30', 'pos_GK': str(gk), 'pos_DL': str(lb), 'pos_WBL': '1', 'pos_ST': str(other)}
ours = [p('Brady', C, 158, gk=20), p('Sullivan', C, 113, gk=20), p('Brown', C, 154, lb=20), p('Carroll', C, 128, lb=20)] + [p(f'Mid{i}', C, 150) for i in range(8)]
market = [p('Pizarro', 'Freiburg', 148, gk=20, value=5.7e6), p('Bouaskar', 'X', 142, gk=20, value=1.9e6), p('Hellstern', 'Stuttgart', 138, gk=20, value=1.3e6),
          p('Oldie', 'Y', 160, gk=20, age=33, value=2e6), p('Upgrade', 'Z', 163, lb=20, age=22, value=20e6), p('Costly', 'Z2', 165, lb=20, age=23, value=90e6)]
tactic = {'slots': [{'slot': 'GK'}, {'slot': 'LB'}]}
`;
const pick = d => Object.fromEntries(d.positions.map(r => [r.position, {needs: r.needs.map(n => [n.kind, n.candidates[0]?.name]), buy: (r.upgrade_option?.candidates || []).filter(c => c.buy).map(c => c.name)}]));

test('summer: GK backup = cheapest within 10 CA of the best; Carroll is fine (squad level); a young upgrade within the surplus', () => {
  const d = run(setup + `print(json.dumps(bt.table(ours + market, tactic, season_surplus=45e6, window='summer')))`);
  const r = pick(d);
  assert.deepEqual(r.GK.needs, [['backup', 'Hellstern']], 'best affordable 148 → cheapest ≥ 138; 33-year-old keeper not free: skipped (keepers age later)');
  assert.deepEqual(r.LB.needs, [], 'Carroll 128 ≥ min(154, squad avg) − 25');
  assert.deepEqual(r.LB.buy, ['Upgrade'], '£20M fits the £45M surplus; £90M does not');
});

test('january: missing backups yes, upgrades no', () => {
  const d = run(setup + `print(json.dumps(bt.table(ours + market, tactic, season_surplus=45e6, window='january')))`);
  const r = pick(d);
  assert.deepEqual(r.GK.needs, [['backup', 'Hellstern']]);
  assert.deepEqual(r.LB.buy, []);
});

test('wonderkids (summer): PA >= 175, <= £15M, 18+ unless British/Irish, best PA first (user, 2034-07-03)', () => {
  const d = run(setup + `kids = [p('Pepper', 'Forest', 93, lb=20, age=16, value=14.2e6), p('Awudu', 'Hoff', 124, age=18, value=0.4e6), p('YoungForeign', 'Gent', 104, age=16, value=15e6), p('Pricey', 'Porto', 107, age=18, value=44e6)]
for k, pa, nat in [(0, 186, 'Republic of Ireland'), (1, 180, 'Germany'), (2, 185, 'Belgium'), (3, 187, 'Portugal')]:
    kids[k]['pa'] = str(pa); kids[k]['nation'] = nat
print(json.dumps([c['name'] for c in bt.table(ours + market + kids, tactic, season_surplus=0, window='summer')['wonderkids']]))`);
  assert.deepEqual(d, ['Pepper', 'Awudu'], 'foreign 16-year-old and the £44M one excluded');
});

test('wonderkid portfolio (user, 2034-09; 2026-10-18: max 6 at PA 170+): the summer list fills only the room left; on_arrival loan vs squad', () => {
  const d = run(setup + `held = [p(f'Kid{i}', C, 100, age=19) for i in range(5)]
for k in held: k['pa'] = '180'
kids = [p('Awudu', 'Hoff', 95, age=18, value=0.4e6), p('Ready', 'Gent', 140, age=19, value=5e6)]
for k, pa in zip(kids, (181, 180)): k['pa'] = str(pa); k['nation'] = 'Germany'
t = bt.table(ours + market + held + kids, tactic, season_surplus=0, window='summer')
print(json.dumps({'portfolio': t['portfolio'], 'kids': [(c['name'], c['on_arrival']) for c in t['wonderkids']]}))`);
  assert.deepEqual(d.portfolio, {held: 5, room: 1, weakest: ['Kid0', 'Kid1']});
  assert.deepEqual(d.kids, [['Awudu', 'loan']], 'one slot left: the best PA; CA 95 is below the backup level');
});

test('a starter who left since the last buy checkpoint is replaced (user, 2035-01-01: Stringfellow), unless one at his level starts now', () => {
  const d = run(setup + `gone = [{'name': 'Stringfellow', 'position': 'LB', 'ca': 170}]
a = bt.table(ours + market, tactic, season_surplus=45e6, window='january', departed=gone)
b = bt.table(ours + market, tactic, season_surplus=45e6, window='january', departed=[{'name': 'Stringfellow', 'position': 'LB', 'ca': 150}])
c = bt.table(ours + market, tactic, season_surplus=45e6, window='january', departed=[{'name': 'Brown', 'position': 'LB', 'ca': 170}])
k = lambda t: [n['kind'] for r in t['positions'] if r['position'] == 'LB' for n in r['needs']]
print(json.dumps([k(a), k(b), k(c)]))`);
  assert.deepEqual(d, [['replace'], [], []], 'Brown 154 < 167 → replace; a 150 leaver is covered by Brown; Brown still ours → nothing');
});

test('bought wonderkids (user, 2026-10-18): PA 180+ and two a window, best PA first', () => {
  const d = run(setup + `kids = [p(f'K{pa}', 'Club', 100, age=18, value=5e6) for pa in (176, 179, 180, 183, 186)]
for k in kids: k['pa'] = k['name'][1:]; k['nation'] = 'Germany'
print(json.dumps([c['name'] for c in bt.table(ours + market + kids, tactic, season_surplus=0, window='summer')['wonderkids']]))`);
  assert.deepEqual(d, ['K186', 'K183']);
});

test('a loanee back within 60 days is in the depth chart: no backup bought for him (Awudu, 2036-06-04)', () => {
  const d = run(setup + `back = p('Awudu', 'Utrecht', 140, gk=20, age=20, cc=C); back['on_loan_at'] = 'Utrecht'; back['loan_ends'] = '2033-09-29'
away = p('Away', 'Ajax', 140, gk=20, age=20, cc=C); away['on_loan_at'] = 'Ajax'; away['loan_ends'] = '2034-06-30'
r = lambda extra: [n['kind'] for x in bt.table(ours + market + extra, tactic, season_surplus=45e6, window='summer')['positions'] if x['position'] == 'GK' for n in x['needs']]
print(json.dumps([r([back]), r([away])]))`);
  assert.deepEqual(d, [[], ['backup']], 'back on 29 Sept: he is the backup; back next June: still a hole');
});

test('an upgrade the surplus cannot pay for is a buy once a player at that position is sold (user, 2026-10-18: Senhaji if Froholdt sells)', () => {
  const d = run(setup + `for x in ours:
    if x['name'] == 'Brown': x['value'] = str(int(18e6))
t = bt.table(ours + market, tactic, season_surplus=5e6, window='summer')
lb = next(x for x in t['positions'] if x['position'] == 'LB')
print(json.dumps({c['name']: [c['buy'], c.get('buy_if_sold')] for c in lb['upgrade_option']['candidates']}))`);
  assert.deepEqual(d.Upgrade, [false, ['Brown']], '£20M: the £5M left + Brown (the starter he displaces, £18M) pays; Carroll (£1M) does not');
  assert.deepEqual(d.Costly, [false, null], '£90M: no single sale there pays');
});

test('a developing prospect is a starter or on loan, never our backup (user, 2026-10-19: Slatina, E. Đukić)', () => {
  const d = run(setup + `kid = p('Slatina', C, 150, gk=20, age=19); kid['pa'] = '189'
t = bt.table(ours + market + [kid], tactic, season_surplus=45e6, window='summer')
g = next(x for x in t['positions'] if x['position'] == 'GK')
print(json.dumps([g['backup'], [n['kind'] for n in g['needs']]]))`);
  assert.deepEqual(d, [null, ['backup']], 'Slatina (CA 150, PA 189) is not the backup keeper: a settled one is bought (Sullivan 113 is below the bar)');
});

test('planned sales: needs without them; a starter\'s replacement only once he is sold (Miceli, promise at £81M)', () => {
  const d = run(setup + `t = bt.table(ours + market, tactic, season_surplus=45e6, window='summer', selling=['Brown'])
lb = next(x for x in t['positions'] if x['position'] == 'LB')
print(json.dumps([(n['kind'], n.get('for'), n.get('if_sold')) for n in lb['needs']]))`);
  assert.deepEqual(d[0], ['replace', 'Brown', 'Brown']);
});

test('a full portfolio takes a clearly better prospect, who replaces the weakest (user, 2026-10-19: Pepper for Collins)', () => {
  const d = run(setup + `held = [p(f'Kid{i}', C, 100 + i, age=20) for i in range(6)]
for k in held: k['pa'] = '172'
kids = [p('Pepper', 'Forest', 118, age=18, value=9.5e6), p('Meh', 'X', 110, age=18, value=5e6)]
for k, pa in zip(kids, (186, 181)): k['pa'] = str(pa); k['nation'] = 'Republic of Ireland'
t = bt.table(ours + market + held + kids, tactic, season_surplus=0, window='summer')
print(json.dumps({'portfolio': t['portfolio']['room'], 'kids': [(c['name'], c.get('replaces')) for c in t['wonderkids']]}))`);
  assert.equal(d.portfolio, 0);
  assert.deepEqual(d.kids, [['Pepper', 'Kid0'], ['Meh', 'Kid1']], 'PA 186 and 181 beat PA 172 by 5+: each replaces the weakest left (lowest CA first)');
});

test('a departing starter is replaced within a range of the position average, or by a young player whose PA reaches his CA (user, 2026-10-19)', () => {
  const d = run(setup + `young = p('YoungLB', 'Y', 136, lb=20, age=20, value=8e6); young['pa'] = '175'
weak = p('TooWeak', 'W', 130, lb=20, age=20, value=2e6); weak['pa'] = '180'
t = bt.table(ours + market + [young, weak], tactic, season_surplus=0, window='summer', selling=['Brown'])
n = next(n for x in t['positions'] if x['position'] == 'LB' for n in x['needs'] if n['kind'] == 'replace')
print(json.dumps({'bar': n['min_ca'], 'avg': n['position_avg'], 'names': [c['name'] for c in n['candidates']], 'over': [c['name'] for c in n['candidates'] if c['over_cap']]}))`);
  assert.deepEqual([d.avg, d.bar], [154, 144], 'Brown 154 is the position: bar 144');
  assert.deepEqual(d.names, ['Upgrade', 'YoungLB', 'Costly'], 'by (CA + PA) / 2, the £90M one last (over the £50M soft cap); TooWeak (CA 130) is below the young bar 134');
  assert.deepEqual(d.over, ['Costly']);
});
