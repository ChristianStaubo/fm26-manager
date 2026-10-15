// Squad registration ("<Club> squad to be decided", Response Required; 2026-07-24).
// The message embeds the registration list: each player row has a small selection checkbox and
// a large switch (inputs-switch-toggle-large-default) = registered. Loanees' switches are disabled.
// "Squad selection is fully compliant" only means the list is legal: on 2026-07-24 it left out
// Broholm, Lopez, Bird, Kayode, Onyeka and Cox with 9 places free. Changes are allowed until the
// deadline; Confirm → dialog "Please Confirm: Submit completed squad list?" → Confirm.
import {Screen, waitFor, toggle, clickWhere, settle, isoDate, NeedsAnalyst} from '../../ui/index.mjs';
import {log} from '../../../capabilities/log.mjs';

const SWITCH = 'inputs-switch-toggle-large-default';

/** Players in the registration list: {name, registered, enabled, switchId}. */
export function registrationList(s) {
  const by = new Map(s.tree.nodes.map(n => [n.id, n]));
  const rowOf = id => { let r = by.get(s.node(id).parent), hops = 0; while (r && !/Row/i.test(r.type || '') && hops++ < 6) r = by.get(r.parent); return r; };
  const inRow = (row, i) => { for (let a = s.node(i.id); a; a = by.get(a.parent)) if (a.id === row.id) return true; return false; };
  const switches = s.items.filter(i => i.kind === 'toggle' && i.name === SWITCH);
  const out = [];
  for (const box of s.items.filter(i => i.kind === 'toggle' && i.name !== SWITCH && i.bounds[2] < 24)) {
    const row = rowOf(box.id);
    const labels = row ? s.items.filter(i => inRow(row, i) && i.label).map(i => i.label) : [];
    const sw = switches.find(w => Math.abs(w.bounds[1] + w.bounds[3] / 2 - (box.bounds[1] + box.bounds[3] / 2)) < 10);
    if (!sw || !labels.length) continue;
    const age = Number(/^(\d+)\b/.exec(labels[0])?.[1] ?? NaN);
    out.push({name: labels[labels.length - 1], age, registered: !!sw.checked, enabled: !!sw.enabled, switchId: sw.id});
  }
  return out;
}
const spaces = s => Number(/You have (\d+) spaces? available/.exec(s.texts().join(' '))?.[1] ?? NaN);
export const onRegistration = s => s.hasText('Registration') && s.hasText(/^Squad selection is/) && s.buttons().some(b => b.label === 'Confirm' && b.name === 'button-primary-label');

/** Register `names` (default: every unregistered player whose switch is enabled), then submit. */
export async function register(names, {dryRun = false} = {}) {
  let s = await Screen.read();
  if (!onRegistration(s)) throw new NeedsAnalyst('Not on the squad registration list: open the "squad to be decided" message (or Squad → Registration) first');
  const list = registrationList(s), free = spaces(s);
  // Default: everyone 21+ (younger players are eligible without registering).
  const wanted = (names?.length ? list.filter(p => names.some(n => p.name.toLowerCase().includes(n.toLowerCase()))) : list.filter(p => !(p.age <= 20)))
    .filter(p => !p.registered && p.enabled);
  if (Number.isFinite(free) && wanted.length > free) throw new NeedsAnalyst(`${wanted.length} players to register but only ${free} places: choose (fm register "<name>" …)`, {wanted: wanted.map(p => p.name), free});
  const entry = {action: 'register', date: isoDate(s.date()), registered: wanted.map(p => p.name), placesBefore: free};
  if (dryRun) return {...entry, dryRun: true, list};
  for (const p of wanted) {
    await toggle(x => x.items.find(i => i.id === registrationList(x).find(q => q.name === p.name)?.switchId), true, `register ${p.name}`);
    await settle(300);
  }
  s = await Screen.read();
  const missing = registrationList(s).filter(p => wanted.some(w => w.name === p.name) && !p.registered).map(p => p.name);
  if (missing.length) throw new NeedsAnalyst(`Registration switch did not stick for ${missing.join(', ')}`, entry);
  await clickWhere(x => x.buttons().find(b => b.label === 'Confirm' && b.name === 'button-primary-label'), 'Confirm squad list');
  const d = await waitFor(x => x.tree.nodes.some(n => n.name === 'GenericModalDialog' && n.visible), {what: 'submit squad list dialog'});
  await clickWhere(x => x.buttons('Confirm').find(b => x.within(b.id, 'GenericModalDialog')), 'Submit completed squad list');
  await settle(1500);
  const done = {...entry, placesAfter: spaces(await Screen.read()), dialog: d.texts().find(t => /squad list/i.test(t))};
  await log(done);
  return done;
}

// Autopilot: the "squad to be decided" message with the embedded list → register everyone eligible.
// The "<Club> squad to be decided" message (2030-07-26) has a Respond button that opens the list.
const squadMessage = s => s.buttons('Respond').length === 1 && s.hasText(/ squad to be decided$/);
export const registrationHandler = {
  name: 'squad-registration',
  match: s => onRegistration(s) || squadMessage(s),
  async run(s, {dryRun = false} = {}) {
    if (!onRegistration(s)) { const {click, waitFor} = await import('../../ui/index.mjs'); await click('Respond'); await waitFor(onRegistration, {what: 'squad registration list'}); }
    return register(undefined, {dryRun});
  },
};
