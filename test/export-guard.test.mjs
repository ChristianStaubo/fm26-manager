// FM26 Scout misread a save's date (2036-06-04 read as 2055) and every age came out 19 years too old: the
// season-end checkpoint priced 24-year-old starters as veterans and the free agents lost Alexandre Luiz
// to the age filter. The analysis stops instead (squad_report.check_ages, run by manager.load).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const check = (offset) => spawnSync('python3', ['-c', `import datetime as dt, squad_report as sr
rows = [{'dob': f'{2000 + i % 15}-03-01', 'age': str(36 - i % 15 + ${offset})} for i in range(200)]
sr.check_ages(rows, dt.date(2036, 6, 4))
print('ok')`], {cwd: `${ROOT}analysis`, encoding: 'utf8'});

test('ages that fit the game date pass', () => {
  const r = check(0);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ok/);
});

test('ages 19 years off stop the analysis with what to do', () => {
  const r = check(19);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /disagree with the game date 2036-06-04 for 200\/200 players: FM26 Scout misread/);
});
