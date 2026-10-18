// fm save (user, 2026-10-15): the HUD's FM menu (dashboard-hud-fm-button) → "Save Game". Verified by
// the newest save file's modification time moving (mapped 2030-07-31). The judge and every analysis
// read the save on disk, so save before `--fresh` exports (else the judge reads a stale squad).
import {statSync, readdirSync, readFileSync, existsSync} from 'node:fs';
import {Screen, click, clickWhere, recover, settle, overlays, type} from '../../game/ui/index.mjs';
import {getState} from '../../game/bridge/client.mjs';
import {club} from '../data.mjs';

const DIR = process.env.FM26_SAVE_DIR || `${process.env.HOME}/Library/Application Support/Sports Interactive/Football Manager 26/games`;
const pattern = () => club().save_pattern;
function newestSave() {
  const re = new RegExp('^' + pattern().replace(/[.]/g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return readdirSync(DIR).filter(f => re.test(f) && !f.includes(' (v')).map(f => ({f, t: statSync(`${DIR}/${f}`).mtimeMs})).sort((a, b) => b.t - a.t)[0] || null;
}

// Save As (user, 2026-10-18: a new save per experiment, the old one kept as the revert point): the same
// menu's "Save Game As" opens a file browser (BrowseFilesSearchAndTypeElement) with one text field holding
// the current name, then Cancel / Save. Afterwards FM plays on in the new file. Mapped 2036-06-04 (claude-3.3).
export async function saveGame({as} = {}) {
  const before = newestSave();
  await recover();
  await clickWhere(s => s.buttons().find(b => b.name === 'dashboard-hud-fm-button'), 'FM menu');
  await settle(1200);
  if (as) {
    if (existsSync(`${DIR}/${as}.fm`)) throw new Error(`${as}.fm already exists: choose a new name (Save As would overwrite it)`);
    await click('Save Game As', {name: 'button-base-label'});
    await settle(1500);
    await type(as);
    await settle(400);
    const typed = (await Screen.read()).items.find(i => i.kind === 'text-field')?.value;
    if (typed !== as) throw new Error(`Save As: the name field reads "${typed}", not "${as}"`);
    await clickWhere(s => s.buttons().find(b => b.label === 'Save' && b.name === 'button-primary-leading-icon-label'), 'Save');
  } else await click('Save Game', {name: 'button-primary-label'});
  for (let i = 0; i < 90; i++) { await settle(1000); if ((await getState()).stateName !== 'Saving') break; }
  await settle(1500);
  const after = newestSave(), open = overlays(await Screen.read());
  return {action: 'save', file: after?.f, saved: !!after && (!before || after.t > before.t) && (!as || after.f === `${as}.fm`), overlays: open};
}
