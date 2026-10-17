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
