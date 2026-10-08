// Friction reports (local/runs/friction/): what the player agent saw when it got stuck.
// The player runs `fm stuck "<what I was trying>"` and stops; the fixer reads the report,
// fixes the owning layer, turns the screen into a test fixture and resolves the report.
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {execSync} from 'node:child_process';
import {getState} from '../bridge/client.mjs';
import {Screen, overlays, describe, isoDate} from '../ui/index.mjs';
import {summarize} from '../tasks/progression/autopilot.mjs';
import {recentCommands} from './journal.mjs';

const DIR = new URL('../local/runs/friction/', import.meta.url);
const SCREENS = new URL('../test/screens/', import.meta.url);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const tryOr = async (fn, fallback) => { try { return await fn(); } catch (e) { return fallback ?? {error: e.message}; } };

export async function stuck(note) {
  if (!note) throw new Error('Say what you were trying: fm stuck "<goal, what you tried, what happened>"');
  await mkdir(DIR, {recursive: true});
  const id = stamp();
  const state = await tryOr(getState);
  const screen = await tryOr(() => Screen.read(), null);
  const report = {
    id, at: new Date().toISOString(), note, status: 'open',
    commit: await tryOr(() => execSync('git rev-parse --short HEAD', {cwd: new URL('..', import.meta.url)}).toString().trim(), null),
    state: state.error ? state : {state: state.stateName, automation: state.automationState, actionReady: state.actionReady},
    date: screen ? isoDate(screen.date()) : null,
    overlays: screen ? overlays(screen) : null,
    screen: screen ? summarize(screen) : null,
    describe: screen ? describe(screen) : null,
    commands: await recentCommands(),
  };
  await writeFile(new URL(`${id}.json`, DIR), JSON.stringify(report, null, 1));
  if (screen) await writeFile(new URL(`${id}.tree.json`, DIR), JSON.stringify(screen.tree));
  return {saved: `local/runs/friction/${id}.json`, id, date: report.date, overlays: report.overlays,
    next: 'Stop here and report the friction id. Do not keep improvising.'};
}

async function reports() {
  const files = (await readdir(DIR).catch(() => [])).filter(f => /^[\d-T]+\.json$/.test(f)).sort();
  return Promise.all(files.map(async f => JSON.parse(await readFile(new URL(f, DIR), 'utf8'))));
}

export async function list({all = false} = {}) {
  return (await reports()).filter(r => all || r.status === 'open')
    .map(r => ({id: r.id, status: r.status, date: r.date, note: r.note, fix: r.fix}));
}

export async function resolve(id, fix) {
  if (!id || !fix) throw new Error('fm friction resolve <id> "<what was fixed, commit>"');
  const file = new URL(`${id}.json`, DIR), r = JSON.parse(await readFile(file, 'utf8'));
  Object.assign(r, {status: 'resolved', fix, resolvedAt: new Date().toISOString()});
  await writeFile(file, JSON.stringify(r, null, 1));
  return {id, status: r.status, fix};
}

// Keep only visible, on-screen nodes and their ancestors: enough for Screen, overlays and
// handlers (carousels park thousands of off-screen nodes).
export function trimTree(tree) {
  const byId = new Map(tree.nodes.map(n => [n.id, n])), keep = new Set();
  const root = tree.nodes.find(n => n.parent === null), [w, h] = root ? [root.bounds[2], root.bounds[3]] : [1680, 1050];
  const onScreen = n => n.visible && n.bounds[2] > 0 && n.bounds[3] > 0 && n.bounds[0] >= 0 && n.bounds[0] < w && n.bounds[1] >= 0 && n.bounds[1] < h;
  for (const n of tree.nodes) if (onScreen(n)) for (let a = n; a && !keep.has(a.id); a = byId.get(a.parent)) keep.add(a.id);
  return {...tree, nodes: tree.nodes.filter(n => keep.has(n.id))};
}

// Copy a report's screen into test/screens/<name>.json.gz (committed; replayed by tests).
export async function fixture(id, name) {
  if (!id || !name) throw new Error('fm friction fixture <id> <name>');
  const tree = JSON.parse(await readFile(new URL(`${id}.tree.json`, DIR), 'utf8'));
  await mkdir(SCREENS, {recursive: true});
  const trimmed = trimTree(tree);
  const gz = gzipSync(JSON.stringify(trimmed));
  await writeFile(new URL(`${name}.json.gz`, SCREENS), gz);
  return {saved: `test/screens/${name}.json.gz`, nodes: trimmed.nodes.length, of: tree.nodes.length, bytes: gz.length};
}
