// Command journal (local/runs/commands.jsonl): every `fm` invocation with its outcome.
// `fm stuck` attaches the recent entries, so a friction report shows what was tried.
import {appendFileSync, mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

const FILE = new URL('../local/runs/commands.jsonl', import.meta.url);

// Call once at startup; the entry is written when the process exits.
export function journal(argv) {
  const start = Date.now(), entry = {at: new Date().toISOString(), argv};
  process.on('exit', code => {
    try {
      mkdirSync(new URL('.', FILE), {recursive: true});
      appendFileSync(FILE, JSON.stringify({...entry, exit: process.exitCode ?? code, ms: Date.now() - start}) + '\n');
    } catch { /* never let logging break a command */ }
  });
  // Commands report their outcome here: a stop reason or an error message.
  return outcome => Object.assign(entry, outcome);
}

export async function recentCommands(n = 15) {
  try { return (await readFile(FILE, 'utf8')).trim().split('\n').filter(Boolean).slice(-n).map(l => JSON.parse(l)); }
  catch { return []; }
}
