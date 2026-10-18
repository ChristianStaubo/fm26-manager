// Read the game screen as an ordered list of items (controls and texts).
import {inspectUI} from '../bridge/client.mjs';
import {sawGameDate} from '../../telemetry/trace.mjs';

export const clean = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
export const settle = (ms = 500) => new Promise(r => setTimeout(r, ms));

// '£1.2M' → 1200000, '£925K' → 925000, '£54,000' → 54000, '(£84K)' → -84000.
export function parseMoney(s) {
  const m = /(\()?£\s*([\d,]+(?:\.\d+)?)\s*([KMB])?/i.exec(s || '');
  if (!m) return null;
  const scale = {K: 1e3, M: 1e6, B: 1e9}[(m[3] || '').toUpperCase()] || 1;
  return Math.round(parseFloat(m[2].replace(/,/g, '')) * scale) * (m[1] ? -1 : 1);
}
// '£7.6M - £8.4M' → [7600000, 8400000]
export function parseRange(s) {
  const parts = (s || '').split(/\s+-\s+/).map(parseMoney);
  return parts.length === 2 && parts.every(v => v !== null) ? parts : null;
}
// 'M/D/YYYY' (the game's date format) → Date (UTC)
export function parseDate(s) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
  return m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])) : null;
}
export const isoDate = d => d?.toISOString().slice(0, 10);

const KIND = n => n.button ? 'button' : n.menu ? 'menu' : n.dropdown ? 'dropdown' : n.row ? 'row'
  : n.toggle ? 'toggle' : n.textField ? 'text-field' : n.numberField ? 'number-field' : null;

// Visible, on-screen items in tree order. Texts inside a control are folded into its label.
export function parseScreen(tree) {
  const byId = new Map(tree.nodes.map(n => [n.id, n]));
  const insideControl = n => { for (let a = byId.get(n.parent); a; a = byId.get(a.parent)) if (KIND(a)) return true; return false; };
  const root = tree.nodes.find(n => n.parent === null), [w, h] = root ? [root.bounds[2], root.bounds[3]] : [1680, 1050];
  // Carousels park items outside the window; skip anything off screen.
  const onScreen = n => n.visible && n.bounds[2] > 0 && n.bounds[3] > 0 && n.bounds[0] >= 0 && n.bounds[0] < w && n.bounds[1] >= 0 && n.bounds[1] < h;
  const items = [];
  for (const n of tree.nodes) {
    if (!onScreen(n)) continue;
    const kind = KIND(n);
    if (kind) items.push({id: n.id, kind, label: clean(n.label), name: n.name, enabled: n.enabled, value: n.value, checked: n.checked, bounds: n.bounds});
    else if (n.text && clean(n.text) && !insideControl(n)) items.push({id: n.id, kind: 'text', label: clean(n.text), bounds: n.bounds});
  }
  return items;
}

export class Screen {
  constructor(tree) { this.tree = tree; this.items = parseScreen(tree); this.byId = new Map(tree.nodes.map(n => [n.id, n])); }
  // One snapshot (retried while the tree is still being built). Acting on it is safe: the
  // agent refuses if the screen changed in between, and that refusal is retried.
  static async read() {
    for (let i = 0; ; i++) {
      const t = await inspectUI();
      if (!t.truncated || i >= 4) { const s = new Screen(t); sawGameDate(isoDate(s.date())); return s; }
      await settle(150);
    }
  }
  node(id) { return this.byId.get(id); }
  texts() { return this.items.filter(i => i.kind === 'text').map(i => i.label); }
  hasText(m) { return this.items.some(i => i.kind === 'text' && (m instanceof RegExp ? m.test(i.label) : i.label === m)); }
  buttons(m) { return this.items.filter(i => i.kind === 'button' && i.enabled && (m === undefined || (m instanceof RegExp ? m.test(i.label) : i.label === m))); }
  continueLabel() { return this.items.find(i => i.name === 'continue-button')?.label || null; }
  date() { const b = this.items.find(i => i.kind === 'button' && /^\d{1,2}\/\d{1,2}\/\d{4}\b/.test(i.label)); return b ? parseDate(b.label) : null; }
  // The first item after the text `anchor` (in tree order) that satisfies pred.
  after(anchor, pred = () => true) {
    const i = this.items.findIndex(x => x.kind === 'text' && (anchor instanceof RegExp ? anchor.test(x.label) : x.label === anchor));
    return i < 0 ? null : this.items.slice(i + 1).find(pred) || null;
  }
  // Is the node inside an ancestor with this name (e.g. 'GlobalSearchCard')?
  within(id, ancestorName) { for (let a = this.node(id); a; a = this.byId.get(a.parent)) if (a.name === ancestorName) return true; return false; }
  // Items inside the open floating list (dropdown / preset list), if any.
  floatingItems() {
    const root = this.tree.nodes.find(n => n.name === 'floating-element-root' && n.visible);
    if (!root) return null;
    const inRoot = id => { for (let a = this.node(id); a; a = this.byId.get(a.parent)) if (a.id === root.id) return true; return false; };
    return this.items.filter(i => inRoot(i.id));
  }
}

// Poll until pred(screen) is truthy; returns that screen.
export async function waitFor(pred, {timeout = 8000, every = 150, what = 'condition'} = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const s = await Screen.read();
    if (pred(s)) return s;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await settle(every);
  }
}

// Short human-readable dump (CLI `fm screen`).
export function describe(s, filter) {
  const lines = [`date ${isoDate(s.date())} | continue: ${s.continueLabel()}`];
  for (const i of s.items) if (!filter || i.label.toLowerCase().includes(filter.toLowerCase()))
    lines.push(i.kind === 'text' ? '  ' + i.label.slice(0, 200)
      : `[${i.kind} ${i.id}] ${i.label.slice(0, 120)}${i.value !== undefined ? ' =' + i.value : ''}${i.checked !== undefined ? ' checked=' + i.checked : ''} (${i.name}) @${i.bounds.map(Math.round)}`);
  return lines.join('\n');
}
