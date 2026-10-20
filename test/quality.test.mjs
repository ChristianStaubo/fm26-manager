// The mode (analysis/quality.py, user 2026-10-20): ability = FM's CA/PA; moneyball = only what a manager sees.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = (code, mode) => JSON.parse(execFileSync('python3', ['-c', code], {cwd: `${ROOT}analysis`, encoding: 'utf8', env: {...process.env, FM_MODE: mode}}));
const rows = `import json, quality as q
A = ['Crossing','Dribbling','Finishing','Heading','Long Shots','Marking','Off The Ball','Passing','Tackling','Vision','Anticipation','Decisions','Positioning','First Touch','Technique','Flair','Teamwork','Work Rate','Acceleration','Strength','Stamina','Pace','Jumping Reach','Balance','Bravery','Aggression','Agility','Determination','Composure','Concentration','Leadership','Handling','Reflexes','One On Ones','Command Of Area','Communication','Kicking','Throwing','Aerial Reach','Rushing Out','Punching','Eccentricity']
def p(key, attr, age=22, value=5e6):
    r = {'key': key, 'name': key, 'club': 'X', 'contract_club': 'X', 'competition': '', 'age': str(age), 'value': str(value), 'ca': '150', 'pa': '170', 'growth': '20',
         'positions': 'ST', 'pos': {'ST'}, 'mins': 0, 'pos_ST': '20', 'pos_GK': '1'}
    r.update({a: str(attr) for a in A}); return r
rows = [p('weak', 8), p('mid', 12), p('good', 15, value=40e6), p('kid', 12, age=18, value=30e6)]
`;

test('ability mode: the rows keep their CA / PA untouched', () => {
  const d = run(rows + `print(json.dumps([(r['ca'], r['pa'], r['growth']) for r in q.apply(rows)]))`, 'ability');
  assert.deepEqual(d[0], ['150', '170', '20']);
});

test('moneyball mode: CA, PA and growth are gone; level rises with the attributes; a valued kid has the higher ceiling', () => {
  const d = run(rows + `out = {r['key']: r for r in q.apply(rows)}
print(json.dumps({k: [int(r['ca']), int(r['pa'])] for k, r in out.items()} | {'leak': any(k in r and r[k] in ('150', '170', '20') for r in out.values() for k in ('ca', 'pa', 'growth')) , 'growth': any('growth' in r for r in out.values())}))`, 'moneyball');
  assert.ok(d.weak[0] < d.mid[0] && d.mid[0] < d.good[0], `levels ${d.weak[0]} < ${d.mid[0]} < ${d.good[0]}`);
  assert.ok(d.kid[1] > d.mid[1], 'an 18-year-old the market values highly has more ceiling than a 22-year-old of the same attributes');
  assert.equal(d.leak, false); assert.equal(d.growth, false);
  for (const [lv, ce] of Object.values(d).filter(Array.isArray)) assert.ok(ce >= lv && lv >= 1 && ce <= 200);
});

test('an unknown mode is refused', () => {
  assert.throws(() => run(`import quality as q; q.mode()`, 'scouting'));
});
