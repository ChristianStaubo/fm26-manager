// UI actions. An element action names a snapshot element (snapshot + id + expected
// name/label). Before acting, the agent re-reads the tree and checks that the element is
// unchanged, enabled, visible and actually on top (hit test). The snapshot is consumed,
// so a caller can never repeat an uncertain action by accident.
//
// Each handler below calls the same code path FM uses for a real click on that control.
// How they were found: docs/ui-notes.md and tasks/*/README.md (recorded traces).

const ve = () => cls('VisualElement');
const nameOf = o => readString(o.add(fieldOffset(ve(), 'm_Name')).readPointer());
const parentOf = o => call(ve(), 'get_parent', o);
function ancestor(o, className, maxDepth = 8) {
  const c = classes.get(className); if (!c) return null;
  for (let x = o, i = 0; !x.isNull() && i < maxDepth; x = parentOf(x), i++) if (isA(A.objectClass(x), c)) return x;
  return null;
}
const pooled = eventClass => call(cls(eventClass), 'GetPooled', ptr(0));

const ELEMENT_ACTIONS = {
  // Unity Button (most FM buttons, menu entries).
  click: {accepts: n => n.button, perform(t) {
    const clickable = call(cls('Button'), 'get_clickable', t);
    if (clickable.isNull()) throw Error('Button has no click handler');
    call(cls('Clickable'), 'SimulateSingleClick', clickable, [ptr(0), i32(100)]);
  }},
  // Context menus such as a player's "Actions" (FM opens them from a pointer manipulator).
  menu: {accepts: n => n.menu && !n.button, perform(t) {
    const manipulator = t.add(fieldOffset(cls('PluginContextMenuBindings'), 'm_manipulator')).readPointer();
    if (manipulator.isNull()) throw Error('Context menu has no manipulator');
    call(cls('ContextMenuDescriptionManipulator'), 'OpenOnShortcutEvent', manipulator, [pooled('NavigationSubmitEvent')]);
  }},
  // Cascading menu entries open their submenu on mouse enter.
  hover: {accepts: n => n.button, perform(t) {
    if (!isA(A.objectClass(t), classes.get('EntryElement'))) throw Error('Hover is only supported on menu entries');
    call(cls('EntryElement'), 'HandleMouseEnter', t, [pooled('MouseEnterEvent')]);
  }},
  text: {accepts: n => n.textField, perform(t, n, r) {
    if (typeof r.text !== 'string' || r.text.length > 200) throw Error('Text required (max 200 characters)');
    call(cls('TextField'), 'set_value', t, [managedString(r.text)]);
    return {value: readString(call(cls('TextField'), 'get_value', t))};
  }},
  // Plain number fields (e.g. vacation days). FM fee comboboxes do NOT keep typed values on
  // every screen: use the 'preset' action plus +/− buttons for fees (see ui/controls.mjs).
  number: {accepts: n => n.numberField, coveredByOwnList: true, perform(t, n, r) {
    if (!Number.isSafeInteger(r.number) || r.number < 0 || r.number > 1e10) throw Error('Number out of range');
    const c = A.objectClass(t);
    call(c, 'set_value', t, [n.intField ? i32(r.number) : i64(r.number)]);
    const combo = ancestor(t, 'FMCombobox');
    if (combo) call(cls('FMCombobox'), 'OnLostFocusInput', combo, [ptr(0)]);
    return {value: n.intField ? A.unbox(call(c, 'get_value', t)).readS32() : Number(A.unbox(call(c, 'get_value', t)).readS64())};
  }},
  // Checkboxes and FM radio buttons.
  toggle: {accepts: n => n.toggle, perform(t, n, r) {
    if (typeof r.checked !== 'boolean') throw Error('checked (true/false) required');
    const c = A.objectClass(t), current = boolOf(call(c, 'get_value', t));
    if (current !== r.checked) {
      if (n.radio) {
        if (!r.checked) throw Error('Select another radio button instead of unsetting one');
        call(cls('SIRadioButton'), 'OnClickedOrSubmitted', t); // FM radio click handler
      } else call(c, 'set_value', t, [u8(r.checked)]); // fires ChangeEvent → bindings
    }
    return {checked: boolOf(call(c, 'get_value', t))};
  }},
  // SIDropdown: open | close | select (by index of its options).
  dropdown: {accepts: n => n.dropdown, coveredByOwnList: true, perform(t, n, r) {
    const dd = cls('SIDropdown');
    if (r.mode === 'open') call(dd, 'ShowDropdown', t);
    else if (r.mode === 'close') call(dd, 'HideDropdown', t);
    else if (r.mode === 'select') {
      if (!Number.isInteger(r.index) || r.index < 0) throw Error('index required');
      call(dd, 'TriggerSelectionEvent', t, [i32(r.index)]); // what a click on an option calls
      try { call(dd, 'HideDropdown', t); } catch (e) {}
    } else throw Error('mode must be open, close or select');
  }},
  // FM fee combobox (money button or its number field): pick a preset from its list.
  // Recorded from a player's click: SIDropdown.TriggerSelectionEvent(index) commits the value.
  preset: {accepts: n => n.button || n.numberField, coveredByOwnList: true, perform(t, n, r) {
    if (!Number.isInteger(r.index) || r.index < 0) throw Error('index required');
    const combo = ancestor(t, 'FMCombobox');
    if (!combo) throw Error('Not inside a fee combobox');
    const dd = combo.add(fieldOffset(cls('FMCombobox'), 'm_dropdown')).readPointer();
    if (dd.isNull()) throw Error('Combobox has no preset list');
    call(cls('SIDropdown'), 'TriggerSelectionEvent', dd, [i32(r.index)]);
    try { call(cls('SIDropdown'), 'HideDropdown', dd); } catch (e) {}
  }},
  // List rows (NavigatableVisualElement). Works for some lists; FM table rows (club
  // selection) still ignore it — select those by hand.
  row: {accepts: n => n.row, perform(t) {
    const evt = pooled('NavigationSubmitEvent');
    try { call(cls('NavigationSubmitEvent'), 'set_target', evt, [t]); } catch (e) {}
    call(cls('NavigatableVisualElement'), 'OnClickedOrSubmitted', t, [evt]);
  }},
};

// Verify a snapshot element is still the same, visible and on top; return its live object.
function resolveTarget(r, spec) {
  const st = continueState();
  if (st.processing || ['Waiting', 'Saving'].includes(st.stateName)) throw Error('Game is busy; refusing UI action');
  const snap = currentSnapshot;
  if (!snap || r.snapshot !== snap.id || Date.now() - snap.at > 30000) throw Error('Stale UI snapshot; inspect again');
  const entry = snap.elements.get(r.id);
  if (!entry) throw Error('Not an actionable element in the snapshot');
  if (!spec.accepts(entry.node)) throw Error(`Action ${r.action} does not apply to this element`);
  if (r.expectedLabel !== (entry.node.label || '') || r.expectedName !== entry.node.name) throw Error('Element identity mismatch');
  const target = A.target(entry.handle), fresh = uiTree(false);
  if (fresh.result.truncated) throw Error('UI tree incomplete; inspect again');
  if (contextKey(fresh.result.nodes) !== snap.context) throw Error('UI content changed; inspect again');
  const n = fresh.result.nodes[fresh.objects.findIndex(o => o.equals(target))];
  if (!n || !n.visible || !n.enabled || n.name !== entry.node.name || (n.label || '') !== (entry.node.label || '')
      || n.bounds.some((v, i) => Math.abs(v - entry.node.bounds[i]) > 2)) throw Error('Element changed; inspect again');
  // Hit test at the element's centre: it (or a descendant) must be what a click would reach.
  const pos = Memory.alloc(8); pos.writeFloat(n.bounds[0] + n.bounds[2] / 2); pos.add(4).writeFloat(n.bounds[1] + n.bounds[3] / 2);
  for (let i = fresh.panels.length - 1; i > n.panel; i--)
    if (!call(cls('Panel'), 'Pick', fresh.panels[i], [pos]).isNull()) throw Error('A higher UI panel covers the element (occluded)');
  const hit = call(cls('Panel'), 'Pick', fresh.panels[n.panel], [pos]);
  let inside = false;
  for (let x = hit, i = 0; !x.isNull() && i < 64; x = parentOf(x), i++) if (x.equals(target)) { inside = true; break; }
  // A combobox/dropdown's own open list covers it with a transparent floating root.
  if (!inside && spec.coveredByOwnList && !hit.isNull() && nameOf(hit) === 'floating-element-root') inside = true;
  if (!inside) throw Error('Element is occluded' + (hit.isNull() ? '' : ` (by ${className(A.objectClass(hit))} ${nameOf(hit)})`));
  return {target, node: n, snap};
}

function elementAction(r) {
  const spec = ELEMENT_ACTIONS[r.action];
  if (!spec) throw Error('Unknown UI action: ' + r.action);
  const {target, node, snap} = resolveTarget(r, spec);
  currentSnapshot = null; // consume first: never allow a repeated submission
  try {
    const extra = spec.perform(target, node, r) || {};
    return {invoked: true, action: r.action, element: {name: node.name, label: node.label || ''}, ...extra, verificationRequired: true};
  } finally { releaseSnapshot(snap); }
}

// Actions that do not target a snapshot element.
const GLOBAL_ACTIONS = {
  key: r => pressKey(r.key),
  closeDropdowns() {
    // Hide every open SIDropdown list (HideDropdown is a no-op on closed ones).
    const t = uiTree(false); let closed = 0;
    t.result.nodes.forEach((x, i) => { if (x.dropdown) { try { call(cls('SIDropdown'), 'HideDropdown', t.objects[i]); closed++; } catch (e) {} } });
    return {invoked: true, closed};
  },
  // Close the global search card the way a click outside it does (BaseCardTemplateImpl.OnClicked).
  closeSearch() {
    const t = uiTree(false); let closed = 0;
    t.result.nodes.forEach((x, i) => {
      if (x.type !== 'BaseCardTemplateImpl') return;
      for (let a = x; a; a = a.parent === null ? null : t.result.nodes[a.parent])
        if (a.name === 'GlobalSearchCard') { call(cls('BaseCardTemplateImpl'), 'OnClicked', t.objects[i]); closed++; break; }
    });
    return {invoked: true, closed};
  },
  inputInfo: () => inputInfo(),
  removeVirtual: () => removeVirtualDevices(),
  recordStart: r => recordStart(r.classes),
  recordStop: () => recordStop(),
};

function uiAction(r) {
  return GLOBAL_ACTIONS[r.action] ? GLOBAL_ACTIONS[r.action](r) : elementAction(r);
}
