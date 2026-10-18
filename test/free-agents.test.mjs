// Free agents first (user, 2031-05-28), judged by CA/PA (PLAYBOOK §1a, user 2026-10-18).
// Ethan Mbappé (24, Lille, on loan at Holstein Kiel, contract to June 2031, FM value £0.2M) was skipped by
// every market search for being on loan and joined Monaco free. Rusnák (20, CA 147, FM value £4.3M) and
// Holmbjerg (18, PA 178, gone to Roma) were cut by the old attribute bar in January 2036. Alexandre Luiz
// (24, CA 178, Genk) was priced at his collapsed FM value, £16.7M: too few players compare at the top.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = (body, date = '2031-01-10') => JSON.parse(execFileSync('python3', ['-c', `import json, free_agents as fa, bargains
fa.sr.num = lambda p, k: 5
fa.m.POLICY['buying']['table']['backup_within'] = 25
bargains.B['min_cell'] = 15
row = lambda name, club, value, ca, pa, age=24, ends='2040-06-30', loan='', cc=None, comp='Bundesliga', pos='AMR', nation='France': {'name': name, 'club': club,
  'contract_club': cc if cc is not None else club, 'on_loan_at': loan, 'value': str(int(value)), 'pos': {pos}, 'positions': pos, 'age': str(age), 'contract_expires': ends,
  'competition': comp, 'mins': 2000, 'wage': '20000', 'nation': nation, 'ca': str(ca), 'pa': str(pa)}
# Our squad: CA 150 on average, so the backup level is 125.
rows = [row(f'Ours{i}', 'Brentford', 20e6, 150, 155, cc='Brentford', comp=fa.m.LEAGUE) for i in range(22)]
# The market: players of CA 141-148, ages 19-25, worth ~£25-30M on long contracts.
rows += [row(f'Peer{i}{a}', f'Club{i}', 28e6, 141 + i % 8, 150, age=a) for i in range(16) for a in (19, 20, 21, 23, 24, 25)]
${body}`], {cwd: `${ROOT}analysis`, encoding: 'utf8', env: {...process.env, FM_GAME_DATE: date}}));

test('a loanee whose parent contract expires is a pre-contract target, priced as players of his CA and age', () => {
  const out = run(`rows.append(row('Ethan Mbappe', 'Holstein Kiel', 181162, 145, 150, ends='2031-06-30', loan='Holstein Kiel', cc='LOSC Lille'))
rows.append(row('Long Contract', 'Kiel', 2e6, 145, 150))
r = fa.scan(rows)
print(json.dumps([[c['name'], c['worth'], c['on_loan'], c['contract_club'], c['route']] for c in r['players']]))`);
  assert.deepEqual(out.map(c => c[0]), ['Ethan Mbappe']);
  const [, worth, onLoan, club, route] = out[0];
  assert.ok(worth >= 25e6, `worth ${worth}`);
  assert.ok(onLoan);
  assert.equal(club, 'LOSC Lille');
  assert.match(route, /pre-contract/);
});

test('CA above our backup level with an expiring contract is listed at what his CA and age are worth, not his collapsed FM value (Rusnák)', () => {
  const out = run(`rows.append(row('Radovan Rusnak', 'Banik Ostrava', 4.275e6, 147, 155, age=20, ends='2036-06-30', pos='AML', nation='Czech Republic'))
rows.append(row('Too Weak', 'Somewhere', 1e6, 110, 120, age=20, ends='2036-06-30', pos='AML'))
r = fa.scan(rows)
print(json.dumps({'squad': [r['squad_avg'], r['backup_level']], 'players': [[c['name'], c['worth'], c['always_buy'], c['why']] for c in r['players']]}))`, '2036-05-01');
  assert.deepEqual(out.squad, [150, 125]);
  assert.deepEqual(out.players.map(c => c[0]), ['Radovan Rusnak']);
  const [, worth, always, why] = out.players[0];
  assert.ok(worth >= 25e6 && worth <= 30e6, `worth ${worth}`);
  assert.equal(always, false, 'under the £30M always-buy line: listed for a verdict');
  assert.match(why, /CA 147 >= our backup level 125/);
});

test('a free wonderkid is always a buy, slot or not; a foreign under-18 is not listed (he would not join)', () => {
  const out = run(`rows.append(row('Lasse Holmbjerg', 'FC Copenhagen', 1e5, 126, 178, age=18, ends='2036-06-30', pos='MC', nation='Denmark'))
rows.append(row('Young Abroad', 'Penarol', 1e5, 120, 181, age=17, ends='2036-06-30', pos='DC', nation='Uruguay'))
rows.append(row('Young English', 'Stoke', 1e5, 104, 176, age=17, ends='2036-06-30', pos='DC', nation='England'))
r = fa.scan(rows)
print(json.dumps([[c['name'], c['always_buy'], c['why']] for c in r['players']]))`, '2036-05-01');
  assert.deepEqual(out.map(c => c[0]).sort(), ['Lasse Holmbjerg', 'Young English']);
  for (const [, always, why] of out) { assert.equal(always, true); assert.match(why, /free wonderkid/); }
});

test('a player above everyone near his CA is priced from the nearest wider band (a floor), not his collapsed FM value (Alexandre Luiz)', () => {
  const out = run(`rows.append(row('Alexandre Luiz', 'Genk', 1e6, 156, 160, age=23, ends='2036-06-30', pos='ST', nation='Brazil'))
r = fa.scan(rows)
print(json.dumps([[c['name'], c['worth'], c['worth_basis']] for c in r['players']]))`, '2036-05-01');
  assert.deepEqual(out, [['Alexandre Luiz', 20e6, 'players of his CA and age']]);
});
