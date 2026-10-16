// Act on the screen: every action re-reads the screen, picks its target with a selector,
// and retries only refusals the agent raised BEFORE doing anything (stale snapshot,
// screen changed, occluded). An action that may have run is never retried.
import {ui} from '../bridge/client.mjs';
import {Screen, waitFor, settle, parseMoney} from './screen.mjs';
import {recover, NeedsAnalyst} from './overlays.mjs';

const RETRYABLE = /inspect again|Stale UI snapshot|UI content changed|occluded|another game operation|Not an actionable element|UI tree incomplete|timed out before running|Element changed/i;

// Run fn(screen) with retries. An occluded target triggers one overlay recovery first.
// The wait grows (250 ms → 2 s): a page that keeps rebuilding (the Portal's news and live scores,
// 2033-01: the daily Transfer Activity read failed every day on "UI content changed") settles in seconds.
export async function act(fn, {attempts = 6, recoverOnOcclusion = true} = {}) {
  let recovered = !recoverOnOcclusion;
  for (let i = 1; ; i++) {
    try { return await fn(await Screen.read()); }
    catch (e) {
      if (i >= attempts || !RETRYABLE.test(e.message)) throw e;
      if (/occluded|covers the element/.test(e.message) && !recovered) { recovered = true; await recover(); }
      else await settle(Math.min(2000, 250 * 2 ** (i - 1)));
    }
  }
}
function one(list, what) {
  if (list.length !== 1) throw new Error(`Expected one ${what}, found ${list.length}${list.length ? ': ' + list.map(i => i.label).join(' | ') : ''}`);
  return list[0];
}
const missing = what => new Error(`UI content changed (no ${what} yet)`); // retryable

// ---- Basic actions ------------------------------------------------------------------
// Click a button by exact label (and optionally its element name, when labels repeat).
// An open message lists its inbox item twice (NewsItemButton, same label): those are one item. Either
// copy can be the hidden one (2031-06-17, after loading a save: the first was occluded), so try them in
// order; an occluded click is refused before it runs. Other repeated labels still need --name.
const isInboxDup = list => list.length > 1 && list.every(b => b.name === 'NewsItemButton');
export const click = (label, {name, recoverOnOcclusion} = {}) =>
  act(async s => {
    const list = s.buttons(label).filter(b => !name || b.name === name);
    if (!isInboxDup(list)) return ui.click(s.tree, s.node(one(list, `button "${label}"`).id));
    for (const [k, b] of list.entries()) {
      try { return await ui.click(s.tree, s.node(b.id)); }
      catch (e) { if (k === list.length - 1 || !/occluded/.test(e.message)) throw e; }
    }
  }, {recoverOnOcclusion});
// Click whatever select(screen) returns (a button, or a context menu → opened).
export const clickWhere = (select, what = 'control', opts) =>
  act(s => { const b = select(s); if (!b) throw missing(what); return b.kind === 'menu' ? ui.menu(s.tree, s.node(b.id)) : ui.click(s.tree, s.node(b.id)); }, opts);
export const openMenu = label => act(s => ui.menu(s.tree, s.node(one(s.items.filter(i => i.kind === 'menu' && i.label === label), `menu "${label}"`).id)));
export const hover = label => act(s => ui.hover(s.tree, s.node(one(s.items.filter(i => i.kind === 'button' && s.node(i.id).type === 'EntryElement' && i.label === label), `menu entry "${label}"`).id)));
// Type into the global search box if open, else the only text field on screen.
export const type = text => act(s => {
  const fields = s.items.filter(i => i.kind === 'text-field' && i.enabled), global = fields.filter(i => s.within(i.id, 'GlobalSearchCard'));
  return ui.text(s.tree, s.node(one(global.length ? global : fields, 'text field').id), text);
});
export const toggle = (select, checked, what = 'toggle') =>
  act(s => { const t = select(s); if (!t) throw missing(what); return ui.toggle(s.tree, s.node(t.id), checked); });
export const setNumber = (select, number, what = 'number field') =>
  act(s => { const f = select(s); if (!f) throw missing(what); return ui.number(s.tree, s.node(f.id), number); });
export const key = name => ui.key(name);
// Scroll the scroll view that contains select(screen)'s element by dy pixels (down is positive).
export const scrollWithin = (select, dy, what = 'scroll anchor') =>
  act(s => { const a = select(s); if (!a) throw missing(what); return ui.scroll(s.tree, s.node(a.id), dy); });

// ---- Dropdowns ------------------------------------------------------------------------
// Select an option of an SIDropdown by its visible text; verifies and corrects index offsets.
export async function choose(select, optionText, {what = 'dropdown'} = {}) {
  const current = s => select(s)?.label;
  if (current(await Screen.read()) === optionText) return {already: true};
  await act(s => { const d = select(s); if (!d) throw missing(what); return ui.dropdown(s.tree, s.node(d.id), 'open'); });
  const s = await waitFor(x => (x.floatingItems() || []).some(i => i.kind === 'text' || i.kind === 'row'), {what: `${what} options`});
  const options = s.floatingItems().filter(i => i.kind === 'text' || i.kind === 'row').map(i => i.label);
  let index = options.indexOf(optionText);
  if (index < 0) { await ui.closeDropdowns(); throw new NeedsAnalyst(`Option "${optionText}" not in ${what}`, {options}); }
  for (let attempt = 0; attempt < 3; attempt++) {
    await act(x => { const d = select(x); if (!d) throw missing(what); return ui.dropdown(x.tree, x.node(d.id), 'select', index); }, {recoverOnOcclusion: false});
    const got = current(await waitFor(x => current(x) === optionText, {timeout: 2500, what}).catch(() => Screen.read()));
    if (got === optionText) return {options, index};
    // Choice indexes can be offset from visible rows; step towards the wanted option.
    const gotIndex = options.indexOf(got);
    index += gotIndex >= 0 && gotIndex < options.indexOf(optionText) ? 1 : -1;
  }
  throw new NeedsAnalyst(`Could not select "${optionText}" in ${what}`, {options});
}

// ---- Fee comboboxes (asking price, offer fee, payoffs) ---------------------------------
// FM fee boxes ignore typed values on some screens. Reliable method (recorded from a player):
// open the box, pick the largest preset ≤ amount (SIDropdown.TriggerSelectionEvent), then
// step with + / −. Step sizes grow with the amount (e.g. £100 at £1K, £1M at £60M).
//   mode 'atMost'  never exceed the amount (asking prices)
//   mode 'nearest' closest value
export async function setFee(anchor, amount, {mode = 'nearest', maxSteps = 60} = {}) {
  const ctl = x => x.after(anchor, i => (i.kind === 'button' && (parseMoney(i.label) !== null || i.label === 'Unspecified')) || i.kind === 'number-field');
  const value = x => { const c = ctl(x); return c?.kind === 'number-field' ? c.value : parseMoney(c?.label); };
  const presets = x => (x.floatingItems() || []).filter(i => i.kind === 'row').map(i => parseMoney(i.label));

  if (value(await Screen.read()) !== amount) {
    await clickWhere(x => { const c = ctl(x); return c?.kind === 'button' ? c : null; }, `${anchor} box`);
    const rows = presets(await waitFor(x => presets(x).length > 3, {what: `${anchor} presets`}));
    let index = 0, target = rows[0];
    rows.forEach((v, k) => { if (v !== null && v <= amount && v >= target) { index = k; target = v; } });
    // The list's choices have one more entry than the visible rows (£60M: row 18 = choice 19).
    index += 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      await act(x => { const c = ctl(x); if (!c) throw missing(`${anchor} box`); return ui.preset(x.tree, x.node(c.id), index); }, {recoverOnOcclusion: false});
      const got = value(await waitFor(x => value(x) === target, {timeout: 3000, what: `${anchor} preset`}).catch(() => Screen.read()));
      if (got === target) break;
      index += (got ?? 0) < target ? 1 : -1;
    }
  }
  const step = (x, sign) => { const k = x.items.indexOf(ctl(x)); return x.items.slice(k + 1, k + 5).find(i => i.kind === 'button' && i.label === sign); };
  for (let n = 0; n < maxSteps; n++) {
    const x = await Screen.read(), v = value(x);
    if (v === amount) break;
    const sign = v < amount ? '+' : '-';
    if (!step(x, sign)?.enabled) break;
    await clickWhere(y => step(y, sign), `${anchor} ${sign}`);
    const nv = value(await waitFor(z => value(z) !== v, {what: `${anchor} step`}));
    if ((v < amount && nv > amount) || (v > amount && nv < amount)) {   // crossed the target
      const keep = mode === 'atMost' ? nv <= amount : Math.abs(nv - amount) <= Math.abs(v - amount);
      if (!keep) { await clickWhere(z => step(z, sign === '+' ? '-' : '+'), `${anchor} undo`); await waitFor(z => value(z) === v, {what: `${anchor} back`}); }
      break;
    }
  }
  const final = await Screen.read();
  return {anchor, wanted: amount, set: value(final), screen: final};
}
