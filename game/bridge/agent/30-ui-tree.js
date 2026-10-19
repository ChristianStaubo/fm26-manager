// Read the live UI Toolkit tree. Each snapshot roots its actionable elements so a
// later action can prove it targets the same object the caller saw.
const session = Process.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
let snapshotSeq = 0, currentSnapshot = null;
const contextKey = nodes => JSON.stringify(nodes.map(n => [n.parent, n.panel, n.type, n.name, n.text || '', n.enabled, n.visible]));
function releaseSnapshot(s) { if (s) for (const e of s.elements.values()) A.unroot(e.handle); }
function clearSnapshot() { releaseSnapshot(currentSnapshot); currentSnapshot = null; }
// Kinds of controls the bridge can act on (see 40-ui-actions.js).
const ACTIONABLE = n => n.button || n.textField || n.numberField || n.toggle || n.menu || n.dropdown || n.row;

function classify(node, c, o) {
  node.button = isA(c, classes.get('Button'));
  if (isA(c, classes.get('PluginContextMenuBindings'))) node.menu = true;          // e.g. a player's "Actions"
  if (isA(c, classes.get('SIDropdown'))) node.dropdown = true;
  // FM list rows (dropdown presets, tables) are NavigatableVisualElements named *Row*.
  if (/Row/.test(node.type) && isA(c, classes.get('NavigatableVisualElement'))) node.row = true;
  if (isA(c, classes.get('Toggle'))) { node.toggle = true; node.checked = boolOf(call(c, 'get_value', o)); }
  if (isA(c, classes.get('SIRadioButton'))) { node.toggle = true; node.radio = true; node.checked = boolOf(call(c, 'get_value', o)); }
  if (isA(c, classes.get('IntegerField'))) { node.numberField = true; node.intField = true; node.value = A.unbox(call(c, 'get_value', o)).readS32(); }
  if (isA(c, classes.get('LongField'))) { node.numberField = true; node.value = Number(A.unbox(call(c, 'get_value', o)).readS64()); }
  if (isA(c, classes.get('TextField'))) { node.textField = true; node.value = readString(call(c, 'get_value', o)); }
}

function uiTree(capture = true) {
  const started = Date.now(), ve = cls('VisualElement'), text = cls('TextElement');
  const panels = readList(call(cls('UIElementsRuntimeUtility'), 'GetSortedPlayerPanels', ptr(0)));
  const nodes = [], objects = [], stack = [], seen = new Set();
  panels.forEach((p, i) => { const r = call(cls('Panel'), 'get_visualTree', p); if (!r.isNull()) stack.push({o: r, parent: null, panel: i, depth: 0}); });
  let truncated = false;
  while (stack.length) {
    if (nodes.length >= 20000 || Date.now() - started > 1200) { truncated = true; break; }
    const item = stack.pop(), o = item.o, key = o.toString();
    if (o.isNull() || seen.has(key)) continue; seen.add(key);
    const c = A.objectClass(o), id = nodes.length;
    if (!boolOf(call(ve, 'get_areAncestorsAndSelfDisplayed', o))) continue;
    const node = {id, parent: item.parent, panel: item.panel, type: className(c), name: readString(o.add(fieldOffset(ve, 'm_Name')).readPointer())};
    if (isA(c, text)) node.text = readString(o.add(fieldOffset(text, 'm_Text')).readPointer());
    node.visible = boolOf(call(ve, 'get_visible', o));
    node.enabled = boolOf(call(ve, 'get_enabledInHierarchy', o));
    const rect = A.unbox(call(ve, 'get_worldBound', o));
    node.bounds = [0, 4, 8, 12].map(off => Math.round(rect.add(off).readFloat() * 100) / 100);
    classify(node, c, o);
    objects.push(o); nodes.push(node);
    const kids = readList(o.add(fieldOffset(ve, 'm_Children')).readPointer());
    if (item.depth < 200) for (let i = kids.length - 1; i >= 0; i--) stack.push({o: kids[i], parent: id, panel: item.panel, depth: item.depth + 1});
    else if (kids.length) truncated = true;
  }
  // A control's label is the text inside it.
  for (const n of nodes) if (n.text) {
    for (let a = n; a; a = a.parent === null ? null : nodes[a.parent]) if (ACTIONABLE(a)) { a.label = ((a.label || '') + ' ' + n.text).trim(); break; }
  }
  const result = {panels: panels.length, nodes, truncated, elapsedMs: Date.now() - started};
  if (!capture) return {result, objects, panels};
  clearSnapshot();
  const elements = new Map();
  if (!truncated) for (const n of nodes)
    if (ACTIONABLE(n) && n.visible && n.enabled && n.bounds[2] > 0 && n.bounds[3] > 0) elements.set(n.id, {handle: A.root(objects[n.id], 0), node: n});
  currentSnapshot = {id: session + ':' + (++snapshotSeq), at: Date.now(), elements, context: contextKey(nodes)};
  return {...result, snapshot: currentSnapshot.id};
}
