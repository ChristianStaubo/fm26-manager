// Autopilot: press Continue; when the game needs an action, run the matching handler
// (transfers, admin). Stops — and returns a screen summary — for anything that needs judgment.
//
// Stop reasons: 'until' (date reached), 'window-closed', 'needs-analyst' (no handler, or a
// handler escalated), 'unfamiliar-state', 'decision-limit', 'error' (do not retry blindly).
import {getState} from '../../game/bridge/client.mjs';
import {Screen, NeedsAnalyst, isoDate, settle, click} from '../../game/ui/index.mjs';
import {control, withLock} from './continue.mjs';
import {loadRules} from '../sell/decide.mjs';
import {windowEnd, inWindow} from './season.mjs';
import {HANDLERS as TRANSFER_HANDLERS} from '../../game/screens/transfer-offers.mjs';
import {HANDLERS as ADMIN_HANDLERS} from '../../game/screens/admin/handlers.mjs';
import {offersSummary} from '../../game/screens/transfer-activity.mjs';
import {handBackContract} from '../contracts/personal-terms.mjs';
import {pressConference} from '../../game/screens/admin/press.mjs';

export const HANDLERS = [...TRANSFER_HANDLERS, handBackContract, offersSummary, ...ADMIN_HANDLERS];

// What the analyst needs to see: the open message (sidebar excluded) and its buttons.
export function summarize(s) {
  const main = i => i.bounds[0] > 480;
  return {date: isoDate(s.date()), continue: s.continueLabel(),
    texts: s.items.filter(i => i.kind === 'text' && main(i) && i.label.length > 1).map(i => i.label).slice(0, 60),
    buttons: [...new Set(s.items.filter(i => i.kind === 'button' && i.enabled && main(i) && i.label && !/^\d+'/.test(i.label)).map(i => i.label.slice(0, 80)))].slice(0, 30)};
}

/** run({until?: 'YYYY-MM-DD', maxDecisions?, dryRun?}) — without `until`, stops when the current
 *  (or, before it opens, the coming) transfer window closes. */
// The fresh-load hand-off: the game can continue, the bridge hasn't seen Continue pressed yet.
export const firstContinue = (st, label) => st.stateName === 'CanContinue' && !st.actionReady && /^Continue$/.test(label || '');

/** The game stops for a match (Continue slot "Go To Match" / "Review Team Selection" (2032-01-01), a match/team-talk state …). */
export const isMatchDay = (st, label) => /match|team selection/i.test(label || '') || /match|teamtalk/i.test(st?.stateName || '');

export function run({until, maxDecisions = 30, dryRun = false} = {}) {
  return withLock('autopilot', async () => {
    const stopAt = until ? new Date(until + 'T00:00:00Z') : null;
    const decisions = [];
    let handoffs = 0, lastAction = null, closes = null, pressedOnce = false, lastMatchDay = null, lastReturn = null, dealsDay = null, retried = null;
    let hard = null;
    const stop = (reason, extra = {}) => { if (hard) clearInterval(hard); return {reason, decisions, ...extra}; };
    // Watchdog (user, 2032-07-12: "surely we need something to catch when we get stuck"): no new game
    // date and no decision for watchdog_minutes → save a stuck report and stop, never hang silently.
    let progressAt = Date.now(), lastDate = null, lastCount = 0;
    const limitMs = (loadRules().autopilot?.watchdog_minutes ?? 5) * 60e3;
    // A step that hangs inside the loop (a wait that never returns) is caught by a timer beside it.
    hard = setInterval(async () => {
      if (Date.now() - progressAt < limitMs + 120e3) return;
      clearInterval(hard);
      try { const {stuck} = await import('../../cli/friction.mjs'); await stuck(`autopilot hard watchdog: a step hung, no progress for ${Math.round((limitMs + 120e3) / 60e3)} min on ${lastDate}`); } catch {}
      console.log(JSON.stringify({reason: 'stalled', why: 'a step hung (hard watchdog)', date: lastDate, decisions}));
      process.exit(3);
    }, 30e3);
    hard.unref?.();
    for (;;) {
      if (decisions.length !== lastCount) { lastCount = decisions.length; progressAt = Date.now(); }
      if (Date.now() - progressAt > limitMs) {
        let report = null;
        try { const {stuck} = await import('../../cli/friction.mjs'); report = await stuck(`autopilot watchdog: no progress for ${Math.round(limitMs / 60e3)} min on ${lastDate}`); } catch {}
        return stop('stalled', {why: `no new game date or decision for ${Math.round(limitMs / 60e3)} minutes`, date: lastDate, report, screen: summarize(await Screen.read().catch(() => null) || {texts: () => [], buttons: () => []})});
      }
      const r = await control({maxSteps: stopAt ? 3 : 10});
      if (['error', 'unavailable'].includes(r.reason)) return stop(r.reason, {error: r.error});
      const s = await Screen.read(), today = s.date();
      if (today && isoDate(today) !== lastDate) { lastDate = isoDate(today); progressAt = Date.now(); }
      // Once per game day in a window: observe the deals (state machine, capabilities/deals). A deal
      // stuck, vanished before signing, or in a state we don't know stops us (2032-01 wonderkids).
      if (today && !dryRun && isoDate(today) !== dealsDay && inWindow(today)) {
        dealsDay = isoDate(today);
        try {
          const {transferActivity} = await import('../../game/screens/transfer-activity.mjs');
          const {observe} = await import('../deals/store.mjs');
          const a = await transferActivity(), r = await observe(dealsDay, a.rows);
          // A signing gone from Transfer Activity has usually completed (Burton, Collins, Luna): his
          // profile then shows our squad actions (Training). Only a real collapse stops us.
          for (const x of r.alerts.filter(x => x.kind === 'vanished' && x.dir === 'in')) {
            try {
              const nav = await import('../../game/ui/navigate.mjs'), {readFileSync} = await import('node:fs');
              const club = JSON.parse(readFileSync(new URL('../../config/club.json', import.meta.url))).club;
              await nav.openPlayer(x.player, club);
              const {top} = await nav.peekActions();
              const {resolveVanished} = await import('../deals/store.mjs');
              const ours = top.includes('Training');
              resolveVanished(x.player, ours, dealsDay);
              if (ours) { x.stop = false; x.resolved = 'completed'; }
            } catch { /* keep the stop: look by hand */ }
          }
          const stops = r.alerts.filter(x => x.stop);
          if (stops.length) return stop('needs-analyst', {handler: 'deals', why: stops.map(x => `${x.kind}: ${x.player || x.stage}${x.from ? ' from ' + x.from : ''}${x.state ? ' (' + x.state + ', ' + x.days + ' days)' : ''}`).join('; '), alerts: r.alerts});
        } catch (e) { decisions.push({action: 'deals-observe', error: e.message}); }
      }
      if (stopAt && today && today >= stopAt) return stop('until', {date: isoDate(today)});
      if (!stopAt && today && !closes) closes = windowEnd(today);
      if (closes && today > closes) return stop('window-closed', {date: isoDate(today), closed: isoDate(closes)});
      if (r.reason === 'handoff') {
        const st = await getState();
        // Press conferences block Continue; answer them (tasks/admin/press.mjs).
        if (st.stateName === 'PressConference' && !dryRun) {
          if (lastAction === 'press') return stop('needs-analyst', {why: 'press conference still pending after handling it', screen: summarize(s)});
          lastAction = 'press';
          try { decisions.push(await pressConference()); continue; }
          catch (e) { return stop(e instanceof NeedsAnalyst ? 'needs-analyst' : 'error', {handler: 'press-conference', why: e.message, details: e.details, screen: summarize(await Screen.read())}); }
        }
        // A button in the Continue slot ("News Site", …) is what a person would press next.
        const label = s.continueLabel();
        if (label && !/^(Continue|Processing)/.test(label) && ++handoffs <= 3) {
          try { await click(label, {name: 'continue-button'}); } catch (e) { /* re-read below */ }
          await settle(1500); continue;
        }
        if (st.automationState === 'ready' && ++handoffs <= 3) continue;
        // Fresh load: until Continue is pressed once by hand the bridge can't drive it (CanContinue,
        // actionReady=false). Press it, as a person would (friction 2026-10-14T08-09-28: two runs
        // stopped on 'unfamiliar-state' with no reason).
        if (firstContinue(st, label) && !pressedOnce) {
          pressedOnce = true;
          try { await click(label, {name: 'continue-button'}); } catch (e) { /* re-read below */ }
          await settle(2500); continue;
        }
        // A match day (user, 2031-08-08): never play or sim it ourselves; holiday one day and let the
        // assistant take the match, then carry on handling the window. Logged so new labels show up.
        // Team Selection has no date on screen (FA Cup at Arsenal, 2032-01-09): key the no-progress
        // guard on the screen date when there is one, else on the last holiday's return date.
        const matchKey = today ? isoDate(today) : `after ${lastReturn}`;
        if (isMatchDay(st, label) && !dryRun && lastMatchDay !== matchKey) {
          lastMatchDay = matchKey;   // a second match-day stop at the same point: no progress, stop
          const {matchDay} = await import('./holiday.mjs');
          try { const h = await matchDay(); lastReturn = h.returns; decisions.push({...h, state: st.stateName, continueLabel: label}); } catch (e) { return stop('error', {handler: 'match-day', error: e.message, doNotRetryAutomatically: true}); }
          handoffs = 0; continue;
        }
        return stop('unfamiliar-state', {state: st.stateName, automation: st.automationState, actionReady: st.actionReady, continueLabel: label,
          why: `hand-off the autopilot can't resolve: state ${st.stateName}, automation ${st.automationState}, actionReady ${st.actionReady}, Continue slot "${label || '-'}"`, screen: summarize(s)});
      }
      handoffs = 0;
      if (r.reason !== 'required-action') continue;
      if (decisions.length >= maxDecisions) return stop('decision-limit', {screen: summarize(s)});
      let screen = s, handler = HANDLERS.find(h => h.match(screen));
      if (!handler && screen.continueLabel() && !/^(Continue|Processing)/.test(screen.continueLabel())) {
        // The task may not be on screen (e.g. the player was on another page): the button in the
        // Continue slot ("Response Required", …) goes to it, as it does for a person.
        try { await click(screen.continueLabel(), {name: 'continue-button'}); } catch (e) { await settle(1500); }
        await settle(1500);
        screen = await Screen.read();
        handler = HANDLERS.find(h => h.match(screen));
      }
      if (!handler) return stop('needs-analyst', {why: 'no handler for this screen', screen: summarize(screen)});
      // Loop guard: the same handler on the same screen twice means its action had no effect.
      const key = handler.name + '|' + screen.texts().join('|').slice(0, 2000);
      if (key === lastAction) return stop('needs-analyst', {handler: handler.name, why: `${handler.name} had no effect (screen unchanged after acting)`, screen: summarize(screen)});
      lastAction = key;
      try {
        const done = await handler.run(screen, {dryRun}); decisions.push(done); await settle(1000);
        // A sale agreed (we accepted, or they accepted our counter): stop so the replacement or the
        // planned follow-up buy happens now (user, 2032-07-02: Muharemović → Natali, Savinho → a winger).
        if (!dryRun && done?.action === 'incoming-offer' && (done.decision?.action === 'accept' || done.accepted))
          return stop('needs-analyst', {handler: handler.name, why: `sold ${done.offer?.player} to ${done.offer?.club} (${done.offer?.total ?? done.offer?.guaranteed}): follow-up buy?`, sale: done});
      }
      catch (e) {
        // The page changed under the handler before it clicked anything ("UI content changed (no X
        // yet)": McAidoo's injury, Backhaus's confirmation): reopen it from the Continue slot, retry once.
        if (/UI content changed/.test(e.message) && retried !== key) {
          retried = key;
          const label = (await Screen.read()).continueLabel();
          if (label && !/^(Continue|Processing)/.test(label)) { try { await click(label, {name: 'continue-button'}); } catch {} }
          await settle(2000); lastAction = null; continue;
        }
        if (e instanceof NeedsAnalyst) return stop('needs-analyst', {handler: handler.name, why: e.message, details: e.details, screen: summarize(await Screen.read())});
        return stop('error', {handler: handler.name, error: e.message, doNotRetryAutomatically: true});
      }
    }
  });
}
