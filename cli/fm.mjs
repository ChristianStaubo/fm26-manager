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
import {listPlayer, unlistPlayer, loanListPlayer} from '../capabilities/sell/list.mjs';
import {buyPlayer} from '../capabilities/buy/buy.mjs';
import {askAgent} from '../capabilities/buy/ask.mjs';
import {preContract} from '../capabilities/buy/precontract.mjs';
import {delegateRenewal, renewSelf} from '../capabilities/contracts/renew.mjs';
import {movePlayer} from '../capabilities/squad/move.mjs';
import {saveGame} from '../capabilities/season/save.mjs';
import {allow as allowWage} from '../capabilities/contracts/wage-exceptions.mjs';
import {transferActivity, deal, answer} from '../game/screens/transfer-activity.mjs';
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
import {watch, watchRunning} from './watch.mjs';
import * as approvals from '../capabilities/approvals.mjs';
import * as interventions from '../capabilities/interventions.mjs';
import {audit} from '../capabilities/audit/audit.mjs';
import * as incidents from '../telemetry/incidents.mjs';
import {readTrace, traceStats, loopStats, readJournal, FINISHED} from '../telemetry/stats.mjs';

const HELP = `fm <command> [args] [--flags]

Look
  status                         game progression state (CanContinue, NeedAction, …)
  screen [filter]                what is on screen: buttons, menus, fields, texts
  overlays                       dialogs/menus/popups open on top of the page
  player "<name>" --club <club>  open a profile; print value, contract, Actions menu

Act
  recover                        close menus/popups/search, answer known dialogs
  click "<label>" [--name <element name>]
  key Escape|Enter|Tab|Space|C
  save [--as <name>]             save the game (FM menu → Save Game); --as: Save Game As a new file (FM plays on in it)
  continue [steps]               press Continue up to N times (stops when an action is needed)
  run [--until YYYY-MM-DD] [--dry-run]   autopilot (handles routine screens, stops for decisions)
  holiday [--until YYYY-MM-DD | --days N] [--dry-run]
  holiday --season [--until YYYY-MM-DD]   holiday to the return date, going again whenever FM ends it
                                 early (the assistant settles pending decisions); long-running
  register ["<name>" …] [--dry-run]  squad registration (open the "squad to be decided" message first):
                                 register the named players, or every unregistered 21+ player; submit
  press [--dry-run]              hold the pending press conference (positive answers), then leave

Manager (decisions; read playbook/PLAYBOOK.md first). JSON; add --fresh after saving the game
  squad [--fresh]                alerts (no contract, regulars in U21), depth, needs, sell candidates, youth (§2)
  cycle [--budget N]             THE LOOP: holiday to the next checkpoint (playbook/cycle.json), run every step, write one report
  verdicts [--checkpoint D]      every row the latest checkpoint raised, with the manager's verdict (missing = '-')
  verdict <step> "<item>" act|propose|pass --why "…" [--price N]   answer one row (propose = needs approval, with a max price)
  verdicts agree --all | agree <step> "<item>" | overturn <step> "<item>" --decided "…" [--rule "…"]
                                 the USER's review (main session only): feeds the autonomy ledger (fm autonomy)
  checkpoint [<name>] [--budget N] [--lens L] [--no-save]   run a checkpoint now (no name: what's next); report in local/reports/checkpoints/
  free [--max-age N] [--min-worth N] [--min-attr N] [--top N] [--fresh]
                                 FIRST at every checkpoint: free agents + contracts ending by 30 June (loanees too),
                                 ranked by what the same attributes/age sell for; January = pre-contract time
  scout [--raw | --ability | --free | --best] [--positions RW,AM] [--budget N] [--per N] [--fresh]
       --best [--max-value N] [--max-wage N] [--max-age N]: simply the best players (CA + stats)
                                 market shortlist: output lens (default), plain stats x league
                                 strength, ability vs market price, free/expiring/fringe (§5)
  review [--max-value N] [--max-age N] [--fresh]
                                 who to sell and who to buy: attribute fit (prediction) + the position's
                                 core stats (evidence) vs PL regulars; best, value and free/expiring (§4-5)
  plan --budget N [--lens moneyball|attributes] [--max-age N] [--max-value N] [--snapshot file.csv] [--fresh]
                                 START OF EVERY WINDOW: alerts, who left/arrived since the last snapshot,
                                 slots, a priced buy list within budget, sell list (proposals for approval)
  window [--slots LB,RW] [--max-value N] [--max-age N] [--bench-max N] [--fresh]
                                 THE window report: every slot of our shape with depth, blended + moneyball
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
  sell "<name>" --club <club> [--min N] [--target N] [--force] [--dry-run]
                                 transfer-list, asking price Unspecified; records our minimum/target
                                 (price book) for the bid handler. --min overrides the minimum.
       [--price N | --deter]     set an asking price instead (re-pricing a player listed before)
  unlist "<name>" --club <club>   take him off the transfer list (and drop his sell approval)
  loanlist "<name>" --club <club> [--why "…"]   list him for loan to develop; loan offers then follow the youth loan rule
  prices                         the price book: listed players with our minimum and target
  precontract "<name>" --club <club> [--preview]   expiring contract: agent chat, Approach To Sign, split; joins free 1 July
  ask "<name>" --club <club>     ask his agent about availability (one-time per player): will he join, fee range, demands
  buy "<name>" --club <club> [--loan-back] [--open N] [--max N] [--wage-max N --replaces "<name>"] [--dry-run]
                                 --wage-max: a swap may pay up to the outgoing player's wage above the cap
                                 negotiate in one sitting (Suggest Terms) up to --max, then Make Offer
  move "<name>" --club <club> [--to senior|u18] [--dry-run]   move one of ours between squads (U21 → senior)
  train-position "<name>" --club <club> --pos DM [--dry-run]   train him in a new position (the user's calls: config/tactic.json plays)
  renew "<name>" --club <club> [--preview] [--dof] [--dry-run]   we negotiate (--preview: stop before Suggest Terms); a new contract (tick rule); --dof: the DoF does
  offers                         our bids/offers in progress (Recruitment → Transfer Activity)
  deal "<player>"                one deal's details (value, wage, actions) from Transfer Activity
  answer "<player>" [--club C] [--upfront N] [--dry-run]   answer his (or club C's) open bid now (incoming-offer handler; no Continue)
  deals [ack "<player>" --days N --why "…"]   tracked deals and their states; ack: a stuck deal we checked, no alert for N days (the deal state machine; observed daily by fm run in a window)
  negotiations                   every sale negotiation: their offer, our ask (%), their reply, gap closed (data for the counter rule)

Approvals (policy.json autonomy: buying and selling need the user's sign-off)
  approvals                      autonomy per capability + the approvals on record
  approve buy "<name>" --max N | approve sell "<name>" --min N [--note "…"]
                                 record the USER's approval (main session only; never the player agent)
  approve revoke buy|sell "<name>"
     [--proposed N]             with approve: the agent's proposed price, so the ledger knows if the user changed it

The judge and the autonomy metric (notes/loop-engineering.md)
  audit [--position N] [--since YYYY-MM-DD] [--friction]
                                 the outside judge: squad, deals vs approvals, contract strings, wages,
                                 net transfer profit, relegation floor. Exit 2 on a failure; --friction files it
  intervene <capability> approved-unchanged|approved-changed|rejected|correction|supervisor-decision|review-agreed|review-overturned
            [--proposed "…"] [--decided "…"] [--rule "…"] [--guard <test>]   log a user decision (main session)
  release "<name>"               the user lets an out-of-contract player go on a free (main session)
  hold "<name>" [--off]          the user is deciding this deal: the autopilot stops on it (main session)
  autonomy                       interventions per capability, streaks, who is eligible for 'auto'

When stuck / setup
  doctor [--fix]                 check game, bridge, save, overlays; --fix starts the bridge
  stuck "<what you tried>"       save a friction report (screen, overlays, recent commands, latest incident), then STOP
  friction [--all]               list open friction reports
  friction resolve <id> "<fix>" --cause new-screen|timing|rule|bug|bridge|data|fixture [--repeat-of <id>]
                                 mark a report fixed (fixer only)
  friction fixture <id> <name>   save the report's screen as test/screens/<name>.json.gz
  friction stats                 is the loop working: game days per stop, friction by cause, repeats

Telemetry (telemetry/README.md: local only, capped)
  trace [--since YYYY-MM-DD] [--run ID] [--cmd C] [--raw [N]]   where the time went: screen reads vs actions, per command
  incidents                      saved incidents (a failure or a stop short of the goal)
  incident <id>                  what led up to it: the last screens, the requests between them, the error
  incident fixture <id> <n> <name>   save the incident's screen n as test/screens/<name>.json.gz

Bridge
  reload                         reload the agent after editing bridge/agent/*.js
  input-reset                    remove virtual keyboard devices (if real clicks stop working)
  watch [--seconds N] [--out file.jsonl]   mapping session: log what changes on screen while the user acts
  record start [--classes A,B] [--pattern re] | record stop [file.json]   log FM calls (UI classes, or any game class) while you act
  explore classes <regex> | explore methods <Class> [regex] [--depth N] | explore fields <Class>   the game's own classes (development)
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

// One operator at a time: a running fm watch invalidates the snapshots acting commands rely on.
const ACTING = new Set(['unlist', 'loanlist', 'precontract', 'save', 'recover', 'click', 'key', 'continue', 'run', 'holiday', 'register', 'press', 'sell', 'buy', 'ask', 'renew', 'move', 'player']);
// A stop short of the goal, or an error in a command that drives the game, saves an incident at that
// moment: the bridge's last screens and requests, the error and its stack (telemetry/incidents.mjs).
const GAME = new Set([...ACTING, 'cycle', 'checkpoint', 'answer', 'offers', 'deal', 'dynamics', 'train-position']);
async function incident(fields) {
  const r = await incidents.capture({argv, ...fields});
  if (r) outcome({incident: r.id});
  return r?.id;
}
const stopFields = r => ({reason: r.reason, why: r.why, error: r.error, stack: r.stack, handler: r.handler, details: r.details});
const shown = ({stack, ...r}) => r;   // stacks go to the incident, not the screen
try {
  if (ACTING.has(cmd) && watchRunning()) throw new Error(`fm watch is recording (pid ${watchRunning()}): stop it before acting, or wait`);
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
      if (a1 === 'resolve') out(await friction.resolve(a2, pos.slice(3).join(' '), {cause: flags.cause, repeatOf: flags['repeat-of']}));
      else if (a1 === 'fixture') out(await friction.fixture(a2, pos[3]));
      else if (a1 === 'stats') out(loopStats(readJournal(), await friction.reports()));
      else out(await friction.list({all: !!flags.all}));
      break;
    case 'trace': {
      const since = flags.since || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const lines = readTrace({since, run: flags.run, cmd: flags.cmd});
      out(flags.raw ? lines.slice(-(flags.raw === true ? 50 : Number(flags.raw))) : {since, ...traceStats(lines)});
      break;
    }
    case 'incidents': out(await incidents.list()); break;
    case 'verdicts': case 'verdict': {
      // The manager's answer to every row of a checkpoint, and the user's review (capabilities/season/verdicts.mjs).
      const cp = await import('../capabilities/season/checkpoint.mjs'), v = await import('../capabilities/season/verdicts.mjs');
      const all = cp.reports().filter(r => r.report?.verdicts);
      const pick = flags.checkpoint ? all.find(r => r.file.includes(flags.checkpoint)) : all.at(-1);
      if (!pick) throw new Error('No checkpoint report with verdicts yet (fm checkpoint / fm cycle writes them from 2026-10-18 on)');
      const base = pick.file.replace(/\.json$/, ''), rows = v.rowsOf(pick.report);
      if (cmd === 'verdict') { out(v.record(base, {step: a1, item: a2, verdict: pos[3], why: flags.why, price: num(flags.price), date: pick.date}, rows)); break; }
      if (a1 === 'agree' || a1 === 'overturn') {   // the USER's review: recorded by the main session, never the player agent
        const {record} = await import('../capabilities/interventions.mjs'), kind = a1 === 'agree' ? 'agreed' : 'overturned';
        if (kind === 'overturned' && !flags.decided) throw new Error('overturn needs --decided "what the user decided instead"');
        const r = v.review(base, pick.report).rows.filter(x => x.verdict && (flags.all ? !x.review : x.step === a2 && x.item.toLowerCase() === String(pos[3] || '').toLowerCase()));
        if (!r.length) throw new Error('No matching verdict: fm verdicts agree --all | agree <step> "<item>" | overturn <step> "<item>" --decided "…"');
        for (const x of r) {
          v.markReview(base, {step: x.step, item: x.item, review: kind, decided: flags.decided});
          record({capability: v.CAPABILITY[x.step] || x.step, kind: v.ledgerKind(x.verdict, kind), date: pick.date, rule: flags.rule || null,
            proposed: `${x.step}: ${x.item} → ${x.verdict}${x.price ? ' ' + x.price : ''} (${x.why})`, decided: kind === 'agreed' ? 'as the manager decided' : flags.decided});
        }
        out({checkpoint: `${pick.date}-${pick.name}`, reviewed: r.length, as: kind}); break;
      }
      const rv = v.review(base, pick.report);
      out({checkpoint: `${pick.date}-${pick.name}`, rows: rv.rows.length, missing: rv.missing, unreviewed: rv.unreviewed,
        season_if_all_proposals: rv.season,   // profit is per season (user, 2026-10-18)
        list: rv.rows.map(x => ({step: x.step, item: x.item, verdict: x.verdict ?? '-', ...(Number.isFinite(x.price) ? {price: x.price} : {}), why: x.why, review: x.review, detail: x.detail}))});
      break;
    }
    case 'incident':
      if (a1 === 'fixture') out(await incidents.fixture(a2, pos[3], pos[4]));
      else out(a1 ? await incidents.show(a1) : await incidents.list());
      break;
    case 'run': {
      const r = await run({until: flags.until, dryRun}); outcome({reason: r.reason});
      if (!FINISHED.has(r.reason)) r.incident = await incident(stopFields(r));
      out(shown(r)); process.exitCode = ['until', 'window-closed'].includes(r.reason) ? 0 : r.reason === 'error' ? 1 : 2; break;
    }
    case 'holiday':
      if (flags.season) {
        const r = await holidaySeason({until: flags.until, onLeg: l => console.error(`leg ${l.leg}: ${l.from} → ${l.to} (${l.continue})`)}); outcome({reason: r.reason});
        if (!FINISHED.has(r.reason)) r.incident = await incident(stopFields(r));
        out(r); process.exitCode = r.reason === 'returned' ? 0 : 2;
      }
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
    case 'plan': {
      if (!flags.budget) throw new Error('fm plan needs --budget N (the transfer budget, e.g. 200m)');
      out(analysis('plan.py', ['--budget', String(num(flags.budget)), ...(flags.snapshot ? ['--snapshot', flags.snapshot] : []),
        ...(flags['max-value'] ? ['--max-value', String(num(flags['max-value']))] : []), ...(flags.lens ? ['--lens', flags.lens] : []),
        ...(flags['max-age'] ? ['--max-age', String(flags['max-age'])] : [])], {fresh: !!flags.fresh, date: await gameDate()}));
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
    case 'checkpoint': case 'cycle': {
      // The season cycle as code (playbook/cycle.json): fm cycle = holiday to the next checkpoint, run it;
      // fm checkpoint <name> = run one now. Every step runs; the report is what we decide from.
      const cp = await import('../capabilities/season/checkpoint.mjs');
      const opts = {budget: flags.budget ? num(flags.budget) : undefined, lens: flags.lens, maxAge: flags['max-age'] ? Number(flags['max-age']) : undefined, save: !flags['no-save']};
      if (cmd === 'cycle') {
        const r = await cp.cycle(opts);
        // Why it stopped goes in the journal (friction stats count it); a stop saves an incident.
        outcome({reason: r.stopped ? r.stopped.reason : 'checkpoint', legs: r.legs?.map(l => l.reason)});
        if (r.stopped) { r.incident = await incident(stopFields(r.stopped)); r.stopped = shown(r.stopped); process.exitCode = 2; }
        out(r.markdown ? {checkpoint: r.checkpoint, date: r.date, files: r.files, report: r.markdown} : r); break;
      }
      if (!a1) { const d = await gameDate(); out({next: cp.nextCheckpoint(d), checkpoints: cp.loadCycle().checkpoints.map(c => `${c.on} ${c.name}: ${c.steps.join(' → ')}`)}); break; }
      const r = await cp.runCheckpoint(a1, opts);
      out({checkpoint: r.checkpoint, date: r.date, files: r.files, report: r.markdown}); break;
    }
    case 'free':
      // Free agents and expiring contracts first (user, 2031-05-28): worth = what the same attributes
      // and age sell for; route = sign now, or a pre-contract from January (fm precontract).
      out(analysis('free_agents.py', [...['max-age', 'top', 'min-attr'].filter(f => flags[f]).flatMap(f => [`--${f}`, String(flags[f])]),
        ...(flags['min-worth'] ? ['--min-worth', String(num(flags['min-worth']))] : [])], {fresh: !!flags.fresh, date: await gameDate()}));
      break;
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
    case 'sell': {
      const r = await listPlayer(a1, flags.club, {price: num(flags.price), deter: !!flags.deter, min: num(flags.min), target: num(flags.target), force: !!flags.force, dryRun});
      // A re-price (--price) used to skip the price book: the bid handler then had no floor (Brown,
      // Ørjasæter, 2030-07-31). Record --min whenever it is given.
      if (flags.min && !dryRun && !r.recorded && r.minimum == null) { pricebook.record({name: a1, club: flags.club, range: null, minimum: num(flags.min), target: Math.max(num(flags.min), num(flags.target) || 0, r.askingSet || 0), why: 'set with --min', listed: r.date || null}); r.minimum = num(flags.min); r.recorded = true; }
      out(r); break;
    }
    case 'buy': {
      // A swap may pay up to the outgoing player's wage above the cap (playbook §5).
      if (flags['wage-max'] && !dryRun) allowWage(a1, num(flags['wage-max']), `swap${flags.replaces ? ': replaces ' + flags.replaces : ''}`);
      out(await buyPlayer(a1, flags.club, {open: num(flags.open), max: num(flags.max), dryRun, ask: !flags['no-ask'], loanBack: !!flags['loan-back']})); break;
    }
    case 'approvals': out({autonomy: Object.fromEntries(Object.entries(approvals.loadPolicy().autonomy || {}).filter(([k]) => !k.startsWith('_'))), ...approvals.load()}); break;
    case 'approve':
      if (a1 === 'revoke') out(approvals.revoke(a2, pos[3]));
      else {
        const e = approvals.approve(a1, a2, {max: num(flags.max), min: num(flags.min), note: flags.note});
        // The ledger: approved as the agent proposed it, or changed by the user.
        if (flags.proposed) interventions.record({capability: a1, kind: Math.abs(num(flags.proposed) - e.limit) < 1 ? 'approved-unchanged' : 'approved-changed',
          proposed: `${a2} at ${num(flags.proposed)}`, decided: `${a2} at ${e.limit}`, date: await gameDate()});
        out(e);
      }
      break;
    case 'audit': {
      const date = await gameDate(), season = date ? `${date.slice(0, 4) - (date.slice(5, 7) < '07' ? 1 : 0)}-07-01` : null;
      let alerts = [];
      try { alerts = analysis('manager.py', ['squad'], {date}).alerts || []; } catch (e) { alerts = []; }
      const r = await audit({alerts, position: flags.position ? Number(flags.position) : undefined, since: flags.since || season});
      if (!r.ok && flags.friction) r.friction = await friction.stuck(`audit failed: ${r.fail.join(' | ')}`);
      out(r); process.exitCode = r.ok ? 0 : 2; break;
    }
    case 'intervene': out(interventions.record({capability: a1, kind: a2, proposed: flags.proposed, decided: flags.decided, rule: flags.rule, guard: flags.guard, date: await gameDate()})); break;
    case 'autonomy': out(interventions.summary()); break;
    case 'release': out(a1 ? approvals.release(a1) : {released: approvals.load().released || []}); break;
    case 'hold': out(a1 ? approvals.hold(a1, {off: !!flags.off}) : {holds: approvals.load().holds || []}); break;   // no name: list
    case 'ask': out(await askAgent(a1, flags.club, {dryRun})); break;
    case 'precontract': out(await preContract(a1, flags.club, {preview: !!flags.preview, dryRun})); break;
    case 'offers': out(await transferActivity()); break;
    case 'deal': out(await deal(a1)); break;
    case 'answer': out(await answer(a1, {club: flags.club, upfront: num(flags.upfront), dryRun})); break;
    case 'deals': {
      const st = await import('../capabilities/deals/store.mjs');
      if (a1 === 'ack') { const {gameDate} = await import('../capabilities/data.mjs'); const t = await gameDate(); const {addDays} = await import('../capabilities/season/season.mjs'); const until = addDays(t, num(flags.days) || 3); out(st.ack(a2, until, flags.why || '')); }
      else out(st.load());
      break;
    }
    case 'negotiations': { const {report} = await import('../capabilities/sell/negotiations.mjs'); out(await report()); break; }
    case 'renew': out(await (flags.dof ? delegateRenewal : renewSelf)(a1, flags.club, {dryRun, preview: !!flags.preview})); break;   // we negotiate (tick rule); --dof hands over
    case 'save': { const r = await saveGame({as: flags.as}); out(r); process.exitCode = r.saved ? 0 : 1; break; }
    case 'loanlist': out(await loanListPlayer(a1, flags.club, {why: flags.why || '', dryRun})); break;
    case 'unlist': { const r = await unlistPlayer(a1, flags.club, {dryRun}); if (r.changed) approvals.revoke('sell', a1); out(r); break; }
    case 'move': out(await movePlayer(a1, flags.club, {to: flags.to || 'senior', dryRun})); break;
    case 'train-position': out(await (await import('../capabilities/squad/train-position.mjs')).trainPosition(a1, flags.club, flags.pos, {dryRun})); break;
    case 'watch': out(await watch({seconds: Number(flags.seconds || 300), interval: Number(flags.interval || 1000), out: flags.out})); break;
    case 'reload': out(await request('reload', {timeoutMs: 30000})); break;
    case 'explore': {   // development: find the game's own objects and methods (game/bridge/agent/70-explore.js)
      const {explore} = await import('../game/bridge/client.mjs');
      out(await explore(a1, a1 === 'classes' ? {pattern: a2, limit: num(flags.limit)} : a1 === 'capture' ? {name: a2, method: pos[3], depth: num(flags.depth), count: num(flags.count), argc: num(flags.argc)}
        : a1 === 'find' ? {pattern: a2, classes: flags.classes, params: flags.params, limit: num(flags.limit)}
        : {name: a2, pattern: pos[3], depth: num(flags.depth), limit: num(flags.limit)}));
      break;
    }
    case 'input-reset': out(await ui.removeVirtual()); break;
    case 'record':
      if (a1 === 'start') out(await ui.recordStart(flags.classes ? String(flags.classes).split(',') : undefined, flags.pattern));
      else {
        // The bridge hands the events over once: always keep them (2034-01-01, a missing folder lost a
        // recording of the user). A default file under local/runs/recordings, plus the one asked for.
        const r = await ui.recordStop(), {mkdirSync, writeFileSync} = await import('node:fs');
        const dir = 'local/runs/recordings', file = `${dir}/recording-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        mkdirSync(dir, {recursive: true});
        writeFileSync(file, JSON.stringify(r.events, null, 1));
        if (a2) { const {dirname} = await import('node:path'); mkdirSync(dirname(a2), {recursive: true}); writeFileSync(a2, JSON.stringify(r.events, null, 1)); }
        out({events: r.events.length, saved: [file, a2].filter(Boolean)});
      }
      break;
    default: console.log(HELP); if (cmd && cmd !== 'help') process.exitCode = 1;
  }
} catch (e) {
  outcome({error: e.message});
  const id = GAME.has(cmd) && !/Bridge is not running/.test(e.message)
    ? await incident({reason: e instanceof fm.NeedsAnalyst ? 'needs-analyst' : 'error', error: e, details: e.details}) : null;
  if (e instanceof fm.NeedsAnalyst) { out({needsAnalyst: e.message, details: e.details, ...(id ? {incident: id} : {})}); process.exitCode = 2; }
  else { console.error(e.message + (id ? `\n(incident saved: fm incident ${id})` : '')); process.exitCode = 1; }
}
