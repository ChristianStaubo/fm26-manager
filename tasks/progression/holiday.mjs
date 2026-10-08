// Go on vacation: Portal date button → Calendar → "Go On Vacation" → options → Confirm.
// Settings come from season.json (holiday.*). Never tick "Use team selection where possible".
import {Screen, waitFor, click, clickWhere, toggle, setNumber, recover, isoDate} from '../../ui/index.mjs';
import {loadSeason, nextDate, daysBetween} from './season.mjs';
import {log} from '../log.mjs';

// Checkboxes have no label of their own: the label is the next text item.
const checkboxBefore = label => s => { const k = s.items.findIndex(i => i.kind === 'text' && i.label === label); return k < 0 ? null : s.items.slice(0, k).reverse().find(i => i.kind === 'toggle'); };
const radio = prefix => s => s.items.find(i => i.kind === 'toggle' && i.label.startsWith(prefix));

/** holiday({days?, until?: 'YYYY-MM-DD', dryRun?}) — default: back on season.json holiday.return_on */
export async function holiday({days, until, dryRun = false} = {}) {
  const cfg = loadSeason().holiday;
  await recover();
  const today = (await Screen.read()).date();
  const back = until ? new Date(until + 'T00:00:00Z') : nextDate(today, cfg.return_on);
  const n = days ?? daysBetween(today, back);
  await clickWhere(s => s.items.find(i => i.kind === 'button' && /^\d{1,2}\/\d{1,2}\/\d{4}\b/.test(i.label)), 'date button');
  await waitFor(s => s.buttons('Calendar').length > 0, {what: 'Portal'});
  await click('Calendar');
  await waitFor(s => s.buttons('Go On Vacation').length === 1, {what: 'Go On Vacation button'});
  await click('Go On Vacation');
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
