// Autopilot: press Continue; when the game needs an action, run the matching handler
// (transfers, admin). Stops — and returns a screen summary — for anything that needs judgment.
//
// Stop reasons: 'until' (date reached), 'window-closed', 'needs-analyst' (no handler, or a
// handler escalated), 'unfamiliar-state', 'decision-limit', 'error' (do not retry blindly).
import {getState} from '../../bridge/client.mjs';
import {Screen, NeedsAnalyst, isoDate, settle, click} from '../../ui/index.mjs';
import {control, withLock} from './continue.mjs';
import {windowEnd} from './season.mjs';
import {HANDLERS as TRANSFER_HANDLERS} from '../transfers/incoming.mjs';
import {HANDLERS as ADMIN_HANDLERS} from '../admin/handlers.mjs';
import {handBackContract} from '../contracts/personal-terms.mjs';
import {pressConference} from '../admin/press.mjs';

export const HANDLERS = [...TRANSFER_HANDLERS, handBackContract, ...ADMIN_HANDLERS];

// What the analyst needs to see: the open message (sidebar excluded) and its buttons.
export function summarize(s) {
  const main = i => i.bounds[0] > 480;
  return {date: isoDate(s.date()), continue: s.continueLabel(),
    texts: s.items.filter(i => i.kind === 'text' && main(i) && i.label.length > 1).map(i => i.label).slice(0, 60),
    buttons: [...new Set(s.items.filter(i => i.kind === 'button' && i.enabled && main(i) && i.label && !/^\d+'/.test(i.label)).map(i => i.label.slice(0, 80)))].slice(0, 30)};
}

/** run({until?: 'YYYY-MM-DD', maxDecisions?, dryRun?}) — without `until`, stops when the current
 *  (or, before it opens, the coming) transfer window closes. */
export function run({until, maxDecisions = 30, dryRun = false} = {}) {
  return withLock('autopilot', async () => {
    const stopAt = until ? new Date(until + 'T00:00:00Z') : null;
    const decisions = [];
    let handoffs = 0, lastAction = null, closes = null;
    const stop = (reason, extra = {}) => ({reason, decisions, ...extra});
    for (;;) {
      const r = await control({maxSteps: stopAt ? 3 : 10});
      if (['error', 'unavailable'].includes(r.reason)) return stop(r.reason, {error: r.error});
      const s = await Screen.read(), today = s.date();
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
        if (st.automationState === 'ready' && ++handoffs <= 3) continue;
        return stop('unfamiliar-state', {state: st.stateName, screen: summarize(s)});
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
      try { decisions.push(await handler.run(screen, {dryRun})); await settle(1000); }
      catch (e) {
        if (e instanceof NeedsAnalyst) return stop('needs-analyst', {handler: handler.name, why: e.message, details: e.details, screen: summarize(await Screen.read())});
        return stop('error', {handler: handler.name, error: e.message, doNotRetryAutomatically: true});
      }
    }
  });
}
