// Node client for the bridge socket (see server.py). No dependencies.
import net from 'node:net';
import path from 'node:path';

export const RUNTIME_DIR = process.env.FM26_BRIDGE_DIR || '/tmp/fm26-bridge';
export const SOCKET = path.join(RUNTIME_DIR, 'bridge.sock');

export function request(op = 'status', {timeoutMs = 5000} = {}) {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(SOCKET);
    let text = '';
    conn.setTimeout(timeoutMs, () => conn.destroy(new Error('Bridge request timed out')));
    conn.on('connect', () => conn.write(JSON.stringify(typeof op === 'string' ? {op} : op) + '\n'));
    conn.on('data', chunk => {
      text += chunk;
      if (!text.includes('\n')) return;
      conn.end();
      try { const r = JSON.parse(text.split('\n')[0]); r.ok ? resolve(r.result) : reject(new Error(r.error)); } catch (e) { reject(e); }
    });
    conn.on('error', e => reject(e.code === 'ENOENT' ? new Error(`Bridge is not running (no socket at ${SOCKET}). Start it: python bridge/server.py`) : e));
    conn.on('end', () => { if (!text.includes('\n')) reject(new Error('Bridge closed before responding')); });
  });
}

// ---- Game progression state --------------------------------------------------
// Transient states that pass by themselves are treated as busy.
export const BUSY_STATES = ['Processing', 'Waiting', 'Saving', 'NewsAggregator', 'OnHoliday'];
export function classifyState(s) {
  if (!s.available || !s.active) return 'unavailable';
  if (BUSY_STATES.includes(s.stateName)) return 'busy';
  if (s.stateName === 'NeedAction') return 'required-action';
  if (s.stateName === 'CanContinue' && s.actionReady) return 'ready';
  return 'handoff';
}
export const getState = async () => { const s = await request('status'); return {...s, automationState: classifyState(s)}; };

// ---- UI ------------------------------------------------------------------------
export const inspectUI = () => request('uitree');
const element = (tree, node) => ({snapshot: tree.snapshot, id: node.id, expectedName: node.name, expectedLabel: node.label || ''});
export const uiAction = (action, tree, node, extra = {}) => request({op: 'ui', action, ...element(tree, node), ...extra});
export const ui = {
  click: (t, n) => uiAction('click', t, n),
  menu: (t, n) => uiAction('menu', t, n),
  hover: (t, n) => uiAction('hover', t, n),
  text: (t, n, text) => uiAction('text', t, n, {text}),
  number: (t, n, number) => uiAction('number', t, n, {number}),
  toggle: (t, n, checked) => uiAction('toggle', t, n, {checked}),
  dropdown: (t, n, mode, index) => uiAction('dropdown', t, n, {mode, index}),
  preset: (t, n, index) => uiAction('preset', t, n, {index}),
  row: (t, n) => uiAction('row', t, n),
  scroll: (t, n, dy) => uiAction('scroll', t, n, {dy}),
  // Not tied to an element:
  key: key => request({op: 'ui', action: 'key', key}),
  closeDropdowns: () => request({op: 'ui', action: 'closeDropdowns'}),
  closeSearch: () => request({op: 'ui', action: 'closeSearch'}),
  removeVirtual: () => request({op: 'ui', action: 'removeVirtual'}),
  inputInfo: () => request({op: 'ui', action: 'inputInfo'}),
  recordStart: classes => request({op: 'ui', action: 'recordStart', classes}),
  recordStop: () => request({op: 'ui', action: 'recordStop'}, {timeoutMs: 15000}),
};
