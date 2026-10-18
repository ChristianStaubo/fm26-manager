// The trace: one line per bridge call (local/runs/trace/<day>.jsonl), stamped with the fm command
// that made it and the last game date seen. It answers "where did the time go" and "what led up to
// this failure". Appends are synchronous (~0.1 ms) and never throw. Tests don't write.
import {appendFileSync, mkdirSync} from 'node:fs';

export const TRACE_DIR = new URL('../local/runs/trace/', import.meta.url);
export const OFF = !!process.env.NODE_TEST_CONTEXT || process.env.FM_TELEMETRY === 'off';

// This process: its run id (shared with the journal and incidents) and the game dates it saw.
export const ctx = {run: process.env.FM_RUN_ID || null, cmd: process.env.FM_CMD || null, gameFrom: null, gameTo: null};
const newId = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '-' + process.pid;
/** Called once by the journal: name this run, and hand the id to child processes. */
export function begin(argv = []) {
  ctx.run ??= newId(); ctx.cmd ??= argv.find(a => !a.startsWith('--')) || null;
  process.env.FM_RUN_ID = ctx.run; process.env.FM_CMD = ctx.cmd || '';
  return ctx;
}
export function sawGameDate(iso) { if (!iso) return; ctx.gameFrom ??= iso; ctx.gameTo = iso; }

// `status` is polled every few seconds (holiday, Continue): keep it only when the state changes.
let lastStatus = null;
export function resetStatus() { lastStatus = null; }
/** The trace line for one request and its answer, or null to skip it. */
export function traceLine(req, ms, {result, error} = {}, at = new Date()) {
  const o = typeof req === 'string' ? {op: req} : req || {};
  if (o.op === 'status' && !error) {
    const s = `${result?.stateName}|${!!result?.actionInFlight}`;
    if (s === lastStatus) return null;
    lastStatus = s;
  }
  const l = {t: at.toISOString(), run: ctx.run, cmd: ctx.cmd, game: ctx.gameTo, op: o.op, ms};
  if (o.action) l.action = o.action;
  const target = [o.expectedName, o.expectedLabel].filter(Boolean).join(' | ');
  if (target) l.target = target.slice(0, 80);
  if (o.op === 'uitree' && result) { l.nodes = result.nodes?.length; l.gameMs = result.elapsedMs; if (result.truncated) l.truncated = true; }
  if (o.op === 'status' && result) l.state = result.stateName;
  if (error) l.error = String(error.message || error).split('\n')[0].slice(0, 200);
  return l;
}

let ready = false;
export const traceFile = (day = new Date().toISOString().slice(0, 10)) => new URL(`${day}.jsonl`, TRACE_DIR);
// Calls made by this process, by kind (before the status filter): benchmarks read these.
export const counts = {};
export function record(req, ms, outcome) {
  const o = typeof req === 'string' ? {op: req} : req || {}, k = o.action ? `${o.op}:${o.action}` : o.op;
  counts[k] = (counts[k] || 0) + 1;
  if (OFF) return;
  try {
    const l = traceLine(req, ms, outcome);
    if (!l) return;
    if (!ready) { mkdirSync(TRACE_DIR, {recursive: true}); ready = true; }
    appendFileSync(traceFile(l.t.slice(0, 10)), JSON.stringify(l) + '\n');
  } catch { /* telemetry never breaks a command */ }
}
