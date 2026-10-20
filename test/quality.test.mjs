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

test('moneyball export: the agent\'s copy has no CA / PA / growth columns', () => {
  const d = run(`import json, csv, tempfile, pathlib, squad_report as sr
t = pathlib.Path(tempfile.mkdtemp())
src, dst = t / 'full.csv', t / 'agent.csv'
with open(src, 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['name', 'ca', 'pa', 'growth', 'value']); w.writerow(['X', '187', '193', '6', '1000'])
sr.strip_hidden(src, dst)
print(json.dumps({'header': next(csv.reader(open(dst))), 'hidden_src': sr.has_hidden(src), 'hidden_dst': sr.has_hidden(dst), 'text': dst.read_text()}))`, 'moneyball');
  assert.deepEqual(d.header, ['name', 'value']);
  assert.equal(d.hidden_src, true); assert.equal(d.hidden_dst, false);
  assert.ok(!/187|193/.test(d.text));
});

test('relabel: moneyball output says level / ceiling, keys and text; ability output is untouched', async () => {
  const {relabel} = await import('../capabilities/data.mjs');
  const d = {name: 'Paris', ca: 151, pa: 180, min_ca: 147, buy_min_pa: 180, backup_level: 128, why: 'CA 151 vs his CA 150; PA 180'};
  assert.deepEqual(relabel(d, {m: 'moneyball'}), {name: 'Paris', level: 151, ceiling: 180, min_level: 147, buy_min_ceiling: 180, backup_level: 128, why: 'level 151 vs his level 150; ceiling 180'});
  assert.equal(relabel(d, {keys: false, m: 'moneyball'}).ca, 151, 'files other code reads back keep their keys');
  assert.deepEqual(relabel(d, {m: 'ability'}), d);
});

// The no-leak check on real data: the agent's commands in moneyball mode never print CA / PA. Needs a save
// (skipped without one, e.g. in CI).
const fmOut = args => execFileSync('node', ['cli/fm.mjs', ...args, '--mode', 'moneyball'], {cwd: ROOT, encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'ignore']});
let haveSave = true;
try { execFileSync('python3', ['-c', 'import squad_report as sr; sr.latest_save()'], {cwd: `${ROOT}analysis`, stdio: 'ignore'}); } catch { haveSave = false; }
test('no leak: fm squad / free / xi / scout in moneyball mode print no CA or PA', {skip: !haveSave && 'no FM save on this machine'}, () => {
  for (const args of [['squad'], ['free', '--top', '10'], ['xi'], ['scout']]) {
    const o = fmOut(args);
    assert.ok(o.length > 100, `fm ${args.join(' ')} printed something`);
    assert.doesNotMatch(o, /\bCA\b|\bPA\b|"ca"|"pa"|"growth"/, `fm ${args.join(' ')}`);
  }
  const header = execFileSync('python3', ['-c', 'import os; os.environ["FM_MODE"]="moneyball"; import squad_report as sr; p = sr.export_save("latest"); print(open(p).readline())'], {cwd: `${ROOT}analysis`, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
  assert.ok(!header.split(',').some(c => ['ca', 'pa', 'growth'].includes(c.trim())), 'the agent\'s export has no hidden columns');
});
