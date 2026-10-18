// The numbers we steer by.
//   traceStats: where the time goes (screen reads vs actions, per command) — the A/B test's scoreboard.
//   loopStats:  is the self-healing loop working — game days per stop (like a self-driving car's
//               miles per disengagement) and friction by cause; repeats mean a fix didn't hold.
import {readFileSync, readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {TRACE_DIR} from './trace.mjs';

const RUNS = new URL('../local/runs/', import.meta.url);
const parseLines = text => text.split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });

export function readTrace({since = '0000', until = '9999', run, cmd, dir = TRACE_DIR} = {}) {
  let files = [];
  try { files = readdirSync(dir).filter(f => /^\d{4}-\d\d-\d\d\.jsonl(\.gz)?$/.test(f) && f.slice(0, 10) >= since.slice(0, 10) && f.slice(0, 10) <= until).sort(); } catch { return []; }
  return files.flatMap(f => {
    const raw = readFileSync(new URL(f, dir));
    return parseLines((f.endsWith('.gz') ? gunzipSync(raw) : raw).toString());
  }).filter(l => (!run || l.run === run) && (!cmd || l.cmd === cmd) && l.t >= since);
}

const add = (o, k, ms) => { const x = (o[k] ??= {calls: 0, ms: 0}); x.calls++; x.ms += ms || 0; return x; };
/** Totals per command and per kind of call. A "read" is one full screen read (uitree). */
export function traceStats(lines) {
  const byCmd = {}, byOp = {}, runs = new Set();
  let ms = 0, errors = 0;
  for (const l of lines) {
    runs.add(l.run); ms += l.ms || 0;
    const kind = l.op === 'ui' ? `ui:${l.action}` : l.op;
    add(byOp, kind, l.ms);
    const c = (byCmd[l.cmd || '?'] ??= {runs: new Set(), calls: 0, ms: 0, reads: 0, readMs: 0, gameMs: 0, actions: 0, errors: 0});
    c.runs.add(l.run); c.calls++; c.ms += l.ms || 0;
    if (l.op === 'uitree') { c.reads++; c.readMs += l.ms || 0; c.gameMs += l.gameMs || 0; }
    if (l.op === 'ui') c.actions++;
    if (l.error) { c.errors++; errors++; }
  }
  const round = x => Math.round(x);
  return {
    runs: runs.size, calls: lines.length, seconds: round(ms / 1000), errors,
    byCommand: Object.fromEntries(Object.entries(byCmd).sort((a, b) => b[1].ms - a[1].ms).map(([k, c]) => [k, {
      runs: c.runs.size, calls: c.calls, seconds: round(c.ms / 1000), perRunSeconds: +(c.ms / 1000 / c.runs.size).toFixed(1),
      reads: c.reads, readShare: c.ms ? +(c.readMs / c.ms).toFixed(2) : 0, msPerRead: c.reads ? round(c.readMs / c.reads) : 0,
      gameMsPerRead: c.reads ? round(c.gameMs / c.reads) : 0, actions: c.actions, errors: c.errors}])),
    byCall: Object.fromEntries(Object.entries(byOp).sort((a, b) => b[1].ms - a[1].ms).map(([k, x]) => [k, {calls: x.calls, seconds: round(x.ms / 1000), msEach: round(x.ms / x.calls)}])),
  };
}

// Commands that advance the game, and the outcomes that mean "reached its goal".
export const DRIVERS = new Set(['run', 'cycle', 'holiday', 'continue']);
export const FINISHED = new Set(['until', 'window-closed', 'returned', 'checkpoint']);
const days = (a, b) => a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 864e5) : 0;
/** Per real day: driving commands, how many stopped short, game days advanced, days per stop. */
export function loopStats(journal, friction = []) {
  const byDay = {};
  for (const e of journal) {
    const cmd = e.argv?.find(a => !a.startsWith('--'));
    if (!DRIVERS.has(cmd)) continue;
    const d = (byDay[e.at.slice(0, 10)] ??= {drives: 0, stops: 0, gameDays: 0, reasons: {}});
    d.drives++; d.gameDays += Math.max(0, days(e.gameFrom, e.gameTo));
    const reason = e.reason || (e.error ? 'error' : e.exit ? 'exit ' + e.exit : null);
    if (reason && !FINISHED.has(reason)) { d.stops++; d.reasons[reason] = (d.reasons[reason] || 0) + 1; }
  }
  for (const d of Object.values(byDay)) d.gameDaysPerStop = d.stops ? +(d.gameDays / d.stops).toFixed(1) : null;
  const causes = {}, repeats = [];
  for (const r of friction) {
    if (r.status !== 'resolved') continue;
    causes[r.cause || 'unclassified'] = (causes[r.cause || 'unclassified'] || 0) + 1;
    if (r.repeatOf) repeats.push({id: r.id, repeatOf: r.repeatOf, cause: r.cause});
  }
  return {byDay, frictionByCause: causes, repeats, open: friction.filter(r => r.status === 'open').length,
    note: 'gameDays counts only runs logged with game dates (from 2026-10-18 on)'};
}

export function readJournal(file = new URL('commands.jsonl', RUNS)) {
  try { return parseLines(readFileSync(file, 'utf8')); } catch { return []; }
}
