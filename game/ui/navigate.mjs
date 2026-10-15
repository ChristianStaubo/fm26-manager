// Get to things: players (via global search), profile Actions menus.
import {Screen, waitFor, settle, clean, parseMoney, parseRange} from './screen.mjs';
import {click, clickWhere, openMenu, hover, type} from './controls.mjs';
import {recover, overlays, NeedsAnalyst} from './overlays.mjs';

export async function goTo(tab) {
  await recover();
  await click(tab);
  return waitFor(s => !overlays(s).length, {what: tab});
}

// A top menu's dropdown entry ("Squad" → "Registration"): the NavTabDropdown inside the tab's button.
export async function navMenu(tab, item) {
  const {choose} = await import('./controls.mjs');
  const select = x => { const t = x.buttons(tab).find(b => b.name === 'buttons-button-navigation-default'); return t && x.items.find(i => i.kind === 'dropdown' && i.name === 'NavTabDropdown' && i.bounds[0] > t.bounds[0] && i.bounds[0] < t.bounds[0] + t.bounds[2]); };
  return choose(select, item, {what: `${tab} menu`});
}
export const fold = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[łŁ]/g, 'l').replace(/ß/g, 'ss').toLowerCase().trim();
export const sameName = (a, b) => { const w = t => fold(t).split(/\s+/).filter(Boolean).sort().join(' '); return w(a) === w(b); };
// Open a player's profile through the global search. `club` disambiguates namesakes.
export async function openPlayer(name, club) {
  await goTo('Portal'); // search results depend on the page; from the Portal they include people
  await click('Search');
  await waitFor(s => overlays(s).some(o => o.kind === 'search'), {what: 'search box'});
  await type(name);
  const result = s => {
    const items = s.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== 'button' || items[i].name !== 'PlayerSearchButton') continue;
      const row = [];
      for (let j = i + 1; j < items.length && !(items[j].kind === 'button' && items[j].name === 'PlayerSearchButton'); j++) row.push(items[j].label);
      // Search rows show the club's short name ("LOSC" for "LOSC Lille"): match either way.
      // Accents and word order differ between the export and the game ("Zukic"/"Žukić", Japanese
      // family-name-first): compare normalised, as sets of words (portfolio buys, 2030-07-21).
      const clubMatch = !club || row.some(l => l.length >= 3 && clubLike(l, club));
      if (row.some(l => sameName(l, name)) && clubMatch) return items[i];
    }
    // The export's club can be stale (Zukic had moved to Cremonese, 2030-07-21): exactly one result
    // with his name is him.
    const named = items.filter((b, i) => b.kind === 'button' && b.name === 'PlayerSearchButton' && items.slice(i + 1, i + 6).some(x => sameName(x.label, name)));
    return club && named.length === 1 ? named[0] : null;
  };
  // Quirk: the first search sometimes lists only Messages; clearing and retyping fixes it.
  let found = false;
  for (let attempt = 0; ; attempt++) {
    try { await waitFor(result, {what: `search result ${name}`, timeout: 3000}); found = true; break; }
    catch (e) { if (attempt >= 2 || (await Screen.read()).buttons(/^See All Results/).length) break; await type(''); await settle(400); await type(name); }
  }
  if (found) await clickWhere(result, `search result ${name}`);
  // A common name (Ângelo, 2031-05-28: 222 results) doesn't make the dropdown's few rows: the user's
  // route is "See All Results (N)" → the Search Results page, one row per person ("26 Brazil Player
  // Hamburger SV") with his name in a NameButton row.
  else if (!(await openFromAllResults(name, club))) throw new NeedsAnalyst(`No search result for ${name}${club ? ' (' + club + ')' : ''}`);
  return waitFor(s => s.items.some(i => i.kind === 'menu' && i.label === 'Actions') && s.items.some(i => i.name === 'ContractDetails') && !overlays(s).length, {what: `${name} profile`});
}

// Clubs as the export and the game write them: "Hamburger Sport-Verein" / "Hamburger SV".
export const clubLike = (a, b) => { const x = fold(a), y = fold(b); if (!x || !y) return false; if (x === y || x.includes(y) || y.includes(x)) return true;
  const w = t => t.split(/[\s.-]+/).filter(v => v.length >= 4 && !['club', 'sport', 'football'].includes(v)); return w(x).some(v => w(y).includes(v)); };
/** The Search Results page: the row whose label names `club` and whose name entry is `name`. */
export function allResultsRow(s, name, club) {
  const rows = s.items.filter(i => i.kind === 'row');
  for (const row of rows) {
    if (!/\bPlayer\b/.test(row.label) || (club && !clubLike(row.label.replace(/^.*?\bPlayer\s+/, ''), club))) continue;
    const inside = s.items.filter(i => i.bounds[1] >= row.bounds[1] && i.bounds[1] < row.bounds[1] + row.bounds[3]);
    const label = inside.find(i => sameName(i.label, name));
    if (label) return inside.find(i => i.name === 'NameButton') || label;
  }
  return null;
}
async function openFromAllResults(name, club) {
  const s0 = await Screen.read();
  if (!s0.buttons(/^See All Results/).length) return false;
  await click(s0.buttons(/^See All Results/)[0].label);
  const s = await waitFor(x => x.hasText('Search Results') && x.items.some(i => i.name === 'NameButton'), {what: 'Search Results page'}).catch(() => null);
  if (!s || !allResultsRow(s, name, club)) return false;
  await clickWhere(x => allResultsRow(x, name, club), `${name} in Search Results`);
  return true;
}

// Facts from a player profile header.
export function profileFacts(s) {
  const contract = s.items.find(i => i.name === 'ContractDetails')?.label || '';
  // Only a button that IS a range ("£6.4M - £7.6M"): the news ticker is a button too, and its text
  // can hold two amounts around " - " (Camara read as [85M, 31.5M], 2026-07-16).
  const valueText = s.items.find(i => i.kind === 'button' && /^£[\d.,]+[KMB]? - £[\d.,]+[KMB]?$/.test(i.label))?.label;
  // A transfer-listed player shows his asking price (one amount) where the value range was.
  const asking = valueText ? null : s.items.find(i => i.kind === 'button' && i.name === 'SIButton' && /^£[\d.]+[KM]?$/.test(i.label) && Math.abs(i.bounds[0] - (s.items.find(x => x.name === 'ContractDetails')?.bounds[0] ?? -1)) < 5);
  return {wage: parseMoney(contract), contract, valueRange: parseRange(valueText), valueText, askingPrice: asking ? parseMoney(asking.label) : null};
}

// Context-menu entries currently shown (EntryElement rows), with their x position.
const entries = s => s.tree.nodes.filter(n => n.type === 'EntryElement' && n.visible).map(n => ({label: clean(n.label), x: n.bounds[0]}));

// Follow a path in the profile's Actions menu, e.g. ['Transfer', 'Set Transfer Status'].
// Intermediate entries open their submenu by hover; the last entry is clicked.
export async function actionPath(path) {
  // The profile can still be rebuilding after a previous menu closed: wait for the menu.
  await waitFor(x => x.items.some(i => i.kind === 'menu' && i.label === 'Actions') && !overlays(x).length, {what: 'Actions menu button'});
  await openMenu('Actions');
  let s = await waitFor(x => entries(x).length > 0, {what: 'Actions menu'});
  for (let k = 0; k < path.length; k++) {
    const label = path[k], entry = entries(s).find(e => e.label === label);
    if (!entry) { const available = entries(s).map(e => e.label); await recover(); throw new NeedsAnalyst(`Menu entry "${label}" not available`, {path, available}); }
    if (k === path.length - 1) { await click(label); break; }
    await hover(label);
    s = await waitFor(x => entries(x).some(e => e.x > entry.x + 50), {what: `${label} submenu`});
  }
  await settle(400);
}

// List the Actions menu (and optionally one submenu) without choosing anything.
export async function peekActions(sub) {
  // The profile can still be rebuilding after a previous menu closed: wait for the menu.
  await waitFor(x => x.items.some(i => i.kind === 'menu' && i.label === 'Actions') && !overlays(x).length, {what: 'Actions menu button'});
  await openMenu('Actions');
  let s = await waitFor(x => entries(x).length > 0, {what: 'Actions menu'});
  const top = entries(s).map(e => e.label);
  let items = [];
  const parent = sub && entries(s).find(e => e.label === sub);
  if (parent) {
    await hover(sub);
    s = await waitFor(x => entries(x).some(e => e.x > parent.x + 50), {what: `${sub} submenu`});
    items = entries(s).filter(e => e.x > parent.x + 50).map(e => e.label);
  }
  await recover();
  return {top, sub: items};
}
