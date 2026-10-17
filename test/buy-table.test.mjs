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

test('wonderkid portfolio (user, 2034-09): the summer list fills only the room left under portfolio_max; on_arrival loan vs squad', () => {
  const d = run(setup + `held = [p(f'Kid{i}', C, 100, age=19) for i in range(9)]
for k in held: k['pa'] = '180'
kids = [p('Awudu', 'Hoff', 95, age=18, value=0.4e6), p('Ready', 'Gent', 140, age=19, value=5e6)]
for k, pa in zip(kids, (181, 180)): k['pa'] = str(pa); k['nation'] = 'Germany'
t = bt.table(ours + market + held + kids, tactic, season_surplus=0, window='summer')
print(json.dumps({'portfolio': t['portfolio'], 'kids': [(c['name'], c['on_arrival']) for c in t['wonderkids']]}))`);
  assert.deepEqual(d.portfolio, {held: 9, room: 1});
  assert.deepEqual(d.kids, [['Awudu', 'loan']], 'one slot left: the best PA; CA 95 is below the backup level');
});
