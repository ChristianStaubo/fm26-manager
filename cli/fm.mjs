#!/usr/bin/env node
// fm — one command-line entry point for operating FM26 through the bridge.
// Output is JSON (except `screen`). Exit codes: 0 done, 2 needs a decision (read the output),
// 1 error (read the message; do not blindly retry actions that may have run).
import {writeFile} from 'node:fs/promises';
import {getState, request, ui} from '../game/bridge/client.mjs';
import * as fm from '../game/ui/index.mjs';
import {control, withLock} from '../capabilities/season/continue.mjs';
import {run} from '../capabilities/season/autopilot.mjs';
import {holiday, holidaySeason} from '../capabilities/season/holiday.mjs';
import {listPlayer} from '../capabilities/sell/list.mjs';
import {buyPlayer} from '../capabilities/buy/buy.mjs';
import {delegateRenewal} from '../capabilities/contracts/renew.mjs';
import {allow as allowWage} from '../capabilities/contracts/wage-exceptions.mjs';
import {transferActivity, deal} from '../game/screens/transfer-activity.mjs';
import {pressConference} from '../game/screens/admin/press.mjs';
import {log} from '../capabilities/log.mjs';
import {summarize} from '../capabilities/season/autopilot.mjs';
import * as pricebook from '../capabilities/value/pricebook.mjs';
import {register} from '../game/screens/admin/registration.mjs';
import {analysis, note, gameDate} from '../capabilities/data.mjs';
import {dynamics} from '../game/screens/dynamics.mjs';
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
  holiday --season [--until YYYY-MM-DD]   holiday to the return date, going again whenever FM ends it
                                 early (the assistant settles pending decisions); long-running
  register ["<name>" …] [--dry-run]  squad registration (open the "squad to be decided" message first):
                                 register the named players, or every unregistered 21+ player; submit
  press [--dry-run]              hold the pending press conference (positive answers), then leave

Manager (decisions; read playbook/PLAYBOOK.md first). JSON; add --fresh after saving the game
  squad [--fresh]                depth per position, needs, sell candidates, youth (playbook §2)
  scout [--raw | --ability | --free | --best] [--positions RW,AM] [--budget N] [--per N] [--fresh]
       --best [--max-value N] [--max-wage N] [--max-age N]: simply the best players (CA + stats)
                                 market shortlist: output lens (default), plain stats x league
                                 strength, ability vs market price, free/expiring/fringe (§5)
  review [--max-value N] [--max-age N] [--fresh]
                                 who to sell and who to buy: attribute fit (prediction) + the position's
                                 core stats (evidence) vs PL regulars; best, value and free/expiring (§4-5)
  window [--slots LB,RW] [--max-value N] [--max-age N] [--bench-max N] [--fresh]
                                 THE window report: every 4-2-3-1 slot with depth, blended + moneyball
                                 scores, best/value/bench/free targets and the sell list. Run it in the
                                 first days of July (after the rollover, before the first league match)
  results [--label "…"] [--position N] [--points N] [--fresh]
                                 scoreboard row (money + table) into local/reports/<save>-results.md
  xi [--fresh]                   suggested starting XI for our tactic (§7)
  value "<name>" [--range LOW,HIGH] [--fresh]   our minimum/target for one of OUR players (§3)
  price "<name>"                 any player (targets): open at, walk away above, wage vs our cap (§5)
  dynamics                       read the squad hierarchy (open Squad → Dynamics → Hierarchy first) (§4)
  note ["lesson"]                append a lesson to the notebook, or print it (§9)

Transfers
  sell "<name>" --club <club> [--min N] [--force] [--dry-run]
                                 transfer-list, asking price Unspecified; records our minimum/target
                                 (price book) for the bid handler. --min overrides the minimum.
       [--price N | --deter]     set an asking price instead (re-pricing a player listed before)
  prices                         the price book: listed players with our minimum and target
  buy "<name>" --club <club> [--open N] [--max N] [--wage-max N --replaces "<name>"] [--dry-run]
                                 --wage-max: a swap may pay up to the outgoing player's wage above the cap
                                 negotiate in one sitting (Suggest Terms) up to --max, then Make Offer
  renew "<name>" --club <club> [--dry-run]              DoF negotiates a new contract
  offers                         our bids/offers in progress (Recruitment → Transfer Activity)
  deal "<player>"                one deal's details (value, wage, actions) from Transfer Activity

When stuck / setup
  doctor [--fix]                 check game, bridge, save, overlays; --fix starts the bridge
  stuck "<what you tried>"       save a friction report (screen, overlays, recent commands), then STOP
  friction [--all]               list open friction reports
  friction resolve <id> "<fix>"  mark a report fixed (fixer only)
  friction fixture <id> <name>   save the report's screen as test/screens/<name>.json.gz

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
    case 'click': {
      // Decisions taken by hand are logged like a handler's, with the screen they were taken on.
      const decision = /^(Accept|Reject|Decline|Confirm|Withdraw|Cancel Offer|Accept Offer|Reject Offer|Accept Invitation|Reject Invitation|Accept Demands|Delay Transfer)$/.test(a1);
      const before = decision ? summarize(await fm.Screen.read()) : null;
      out(await fm.click(a1, {name: flags.name}));
      if (decision) await log({action: 'manual-click', label: a1, date: before.date, screen: before.texts.slice(0, 6)});
      break;
    }
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
    case 'holiday':
      if (flags.season) { const r = await holidaySeason({until: flags.until, onLeg: l => console.error(`leg ${l.leg}: ${l.from} → ${l.to} (${l.continue})`)}); outcome({reason: r.reason}); out(r); process.exitCode = r.reason === 'returned' ? 0 : 2; }
      else out(await holiday({until: flags.until, days: num(flags.days), dryRun}));
      break;
    case 'prices': out(Object.values(pricebook.load().players)); break;
    case 'register': out(await register(pos.slice(1), {dryRun})); break;
    case 'squad': out(analysis('manager.py', ['squad'], {fresh: !!flags.fresh, date: await gameDate()})); break;
    case 'scout': out(analysis('manager.py', ['scout', ...['raw', 'ability', 'free', 'best', 'include-loans'].filter(f => flags[f]).map(f => `--${f}`),
      ...['max-value', 'max-wage', 'max-age'].filter(f => flags[f]).flatMap(f => [`--${f}`, String(f === 'max-age' ? flags[f] : num(flags[f]))]), ...(flags.positions ? ['--positions', flags.positions] : []),
      ...(flags.budget ? ['--budget', String(num(flags.budget))] : []), ...(flags.per ? ['--per', String(flags.per)] : [])], {fresh: !!flags.fresh, date: await gameDate()})); break;
    case 'review': {
      // Squad review: sell / buy (best, value, free-expiring) on attributes + core stats (scorecard).
      const date = await gameDate();
      out(analysis('review.py', ['--json', ...(date ? ['--date', date] : []),
        ...['max-value', 'max-age'].filter(f => flags[f]).flatMap(f => [`--${f}`, String(f === 'max-age' ? flags[f] : num(flags[f]))])], {fresh: !!flags.fresh, date}));
      break;
    }
    case 'window': {
      // The standard window report: every slot, depth, blended + moneyball scores, best/value/bench/free, sell list.
      const date = await gameDate();
      const r = analysis('window.py', ['--json', ...(flags.slots ? ['--slots', flags.slots] : []),
        ...['max-value', 'max-age', 'bench-max'].filter(f => flags[f]).flatMap(f => [`--${f}`, String(f === 'max-age' ? flags[f] : num(flags[f]))])], {fresh: !!flags.fresh, date});
      out(r); break;
    }
    case 'results': {
      // Scoreboard row (window close / season end): money + table into local/reports/<save>-results.md.
      const date = await gameDate();
      out(analysis('results.py', ['--date', date || new Date().toISOString().slice(0, 10), ...(flags.label ? ['--label', flags.label] : []),
        ...['position', 'points'].filter(f => flags[f]).flatMap(f => [`--${f}`, String(flags[f])])], {fresh: !!flags.fresh, date}));
      break;
    }
    case 'xi': out(analysis('manager.py', ['xi'], {fresh: !!flags.fresh, date: await gameDate()})); break;
    case 'price': out(analysis('manager.py', ['price', a1 || ''], {fresh: !!flags.fresh, date: await gameDate()})); break;
    case 'value': {
      const range = flags.range ? String(flags.range).split(',').map(num) : undefined;
      out(analysis('evaluate_offer.py', ['--price'], {fresh: !!flags.fresh, input: JSON.stringify({player: a1, date: await gameDate() ?? new Date().toISOString().slice(0, 10), ...(range ? {value_range: range} : {})})}));
      break;
    }
    case 'dynamics': out(await dynamics()); break;
    case 'note': out(note(pos.slice(1).join(' '))); break;
    case 'press': out(await pressConference({dryRun})); break;
    case 'sell': out(await listPlayer(a1, flags.club, {price: num(flags.price), deter: !!flags.deter, min: num(flags.min), force: !!flags.force, dryRun})); break;
    case 'buy': {
      // A swap may pay up to the outgoing player's wage above the cap (playbook §5).
      if (flags['wage-max'] && !dryRun) allowWage(a1, num(flags['wage-max']), `swap${flags.replaces ? ': replaces ' + flags.replaces : ''}`);
      out(await buyPlayer(a1, flags.club, {open: num(flags.open), max: num(flags.max), dryRun})); break;
    }
    case 'offers': out(await transferActivity()); break;
    case 'deal': out(await deal(a1)); break;
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
