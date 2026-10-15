// Free agents first (user, 2031-05-28). Ethan Mbappé (24, Lille, on loan at Holstein Kiel, contract
// to June 2031, FM value £0.2M) was skipped by every market search for being on loan and joined
// Monaco free. fm free must list a loanee with an expiring parent contract, priced at what the same
// attributes and age sell for, with the pre-contract route.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = code => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8', env: {...process.env, FM_GAME_DATE: '2031-01-10'}}));

test('fm free: an on-loan winger with an expiring parent contract is a pre-contract target', () => {
  const out = run(`import json, free_agents as fa
fa.sc.attr_fit = lambda p, role: p['fit']
fa.sr.num = lambda p, k: 5
row = lambda name, club, value, fit, age=24, ends='2034-06-30', loan='', cc=None, comp='Bundesliga', mins=2000: {'name': name, 'club': club, 'contract_club': cc or club, 'on_loan_at': loan,
  'value': str(int(value)), 'pos': {'AMR'}, 'positions': 'AMR', 'age': str(age), 'contract_expires': ends, 'competition': comp, 'mins': mins, 'wage': '20000', 'nation': 'France', 'ca': '141', 'pa': '159', 'fit': fit}
rows = [row(f'Peer{i}', f'Club{i}', 30e6, 15.0, comp=fa.m.LEAGUE) for i in range(8)]
rows.append(row('Ethan Mbappe', 'Holstein Kiel', 181162, 15.0, ends='2031-06-30', loan='Holstein Kiel', cc='LOSC Lille'))
rows.append(row('Long Contract', 'Kiel', 2e6, 15.0))
r = fa.scan(rows)
print(json.dumps([[c['name'], c['worth'], c['on_loan'], c['contract_club'], c['route']] for c in r['players']]))`);
  assert.equal(out.length, 1);
  const [name, worth, onLoan, club, route] = out[0];
  assert.equal(name, 'Ethan Mbappe');
  assert.ok(worth >= 25e6, `worth ${worth}`);
  assert.ok(onLoan);
  assert.equal(club, 'LOSC Lille');
  assert.match(route, /pre-contract/);
});
