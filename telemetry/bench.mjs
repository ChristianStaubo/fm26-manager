// The workflow bench (docs/workflow-map.md, user 2026-10-19: "verify our own work"): run one fm command,
// time it, count its screen reads and UI actions from the trace, and log the result to local/runs/bench.jsonl.
// The did-it-happen check is a second fm command (--check) whose output is kept with the run.
import {spawnSync} from 'node:child_process';
import {readFileSync, appendFileSync, existsSync, mkdirSync} from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const FILE = `${ROOT}local/runs/bench.jsonl`;
const fm = args => spawnSync('node', [`${ROOT}cli/fm.mjs`, ...args], {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20});
const json = t => { try { return JSON.parse(t); } catch { return null; } };

export function traceSince(startIso) {
  const day = startIso.slice(0, 10), f = `${ROOT}local/runs/trace/${day}.jsonl`;
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => json(l)).filter(r => r && r.t >= startIso);
}

export function bench(workflow, args, {check} = {}) {
  const startIso = new Date().toISOString(), t0 = Date.now();
  const run = fm(args), ms = Date.now() - t0;
  const rows = traceSince(startIso), reads = rows.filter(r => r.op === 'uitree');
  const out = json(run.stdout);
  const verify = check ? fm(check) : null;
  const entry = {at: startIso, workflow, cmd: args.join(' '), ok: run.status === 0, ms,
    reads: reads.length, readMs: reads.reduce((a, r) => a + (r.ms || 0), 0), actions: rows.filter(r => r.op === 'ui' || r.op === 'direct').length,
    game: rows.at(-1)?.game ?? null, outcome: out?.outcome ?? out?.action ?? null,
    error: run.status === 0 ? null : (run.stderr || run.stdout).trim().split('\n')[0].slice(0, 200),
    ...(verify ? {check: check.join(' '), checkOutput: (verify.stdout || '').slice(0, 50000)} : {})};
  mkdirSync(`${ROOT}local/runs`, {recursive: true});
  appendFileSync(FILE, JSON.stringify(entry) + '\n');
  return {...entry, result: out ?? run.stdout.slice(0, 1500)};
}
