// Squad registration ("<Club> squad to be decided", Response Required; 2026-07-24).
// The message embeds the registration list: each player row has a small selection checkbox and
// a large switch (inputs-switch-toggle-large-default) = registered. Loanees' switches are disabled.
// "Squad selection is fully compliant" only means the list is legal: on 2026-07-24 it left out
// Broholm, Lopez, Bird, Kayode, Onyeka and Cox with 9 places free. Changes are allowed until the
// deadline; Confirm → dialog "Please Confirm: Submit completed squad list?" → Confirm.
import {Screen, waitFor, toggle, clickWhere, settle, isoDate, NeedsAnalyst, Unreadable} from '../../ui/index.mjs';
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
// The list before anyone is picked (Champions League latter stages, 2035-09-04): no "Squad selection
// is…" line and Confirm disabled until the list is legal, but Ask Assistant to Pick and the places count.
export const onRegistrationPage = s => onRegistration(s)
  || (s.buttons('Ask Assistant to Pick').length === 1 && /You have \d+ spaces? available/.test(s.texts().join(' ')));

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

/** Who must be registered (user, 2035-08-05): every player with a depth role (starter, backup, third)
 *  who needs registering (21+); free places first; if short, unregister players we're selling
 *  (price book) or with no depth role. Pure: (list, roles, free, selling) → {add, drop, short}. */
export function registrationPlan(list, roles, free, selling = () => false) {
  const needs = p => p.enabled && !(p.age <= 20) && roles[p.name] && roles[p.name][1] !== 'surplus';
  const add = list.filter(p => !p.registered && needs(p));
  const spare = list.filter(p => p.registered && p.enabled && !needs(p) || p.registered && selling(p.name))
    .sort((a, b) => (selling(b.name) ? 1 : 0) - (selling(a.name) ? 1 : 0));
  const room = Number.isFinite(free) ? free : add.length;
  const drop = spare.slice(0, Math.max(0, add.length - room));
  return {add: add.map(p => p.name), drop: drop.map(p => p.name), short: Math.max(0, add.length - room - drop.length)};
}

// The list draws its rows in batches after the header: the page check passed with 0 rows and the plan
// came out "nothing to add" (2035-09-04, Transfer deadline passed). Rows first; none is unreadable.
export const rowsReady = s => registrationList(s).length > 0;
export async function registerDepth({dryRun = false} = {}) {
  const {analysis} = await import('../../../capabilities/data.mjs');
  const pricebook = await import('../../../capabilities/value/pricebook.mjs');
  let s = await waitFor(rowsReady, {what: 'registration rows', timeout: 10000}).catch(() => null);
  if (!s) throw new Unreadable('Registration list', ['rows'], {});
  if (s.buttons('Ask Assistant to Pick').length === 1 && !dryRun) {
    // A selector click retries while the page redraws (a plain click failed "found 0", 2035-09-04).
    await clickWhere(x => x.buttons('Ask Assistant to Pick')[0], 'Ask Assistant to Pick');
    await settle(1500);
    s = await waitFor(x => rowsReady(x) && x.hasText(/^Squad selection is/), {what: 'registration rows after the pick', timeout: 10000});
  }
  const roles = analysis('depth.py', ['--roles']);
  const plan = registrationPlan(registrationList(s), roles, spaces(s), n => !!pricebook.lookup(n));
  const entry = {action: 'squad-registration', date: isoDate(s.date()), assistant: true, ...plan};
  if (plan.short) throw new NeedsAnalyst(`Registration: ${plan.short} depth player(s) don't fit (${plan.add.join(', ')}); choose who to leave out`, entry);
  if (dryRun) return {...entry, dryRun: true};
  const sw = (x, name) => x.items.find(i => i.id === registrationList(x).find(q => q.name === name)?.switchId);
  for (const name of plan.drop) { await toggle(x => sw(x, name), false, `unregister ${name}`); await settle(300); }
  for (const name of plan.add) { await toggle(x => sw(x, name), true, `register ${name}`); await settle(300); }
  const after = registrationList(await Screen.read());
  const missing = plan.add.filter(n => !after.find(p => p.name === n)?.registered);
  if (missing.length) throw new NeedsAnalyst(`Registration switch did not stick for ${missing.join(', ')}`, entry);
  // Confirm, then the dialog's own Confirm ("Please Confirm: Submit completed squad list?").
  await clickWhere(x => x.buttons().find(b => b.label === 'Confirm' && b.name === 'button-primary-label'), 'Confirm squad list');
  await waitFor(x => x.tree.nodes.some(n => n.name === 'GenericModalDialog' && n.visible), {what: 'submit squad list dialog'});
  await clickWhere(x => x.buttons('Confirm').find(b => x.within(b.id, 'GenericModalDialog')), 'Submit completed squad list');
  await waitFor(x => !x.tree.nodes.some(n => n.name === 'GenericModalDialog' && n.visible), {what: 'dialog closed'}).catch(() => null);
  await log(entry);
  return entry;
}

// Autopilot: the "squad to be decided" message with the embedded list → register everyone eligible.
// The "<Club> squad to be decided" message (2030-07-26) has a Respond button that opens the list; so does
// "<Club> to register players for latter stages" (Champions League, 2035-09-04; mapped with the user: Respond,
// Ask Assistant to Pick, Confirm, Confirm; the depth rule added no one, the pick already had them).
const squadMessage = s => (s.buttons('Respond').length === 1 && s.hasText(/( squad to be decided| to register players for latter stages)$/))
  // "Transfer deadline passed" (2035-09-04): the league list's final chance, with Confirm Selection and
  // Team Registration. Our rule, not a blind Confirm Selection: open the list and run it like the others.
  || (s.buttons('Team Registration').length === 1 && s.hasText('Transfer deadline passed'));
const OPEN_LIST = ['Respond', 'Team Registration'];
export const registrationHandler = {
  name: 'squad-registration',
  match: s => onRegistration(s) || squadMessage(s),
  async run(s, {dryRun = false} = {}) {
    const {click, waitFor, Screen, recover} = await import('../../ui/index.mjs');
    if (!onRegistration(s)) {
      await click(OPEN_LIST.find(l => s.buttons(l).length === 1));
      // Already submitted (2032-07-30, done by hand with the scroll): Respond no longer opens the list.
      if (!await waitFor(onRegistrationPage, {what: 'squad registration list', timeout: 8000}).catch(() => null))
        return {action: 'squad-registration', date: isoDate(s.date()), detail: 'already submitted'};
    }
    // The user's way (recorded 2035-08-05): Ask Assistant to Pick, then check our depth chart is in
    // (the assistant left out Boem, Wark, Angulo and a winger with 5 places free), then Confirm. A
    // "compliant" list as it stands is not enough: compliant only means legal.
    return registerDepth({dryRun});
  },
};
