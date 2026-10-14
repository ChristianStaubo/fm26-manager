// fm squad must flag players its tables leave out: Ajer and Katić were out of contract in July 2030
// and Eyestone, our first-choice keeper, sat in the U21s; no tool said so (user, 2026-10-14).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const py = code => execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8'});

test('alerts: no contract, a league regular registered in our U21, a regular in his final year (Franculino); youth regulars are not', () => {
  const rows = [
    {name: 'Kristoffer Ajer', club: 'Brentford', contract_club: '', on_loan_at: '', age: '32', positions: 'DC', competition: 'Premier League', minutes: '2888', wage: '55000'},
    {name: 'Julian Eyestone', club: 'Brentford U21', contract_club: 'Brentford', on_loan_at: '', age: '24', positions: 'GK', competition: 'Premier League', minutes: '4230', wage: '21914'},
    {name: 'Sol Foster', club: 'Brentford U18', contract_club: 'Brentford', on_loan_at: '', age: '18', positions: 'DM', competition: 'U18 Premier League', minutes: '6257', wage: '0'},
    {name: 'Michael Kayode', club: 'Brentford', contract_club: 'Brentford', on_loan_at: '', age: '26', positions: 'DR', competition: 'Premier League', minutes: '4000', wage: '90000', contract_expires: '2034-06-30'},
    {name: 'Franculino', club: 'Brentford', contract_club: 'Brentford', on_loan_at: '', age: '26', positions: 'ST', competition: 'Premier League', minutes: '3165', wage: '124448', value: '37929268', contract_expires: '2031-06-30'},
  ];
  const file = `${mkdtempSync(`${tmpdir()}/alerts-`)}/rows.json`;
  writeFileSync(file, JSON.stringify(rows));
  const out = JSON.parse(py(`import json, datetime as dt, manager as m
m.CLUB, m.LEAGUE = 'Brentford', 'Premier League'
print(json.dumps(m.alerts(json.load(open(${JSON.stringify(file)})), dt.date(2030, 7, 14))))`));
  assert.deepEqual(out.map(a => [a.name, a.issue]), [['Julian Eyestone', 'regular in Brentford U21'], ['Franculino', 'final year'], ['Kristoffer Ajer', 'no contract']]);
});
