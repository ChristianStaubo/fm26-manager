// Bargains (user, 2034-08): undervalued for CA and age, and buried talent (Esajas, Finck at PSG).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = code => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8', env: {...process.env, FM_GAME_DATE: '2034-09-01'}}));

test('an undervalued player and a buried talent are found; fair prices are not', () => {
  const d = run(`import json, bargains as b
def p(name, ca, pa, age, value, club='X'):
    return {'name': name, 'club': club, 'contract_club': club, 'on_loan_at': '', 'age': str(age), 'ca': str(ca), 'pa': str(pa), 'value': str(int(value)), 'wage': '20000', 'positions': 'DC', 'competition': ''}
market = [p(f'Peer{i}', 150, 155, 22, 30e6) for i in range(20)]
rows = market + [p('Rosete', 150, 180, 22, 8e6, 'Cruz Azul'), p('Esajas', 129, 198, 23, 10e6, 'PSG')]
d = b.scan(rows, squad_avg=150)
print(json.dumps({'under': [c['name'] for c in d['undervalued']], 'buried': [c['name'] for c in d['buried']]}))`);
  assert.deepEqual(d.under, ['Rosete'], 'Peers at £30M are fair; Rosete at £8M is 3.75x under');
  assert.deepEqual(d.buried, ['Esajas']);
});
