// The manager's data: the save export (FM26 Scout) and the Python analysis that reads it.
// Capabilities call `analysis(script, args)` and get compact JSON back. The export is reused
// unless `fresh` (the save changed): exporting takes ~30 s, the analysis ~1 s.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, appendFileSync, mkdirSync} from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const club = () => JSON.parse(readFileSync(new URL('../config/club.json', import.meta.url), 'utf8'));
export const saveName = () => club().save_pattern.replace(/\.fm$/, '').replace(/[*?]/g, '');
export const exportPath = () => `${ROOT}local/exports/${saveName()}.csv`;

export function analysis(script, args = [], {fresh = false, input} = {}) {
  const csv = !fresh && existsSync(exportPath()) ? ['--csv', exportPath()] : [];
  const out = execFileSync('python3', [`analysis/${script}`, ...args, ...csv],
    {cwd: ROOT, input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'], timeout: 600000, maxBuffer: 64 << 20});
  return JSON.parse(out);
}

// The manager's notebook (playbook §9): lessons per save, read before every window and season.
const notebook = () => `${ROOT}local/notebook/${saveName()}.md`;
export function note(text) {
  if (!text) return existsSync(notebook()) ? readFileSync(notebook(), 'utf8') : '(notebook empty)';
  mkdirSync(`${ROOT}local/notebook`, {recursive: true});
  appendFileSync(notebook(), `- ${new Date().toISOString().slice(0, 10)}: ${text}\n`);
  return {saved: notebook().replace(ROOT, ''), text};
}
