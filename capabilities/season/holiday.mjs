// Go on vacation: Portal date button → Calendar → "Go On Vacation" → options → Confirm.
// Settings come from playbook/policy.json (holiday.*): which boxes to tick and the return date.
import {Screen, waitFor, click, clickWhere, toggle, setNumber, recover, isoDate} from '../../game/ui/index.mjs';
import {loadSeason, nextDate, daysBetween} from './season.mjs';
import {log} from '../log.mjs';
import {loadPolicy} from '../sell/decide.mjs';

// Checkboxes have no label of their own: the label is the next text item.
const checkboxBefore = label => s => { const k = s.items.findIndex(i => i.kind === 'text' && i.label === label); return k < 0 ? null : s.items.slice(0, k).reverse().find(i => i.kind === 'toggle'); };
const radio = prefix => s => s.items.find(i => i.kind === 'toggle' && i.label.startsWith(prefix));

/** holiday({days?, until?: 'YYYY-MM-DD', dryRun?}) — default: back on policy.json holiday.return_on */
export async function holiday({days, until, dryRun = false} = {}) {
  const cfg = loadPolicy().holiday;
  await recover();
  const today = (await Screen.read()).date();
  const back = until ? new Date(until + 'T00:00:00Z') : nextDate(today, cfg.return_on);
  const n = days ?? daysBetween(today, back);
  await clickWhere(s => s.items.find(i => i.kind === 'button' && /^\d{1,2}\/\d{1,2}\/\d{4}\b/.test(i.label)), 'date button');
  // The Portal rebuilds after the date click: a Calendar tab seen a moment before can be gone when
  // clicked ("Expected one button Calendar, found 0", 2026-08-06). clickWhere retries until it's there.
  await waitFor(s => s.buttons('Calendar').length > 0, {what: 'Portal'});
  await clickWhere(s => s.buttons('Calendar')[0], 'Calendar tab');
  await waitFor(s => s.buttons('Go On Vacation').length === 1, {what: 'Go On Vacation button'});
  await clickWhere(s => s.buttons('Go On Vacation')[0], 'Go On Vacation');
  await waitFor(s => s.buttons('Confirm Vacation').length === 1, {what: 'vacation dialog'});

  await toggle(radio('Return from vacation after'), true, 'return-after radio');
  await setNumber(s => s.items.find(i => i.kind === 'number-field'), n, 'days field');
  await waitFor(s => s.items.find(i => i.kind === 'number-field')?.value === n, {what: `${n} days applied`});
  await toggle(radio(cfg.offers), true, 'offer handling radio');
  for (const label of cfg.tick) await toggle(checkboxBefore(label), true, label);
  for (const label of cfg.never_tick) await toggle(checkboxBefore(label), false, label);

  const s = await Screen.read();
  const settings = s.items.filter(i => i.kind === 'toggle').map(i => ({label: i.label || s.items[s.items.indexOf(i) + 1]?.label, checked: i.checked}));
  const result = {action: 'holiday', from: isoDate(today), days: n, returns: isoDate(new Date(today.getTime() + n * 86400000)), settings};
  // Wait for the card to close: returning while it closes leaves a 'panel' overlay for the next command.
  if (dryRun) { await click('Cancel', {name: 'CancelButton'}); await waitFor(x => !x.buttons().some(b => b.name === 'CancelButton'), {what: 'vacation dialog closed'}); return {...result, dryRun: true}; }
  await click('Confirm Vacation');
  await log(result);
  return result;
}

// ---- A whole stretch on holiday ------------------------------------------------------------
// FM ends a vacation early when something needs the manager (captaincy, 2026-08-02; …). Going on
// holiday again lets the assistant settle it (user, 2026-10-08), so: holiday to the return date,
// and when a leg ends early, note where and why, then go again. Stops at the return date, on an
// unknown dialog (recover refuses it), or when two legs in a row make no progress.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitUntilIdle({quietPolls = 3, every = 5000, maxMs = 3 * 3600e3} = {}) {
  const {getState} = await import('../../game/bridge/client.mjs');
  const end = Date.now() + maxMs;
  for (let quiet = 0; quiet < quietPolls && Date.now() < end; ) {
    await sleep(every);
    const st = await getState().catch(() => ({automationState: 'busy'}));
    quiet = st.automationState === 'busy' || st.actionInFlight ? 0 : quiet + 1;
  }
}

export async function holidaySeason({until, maxLegs = 40, onLeg = () => {}} = {}) {
  const {summarize} = await import('./autopilot.mjs');
  const start = (await Screen.read()).date();
  const back = until ? new Date(until + 'T00:00:00Z') : nextDate(start, loadPolicy().holiday.return_on);
  const legs = [];
  let stalls = 0;
  for (let leg = 1; leg <= maxLegs; leg++) {
    const from = (await Screen.read()).date();
    if (from >= back) return {action: 'holiday-season', reason: 'returned', from: isoDate(start), to: isoDate(from), legs};
    await holiday({until: isoDate(back)});
    await waitUntilIdle();
    const s = await Screen.read(), to = s.date();
    const entry = {action: 'holiday-leg', leg, from: isoDate(from), to: isoDate(to), continue: s.continueLabel(), screen: summarize(s).texts.slice(0, 6)};
    legs.push(entry); await log(entry); onLeg(entry);
    stalls = to && from && to > from ? 0 : stalls + 1;
    if (stalls >= 2) return {action: 'holiday-season', reason: 'stuck', from: isoDate(start), to: isoDate(to), legs};
  }
  return {action: 'holiday-season', reason: 'max-legs', legs};
}
