#!/usr/bin/env node
// fm — one command-line entry point for operating FM26 through the bridge.
// Output is JSON (except `screen`). Exit codes: 0 done, 2 needs a decision (read the output),
// 1 error (read the message; do not blindly retry actions that may have run).
import {writeFile} from 'node:fs/promises';
import {getState, request, ui} from '../bridge/client.mjs';
import * as fm from '../ui/index.mjs';
import {control, withLock} from '../tasks/progression/continue.mjs';
import {run} from '../tasks/progression/autopilot.mjs';
import {holiday} from '../tasks/progression/holiday.mjs';
import {listPlayer} from '../tasks/transfers/sell.mjs';
import {buyPlayer} from '../tasks/transfers/buy.mjs';
import {delegateRenewal} from '../tasks/contracts/renew.mjs';
import {transferActivity} from '../tasks/transfers/activity.mjs';
import {journal} from './journal.mjs';
import {doctor} from './doctor.mjs';
import * as friction from './friction.mjs';

const HELP = `fm <command> [args] [--flags]

Look
  status                         game progression state (CanContinue, NeedAction, …)
  screen [filter]                what is on screen: buttons, menus, fields, texts
  overlays                       dialogs/menus/popups open on top of the page
  player "<name>" --club <club>  open a profile; print value, contract, Actions menu

Act
  recover                        close menus/popups/search, answer known dialogs
  click "<label>" [--name <element name>]
  key Escape|Enter|Tab
  continue [steps]               press Continue up to N times (stops when an action is needed)
  run [--until YYYY-MM-DD] [--dry-run]   autopilot (handles routine screens, stops for decisions)
  holiday [--until YYYY-MM-DD | --days N] [--dry-run]

Transfers
  sell "<name>" --club <club> [--price N] [--dry-run]   transfer-list with asking price
  buy "<name>" --club <club> [--open N] [--max N] [--dry-run]
                                 negotiate in one sitting (Suggest Terms) up to --max, then Make Offer
  renew "<name>" --club <club> [--dry-run]              DoF negotiates a new contract
  offers                         our bids/offers in progress (Recruitment → Transfer Activity)

When stuck / setup
  doctor [--fix]                 check game, bridge, save, overlays; --fix starts the bridge
  stuck "<what you tried>"       save a friction report (screen, overlays, recent commands), then STOP
  friction [--all]               list open friction reports
  friction resolve <id> "<fix>"  mark a report fixed (fixer only)
  friction fixture <id> <name>   save the report's screen as test/screens/<name>.json

Bridge
  reload                         reload the agent after editing bridge/agent/*.js
  input-reset                    remove virtual keyboard devices (if real clicks stop working)
  record start | record stop [file.json]   log FM UI calls while you act by hand
`;

const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); flags[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  else pos.push(argv[i]);
}
const [cmd, a1, a2] = pos;
const outcome = journal(argv);
const num = v => v === undefined ? undefined : Number(String(v).replace(/[£,_]/g, '').replace(/m$/i, 'e6').replace(/k$/i, 'e3'));
const dryRun = !!flags['dry-run'];
const out = v => console.log(typeof v === 'string' ? v : JSON.stringify(v, (k, x) => k === 'screen' && x instanceof fm.Screen ? undefined : x, 2));

try {
  switch (cmd) {
    case 'status': { const s = await getState(); out({state: s.stateName, automation: s.automationState, actionReady: s.actionReady, inFlight: s.actionInFlight}); break; }
    case 'screen': out(fm.describe(await fm.Screen.read(), a1)); break;
    case 'overlays': out(fm.overlays(await fm.Screen.read())); break;
    case 'recover': out(await fm.recover()); break;
    case 'click': out(await fm.click(a1, {name: flags.name})); break;
    case 'key': out(await fm.key(a1)); break;
    case 'player': {
      const s = await fm.openPlayer(a1, flags.club);
      out({...fm.profileFacts(s), actions: await fm.peekActions(flags.menu || 'Transfer')});
      break;
    }
    case 'continue': out(await withLock('continue', () => control({maxSteps: Number(a1 || 10)}))); break;
    case 'doctor': { const r = await doctor({fix: !!flags.fix}); out(r); process.exitCode = r.ok ? 0 : 1; break; }
    case 'stuck': out(await friction.stuck(pos.slice(1).join(' '))); break;
    case 'friction':
      if (a1 === 'resolve') out(await friction.resolve(a2, pos.slice(3).join(' ')));
      else if (a1 === 'fixture') out(await friction.fixture(a2, pos[3]));
      else out(await friction.list({all: !!flags.all}));
      break;
    case 'run': { const r = await run({until: flags.until, dryRun}); outcome({reason: r.reason}); out(r); process.exitCode = ['until', 'window-closed'].includes(r.reason) ? 0 : r.reason === 'error' ? 1 : 2; break; }
    case 'holiday': out(await holiday({until: flags.until, days: num(flags.days), dryRun})); break;
    case 'sell': out(await listPlayer(a1, flags.club, {price: num(flags.price), dryRun})); break;
    case 'buy': out(await buyPlayer(a1, flags.club, {open: num(flags.open), max: num(flags.max), dryRun})); break;
    case 'offers': out(await transferActivity()); break;
    case 'renew': out(await delegateRenewal(a1, flags.club, {dryRun})); break;
    case 'reload': out(await request('reload', {timeoutMs: 30000})); break;
    case 'input-reset': out(await ui.removeVirtual()); break;
    case 'record':
      if (a1 === 'start') out(await ui.recordStart());
      else { const r = await ui.recordStop(); if (a2) await writeFile(a2, JSON.stringify(r.events, null, 1)); out({events: r.events.length, saved: a2 || null}); }
      break;
    default: console.log(HELP); if (cmd && cmd !== 'help') process.exitCode = 1;
  }
} catch (e) {
  outcome({error: e.message});
  if (e instanceof fm.NeedsAnalyst) { out({needsAnalyst: e.message, details: e.details}); process.exitCode = 2; }
  else { console.error(e.message); process.exitCode = 1; }
}
