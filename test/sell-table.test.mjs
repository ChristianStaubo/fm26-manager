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

test('sell table (user, 2026-10-18): a lucky scorer sells, a prospect on first-team wages sells, the portfolio over its limit sells the weakest', () => {
  const d = run(`import json, sell_table as st
C = st.m.CLUB
def p(name, ca, pa, age, lb=1, value=10e6, wage=20000, **x):
    return {'name': name, 'club': C, 'contract_club': C, 'on_loan_at': '', 'age': str(age), 'ca': str(ca), 'pa': str(pa), 'value': str(int(value)),
            'wage': str(wage), 'contract_expires': '2038-06-30', 'pos_DL': str(lb), 'pos_WBL': '1', **x}
rows = [p('Start', 150, 155, 26, lb=20), p('Back', 140, 145, 27, lb=20, goals='25', xg='17.0', goals_minus_xg='8.0'), p('Third', 130, 140, 25, lb=20),
        p('Paid', 120, 174, 21, lb=20, wage=89000)] + [p(f'Kid{pa}', 100, pa, 19, lb=20) for pa in (171, 172, 173, 174, 175, 176, 177, 178, 180, 185, 186)]
print(json.dumps({x['name']: [x['action'], x['why'][:20]] for x in st.table(rows, {'slots': [{'slot': 'LB'}]})}))`);
  assert.equal(d.Back[0], 'sell', 'lucky season: 25 from 17 xG');
  assert.equal(d.Paid[0], 'sell', '£89K/wk: no loan club pays it');
  assert.deepEqual(['Kid171', 'Kid172', 'Kid186'].map(k => d[k][0]), ['sell', 'loan', 'loan'], 'eleven at PA 170+ (limit 10): the weakest goes');
});

test('sell table (user, 2026-10-19): a displaced starter on a big wage is an expensive backup and is sold; a developing prospect is loaned, not benched', () => {
  const d = run(`import json, sell_table as st
C = st.m.CLUB
def p(name, ca, pa, age, lb=1, value=10e6, wage=20000):
    return {'name': name, 'club': C, 'contract_club': C, 'on_loan_at': '', 'age': str(age), 'ca': str(ca), 'pa': str(pa), 'value': str(int(value)),
            'wage': str(wage), 'contract_expires': '2038-06-30', 'pos_DL': str(lb), 'pos_WBL': '1'}
rows = [p('Luiz', 178, 187, 24, lb=20), p('Arnalot', 160, 160, 23, lb=20, value=88e6, wage=92000), p('Kani', 135, 145, 24, lb=20), p('Third', 130, 132, 26, lb=20),
        p('Slatina', 148, 189, 19, lb=20)]
print(json.dumps({x['name']: x['action'] for x in st.table(rows, {'slots': [{'slot': 'LB'}]})}))`);
  assert.equal(d.Arnalot, 'sell', '£92K/wk backup behind Luiz');
  assert.equal(d.Slatina, 'loan', 'PA 189 at 19: develops on loan, not as the third');
});

test('an expensive backup is measured against our own wages (user, 2026-10-19: Finck at £82K "isn\'t that high")', () => {
  const d = run(`import json, sell_table as st
C = st.m.CLUB
def p(name, ca, pa, age, lb=1, value=10e6, wage=71000):
    return {'name': name, 'club': C, 'contract_club': C, 'on_loan_at': '', 'age': str(age), 'ca': str(ca), 'pa': str(pa), 'value': str(int(value)),
            'wage': str(wage), 'contract_expires': '2038-06-30', 'pos_DL': str(lb), 'pos_WBL': '1'}
rows = [p('Start', 160, 165, 26, lb=20, wage=150000), p('Finck', 140, 189, 25, lb=20, wage=82000), p('Third', 135, 140, 26, lb=20)] + [p(f'Mid{i}', 150, 150, 26) for i in range(10)]
print(json.dumps({x['name']: x['action'] for x in st.table(rows, {'slots': [{'slot': 'LB'}]})}))`);
  assert.equal(d.Finck, undefined, '£82K against a £71K median: under 1.25x (£89K), kept');
});
