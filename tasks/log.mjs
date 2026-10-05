// Append-only decision log (local/runs/decisions.jsonl): every action the tools take.
// Used to count counter-offers per deal and to calibrate the rules afterwards.
import {appendFile, mkdir, readFile} from 'node:fs/promises';

const LOG = new URL('../local/runs/decisions.jsonl', import.meta.url);
export async function log(entry) {
  await mkdir(new URL('.', LOG), {recursive: true});
  await appendFile(LOG, JSON.stringify({at: new Date().toISOString(), ...entry}) + '\n');
}
export async function history() {
  try { return (await readFile(LOG, 'utf8')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); }
  catch { return []; }
}
