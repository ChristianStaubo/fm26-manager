// `fm doctor [--fix]`: is everything in place to operate the game? Each failed check says how
// to fix it. --fix starts the bridge when the game is running without one (the only safe fix;
// launching the game and loading a save are left to a person).
import {existsSync, mkdirSync, openSync} from 'node:fs';
import {execSync, spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {getState, RUNTIME_DIR} from '../game/bridge/client.mjs';
import {Screen, overlays, settle} from '../game/ui/index.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const first = list => list.filter(Boolean).find(p => existsSync(p)) || null;
const GAME = first([process.env.FM26_GAME_COPY, `${homedir()}/fm26-debug/fm.app`, '/private/tmp/fm26-debug-copy/fm.app']);
const PYTHON = first([process.env.FM26_VENV && `${process.env.FM26_VENV}/bin/python`, `${homedir()}/fm26-debug/venv/bin/python`, '/private/tmp/fm26-bridge-venv/bin/python']);
const pgrep = pattern => { try { return execSync(`pgrep -f ${JSON.stringify(pattern)}`).toString().trim().split('\n').filter(Boolean); } catch { return []; } };

function startBridge() {
  mkdirSync(RUNTIME_DIR, {recursive: true});
  const log = openSync(`${RUNTIME_DIR}/bridge.log`, 'a');
  spawn(PYTHON, ['game/bridge/server.py'], {cwd: REPO, detached: true, stdio: ['ignore', log, log]}).unref();
}

export async function doctor({fix = false} = {}) {
  const checks = [], add = (name, ok, detail, fixHint) => { checks.push({name, ok, detail, ...(ok ? {} : {fix: fixHint})}); return ok; };
  const setup = 'run bridge/setup-macos.sh (copies the game, creates the venv; macOS prunes /private/tmp after idle days and on reboot)';

  add('game copy', !!GAME, GAME, setup);
  // /private/tmp is pruned by macOS after a few idle days: files vanish, the folder stays.
  const frida = PYTHON && (() => { try { return execSync(`"${PYTHON}" -c "import frida; print(frida.__version__)"`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); } catch { return null; } })();
  if (!add('frida venv', !!frida, frida ? `${PYTHON} (frida ${frida})` : PYTHON || 'missing', setup)) return {ok: false, checks};
  const steam = pgrep('steamapps/common/Football Manager 26/fm.app');
  const game = GAME ? pgrep(`${GAME}/Contents/MacOS`) : [];
  if (!add('game running (copy)', game.length > 0, game.length ? `pid ${game[0]}` : 'not running',
    steam.length ? 'the STEAM game is running: quit it and `open` the copy (Frida cannot attach to Steam\'s)' : `ask the user to: open ${GAME} and load the save`))
    return {ok: false, checks};

  let bridge = pgrep('game/bridge/server.py');
  if (!bridge.length && fix && PYTHON) {
    startBridge();
    for (let i = 0; i < 20 && !bridge.length; i++) { await settle(500); bridge = pgrep('game/bridge/server.py'); }
    await settle(3000); // attach + agent load
  }
  if (!add('bridge process', bridge.length === 1, bridge.length ? `pid ${bridge.join(',')}` : 'not running',
    bridge.length > 1 ? 'more than one bridge: kill -INT all but one' : 'fm doctor --fix (starts it), or see bridge/README.md'))
    return {ok: false, checks};

  let state;
  try { state = await getState(); } catch (e) { add('bridge socket', false, e.message, `read ${RUNTIME_DIR}/bridge.log; restart the bridge`); return {ok: false, checks}; }
  add('bridge socket', true, 'answers');
  // After a fresh attach the bridge only knows the Continue call once Continue was pressed.
  const learn = /press Continue/i.test(state.reason || '');
  if (!add('save loaded', state.available && state.active, state.stateName || state.reason || 'no game',
    learn ? 'fm click Continue (once per bridge start: teaches the bridge the Continue call)' : 'ask the user to load the save (claude-*.fm)')) return {ok: false, checks};
  add('continue ready', state.actionReady || state.stateName !== 'CanContinue',`${state.stateName}, actionReady=${state.actionReady}`,
    'fm click Continue once (teaches the bridge the Continue call)');
  const s = await Screen.read(), open = overlays(s);
  add('clean page', !open.length, open.length ? open : 'nothing on top', 'fm recover (or read the dialog: fm overlays)');
  return {ok: checks.every(c => c.ok), date: s.date()?.toISOString().slice(0, 10), checks};
}
