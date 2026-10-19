// The manager's data: the save export (FM26 Scout) and the Python analysis that reads it.
// Capabilities call `analysis(script, args)` and get compact JSON back. The export is reused
// unless `fresh` (the save changed): exporting takes ~30 s, the analysis ~1 s.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync, readdirSync, statSync} from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
/** config/club.json: club, league, save_pattern. */
export const club = () => JSON.parse(readFileSync(new URL('../config/club.json', import.meta.url), 'utf8'));
export const saveName = () => club().save_pattern.replace(/\.fm$/, '').replace(/[*?]/g, '');
// The exporter names its CSV after the save file (claude-3.1.fm -> claude-3.1.csv): read the export
// of the newest save matching the pattern (skipping FM's "(v02)" backups), not one named after the
// pattern, or a renamed save leaves us reading a stale export (2029-06: a day behind, Kubo "free").
const SAVE_DIR = process.env.FM26_SAVE_DIR || `${process.env.HOME}/Library/Application Support/Sports Interactive/Football Manager 26/games`;
function latestSave() {
  const re = new RegExp('^' + club().save_pattern.replace(/[.]/g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  try {
    return readdirSync(SAVE_DIR).filter(f => re.test(f) && !f.includes(' (v'))
      .map(f => ({f, t: statSync(`${SAVE_DIR}/${f}`).mtimeMs})).sort((a, b) => b.t - a.t)[0]?.f;
  } catch { return null; }
}
export const exportPath = () => `${ROOT}local/exports/${(latestSave() || saveName() + '.fm').replace(/\.fm$/, '')}.csv`;

// The game's date: the export carries none, and the analysis used to guess it from the latest
// signing at our club (2028-02-02 in July 2028: contracts that ended on 30 June looked active).
// Read from the live screen when the game is up, else the last date seen (local/runs/game-date.json).
const DATE_FILE = `${ROOT}local/runs/game-date.json`;
export async function gameDate() {
  try {
    const {Screen, isoDate} = await import('../game/ui/index.mjs');
    const d = await Promise.race([Screen.read().then(s => s.date()), new Promise(r => setTimeout(() => r(null), 4000))]);
    if (d) { const iso = isoDate(d); mkdirSync(`${ROOT}local/runs`, {recursive: true}); writeFileSync(DATE_FILE, JSON.stringify({date: iso})); return iso; }
  } catch { /* game or bridge not running */ }
  try { return JSON.parse(readFileSync(DATE_FILE, 'utf8')).date; } catch { return null; }
}

export function analysis(script, args = [], {fresh = false, input, date} = {}) {
  const csv = !fresh && existsSync(exportPath()) ? ['--csv', exportPath()] : [];
  const out = execFileSync('python3', [`analysis/${script}`, ...args, ...csv],
    {cwd: ROOT, input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'], timeout: 600000, maxBuffer: 64 << 20,
     env: {...process.env, ...(date ? {FM_GAME_DATE: date} : {})}});
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

/** His club, contract end and value in the latest save export (an approval's facts), or null. */
export function exportFacts(name) {
  const code = 'import csv, json, sys, unicodedata\nfold = lambda t: unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower().strip()\nfor p in csv.DictReader(open(sys.argv[1], encoding="utf8")):\n    if fold(p["name"]) == fold(sys.argv[2]):\n        print(json.dumps({"club": p["contract_club"] or p["club"] or None, "until": (p["contract_expires"] or "")[:10] or None, "value": float(p["value"] or 0)})); break';
  try { return JSON.parse(execFileSync('python3', ['-c', code, exportPath(), name], {encoding: 'utf8'}) || 'null'); } catch { return null; }
}
