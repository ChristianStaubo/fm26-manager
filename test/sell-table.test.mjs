// The sell (listing) table (user, 2033-09-01): list surplus and 30+ starters, loan prospects, let the
// low-potential kids go passively.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = code => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8', env: {...process.env, FM_GAME_DATE: '2033-09-01'}}));

test('sell table: 30+ starter listed, surplus listed, prospects loaned, low-PA kids let go', () => {
  const d = run(`import json, sell_table as st
C = st.m.CLUB
def p(name, ca, pa, age, lb=1, value=10e6, wage=50000):
    return {'name': name, 'club': C, 'contract_club': C, 'on_loan_at': '', 'age': str(age), 'ca': str(ca), 'pa': str(pa), 'value': str(int(value)),
            'wage': str(wage), 'contract_expires': '2036-06-30', 'pos_DL': str(lb), 'pos_WBL': '1'}
rows = [p('Brown', 154, 162, 30, lb=20, value=59.4e6, wage=175000), p('Back', 140, 145, 26, lb=20), p('Third', 135, 140, 25, lb=20),
        p('Spare', 130, 135, 25, lb=20, value=8e6), p('Kid', 120, 170, 20, lb=20), p('Low', 100, 110, 19, lb=20, value=0.3e6)]
print(json.dumps({x['name']: [x['action'], x['ask']] for x in st.table(rows, {'slots': [{'slot': 'LB'}]})}))`);
  assert.deepEqual(d.Brown, ['sell', 71300000], '30+ starter: 1.2 x value');
  assert.equal(d.Spare[0], 'sell', 'surplus 22+');
  assert.equal(d.Kid[0], 'loan', 'prospect PA 170');
  assert.equal(d.Low[0], 'let-go', 'young, low PA: not listed');
  assert.equal(d.Back, undefined); assert.equal(d.Third, undefined);
});
