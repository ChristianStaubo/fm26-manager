// A final-year replacement must play where our player plays in our shape. Juninho (MC 20, DM 1) was
// offered as Kislyak's DM replacement through the DM/CM group and never played a minute (2033-01).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = code => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8', env: {...process.env, FM_GAME_DATE: '2033-01-02'}}));

test('final year: a central midfielder is no replacement for our DM', () => {
  const out = run(`import json, datetime as dt, final_year as fy
fy.m.xi = lambda rows, tactic, today: {'xi': []}
fy.score = lambda p, role: 15.0
row = lambda name, club, pos, dm, mc, ca, value, ends='2036-06-30': {'name': name, 'club': club, 'contract_club': club, 'positions': pos, 'age': '22' if club != fy.m.CLUB else '27',
  'pos_DM': str(dm), 'pos_MC': str(mc), 'ca': str(ca), 'pa': '160', 'value': str(int(value)), 'contract_expires': ends, 'wage': '80000', 'mins': '2000', 'competition': 'Serie A'}
rows = [row('Kislyak', fy.m.CLUB, 'DM', 20, 15, 145, 19e6, ends='2033-06-30'),
        row('Juninho', 'Flamengo', 'MC', 1, 20, 152, 10e6),
        row('Real DM', 'Lazio', 'DM', 20, 12, 146, 12e6)]
tactic = {'slots': [{'slot': 'LDM'}, {'slot': 'RDM'}]}
r = fy.scan(rows, tactic, dt.date(2033, 1, 2))
print(json.dumps([(x['name'], (x['replacement'] or {}).get('name')) for x in r['players']]))`);
  assert.deepEqual(out, [['Kislyak', 'Real DM']]);
});
