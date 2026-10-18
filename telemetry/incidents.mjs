// Incidents: when a command fails or the autopilot stops for anything but its goal, save what led up
// to it in local/runs/incidents/<id>/, at that moment (not when someone looks later):
//   error.json        what stopped, where (handler, stack, details), which run and game date
//   NN-<key>.json.gz  the bridge's last screens (black box), oldest first; test-fixture format
//   events.json       the bridge's last requests (reads, clicks, refusals) between those screens
//   trace.jsonl       this run's trace lines
import {mkdir, readFile, readdir, writeFile, copyFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {execSync} from 'node:child_process';
import {request} from '../game/bridge/client.mjs';
import {ctx, OFF, traceFile} from './trace.mjs';
import {INCIDENT_DIR, prune} from './retention.mjs';

const SCREENS = new URL('../test/screens/', import.meta.url);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const tryOr = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/** This run's trace lines (the last `max`), from today's and yesterday's files. */
export async function runTrace(run = ctx.run, {max = 500, now = new Date()} = {}) {
  const days = [new Date(now - 864e5), now].map(d => d.toISOString().slice(0, 10));
  const lines = [];
  for (const d of days) {
    const text = await tryOr(() => readFile(traceFile(d), 'utf8'), '');
    for (const l of text.split('\n')) if (l && (!run || l.includes(`"run":"${run}"`))) lines.push(l);
  }
  return lines.slice(-max);
}

/** Save an incident. `error` may be an Error (its stack is kept) or a message. Never throws. */
export async function capture({reason, why, error, stack, handler, details, argv} = {}) {
  if (OFF) return null;
  try {
    const id = stamp(), dir = new URL(`${id}/`, INCIDENT_DIR);
    await mkdir(dir, {recursive: true});
    const box = await tryOr(() => request({op: 'blackbox'}, {timeoutMs: 20000}), {screens: [], events: [], unavailable: true});
    const screens = box.screens || [];
    for (const [i, s] of screens.entries())
      await writeFile(new URL(`${String(i + 1).padStart(2, '0')}-${s.key}.json.gz`, dir), Buffer.from(s.gz, 'base64'));
    await writeFile(new URL('events.json', dir), JSON.stringify(box.events || [], null, 1));
    await writeFile(new URL('trace.jsonl', dir), (await runTrace()).join('\n') + '\n');
    const report = {
      id, at: new Date().toISOString(), run: ctx.run, cmd: ctx.cmd, argv, game: ctx.gameTo,
      commit: await tryOr(() => execSync('git rev-parse --short HEAD', {cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'ignore']}).toString().trim()),
      reason, why, handler,
      error: error ? String(error.message || error) : undefined, stack: stack || error?.stack, details,
      blackbox: box.unavailable ? 'bridge unavailable' : undefined,
      screens: screens.map(({key, t, last, seen}) => ({key, t, last, seen})),
    };
    await writeFile(new URL('error.json', dir), JSON.stringify(report, null, 1));
    prune();
    return {id, dir: `local/runs/incidents/${id}`, screens: screens.length};
  } catch { return null; }
}

async function ids() { return (await tryOr(() => readdir(INCIDENT_DIR), [])).filter(d => /^\d{4}-/.test(d)).sort(); }
export async function latest({withinMinutes = 30, now = Date.now()} = {}) {
  const id = (await ids()).at(-1);
  if (!id) return null;
  const at = Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)$/, 'T$1:$2:$3Z'));
  return now - at <= withinMinutes * 60e3 ? id : null;
}

export async function list() {
  return Promise.all((await ids()).map(async id => {
    const r = await tryOr(async () => JSON.parse(await readFile(new URL(`${id}/error.json`, INCIDENT_DIR), 'utf8')), {});
    return {id, cmd: r.cmd, game: r.game, reason: r.reason, handler: r.handler, why: (r.why || r.error || '').slice(0, 140), screens: r.screens?.length};
  }));
}

/** What happened, step by step: each saved screen (summarised) and the requests after it. */
export async function show(id) {
  const dir = new URL(`${id}/`, INCIDENT_DIR);
  const report = JSON.parse(await readFile(new URL('error.json', dir), 'utf8'));
  const events = await tryOr(async () => JSON.parse(await readFile(new URL('events.json', dir), 'utf8')), []);
  const files = (await readdir(dir)).filter(f => /^\d\d-.+\.json\.gz$/.test(f)).sort();
  const {Screen} = await import('../game/ui/screen.mjs');
  const {summarize} = await import('../capabilities/season/autopilot.mjs');
  const steps = [];
  for (const [i, f] of files.entries()) {
    const meta = report.screens?.[i] || {}, next = report.screens?.[i + 1]?.t ?? Infinity;
    const s = await tryOr(async () => summarize(new Screen(JSON.parse(gunzipSync(await readFile(new URL(f, dir))).toString()))), {error: 'unreadable'});
    const after = events.filter(e => e.op !== 'uitree' && e.t >= meta.t && e.t < next)
      .map(e => [e.op, e.action, e.target, e.state, e.error && 'ERROR ' + e.error, e.ms + 'ms'].filter(Boolean).join(' '));
    steps.push({screen: f, seen: meta.seen, date: s.date, continue: s.continue, texts: s.texts?.slice(0, 8), buttons: s.buttons?.slice(0, 12), then: after.slice(-15)});
  }
  const {stack, ...rest} = report;
  return {...rest, stack: stack?.split('\n').slice(0, 6), steps};
}

/** Save one of an incident's screens as a test fixture (test/screens/<name>.json.gz). */
export async function fixture(id, n, name) {
  if (!id || !n || !name) throw new Error('fm incident fixture <id> <screen number> <name>');
  const f = (await readdir(new URL(`${id}/`, INCIDENT_DIR))).find(x => x.startsWith(String(n).padStart(2, '0') + '-'));
  if (!f) throw new Error(`No screen ${n} in incident ${id}`);
  await mkdir(SCREENS, {recursive: true});
  await copyFile(new URL(`${id}/${f}`, INCIDENT_DIR), new URL(`${name}.json.gz`, SCREENS));
  return {saved: `test/screens/${name}.json.gz`, from: `local/runs/incidents/${id}/${f}`};
}
