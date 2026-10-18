// Retention: a day's trace is gzipped once the day is over and deleted after TRACE_DAYS; only the
// newest INCIDENTS incident folders are kept. Runs at most once a day (from the journal), so
// local/runs/trace + local/runs/incidents stay around 200 MB at most.
import {readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {TRACE_DIR, OFF} from './trace.mjs';

export const INCIDENT_DIR = new URL('../local/runs/incidents/', import.meta.url);
export const TRACE_DAYS = 30, INCIDENTS = 50;
const list = dir => { try { return readdirSync(dir); } catch { return []; } };

export function prune({now = new Date(), traceDir = TRACE_DIR, incidentDir = INCIDENT_DIR} = {}) {
  const day = d => d.toISOString().slice(0, 10), today = day(now), cutoff = day(new Date(now - TRACE_DAYS * 864e5));
  const done = {gzipped: [], deleted: []};
  for (const f of list(traceDir).filter(f => /^\d{4}-\d\d-\d\d\.jsonl(\.gz)?$/.test(f))) {
    const file = new URL(f, traceDir);
    if (f.slice(0, 10) < cutoff) { rmSync(file); done.deleted.push(f); }
    else if (f.endsWith('.jsonl') && f.slice(0, 10) < today) {
      writeFileSync(new URL(f + '.gz', traceDir), gzipSync(readFileSync(file)));
      rmSync(file); done.gzipped.push(f);
    }
  }
  const incidents = list(incidentDir).filter(d => /^\d{4}-/.test(d)).sort();
  for (const d of incidents.slice(0, Math.max(0, incidents.length - INCIDENTS))) {
    rmSync(new URL(d + '/', incidentDir), {recursive: true, force: true}); done.deleted.push(d);
  }
  return done;
}

/** prune(), at most once a day (a marker file holds the last day it ran). Never throws. */
export function pruneDaily(now = new Date()) {
  if (OFF) return null;
  try {
    const marker = new URL('.pruned', TRACE_DIR), today = now.toISOString().slice(0, 10);
    try { if (readFileSync(marker, 'utf8').trim() === today) return null; } catch { /* first run */ }
    const done = prune({now});
    mkdirSync(TRACE_DIR, {recursive: true});
    writeFileSync(marker, today);
    return done;
  } catch { return null; }
}
