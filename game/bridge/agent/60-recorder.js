// Recorder: log FM UI method calls while the player performs an action by hand.
// This is how unknown controls are mapped: record a real click, then replay the entry
// point (e.g. SIDropdown.TriggerSelectionEvent for fee presets). See docs/ui-notes.md.
let recording = null;
const RECORD_SKIP = /^(get_|set_Weak|\.ctor|\.cctor|OnGeometryChanged|UpdateDynamicElementsStyle|BindToData|UnbindFromData|LazyInit|RegisterOrUnregister|CalculateButtonNavigation|ProcessFlags|<)/;
const RECORD_DEFAULT = ['FMCombobox', 'SIDropdown', 'DropdownRowNavigatable', 'StreamedDropdownList', 'NavigatableVisualElement', 'SILongField', 'SIClickable'];
function describeObject(o) {
  try { const n = nameOf(o); return className(A.objectClass(o)) + (n ? '#' + n : ''); } catch (e) { return '?'; }
}
function recordStart(names, {pattern} = {}) {
  if (recording) throw Error('Already recording');
  recording = {events: [], hooks: [], started: Date.now()};
  const only = pattern ? new RegExp(pattern) : null;
  // Any game class by name (70-explore.js), not only the UI classes discovered at start-up.
  for (const n of names || RECORD_DEFAULT) {
    const c = classes.get(n) || findClass(n); if (!c) continue;
    for (const m of methodList(c)) {
      if (m.address.isNull() || RECORD_SKIP.test(m.name) || (only && !only.test(m.name))) continue;
      // How to read each argument: ints/bools by value, strings as text, objects by class (and name).
      const stat = isStatic(m.pointer), kinds = m.parameters.map((t, i) => {
        if (/^System\.(Int32|Boolean)$/.test(t)) return 'int';
        if (t === 'System.String') return 'string';
        try { return A.valueType(A.classFromType(A.param(m.pointer, i))) ? 'value' : 'object'; } catch (e) { return 'value'; }
      });
      try {
        recording.hooks.push(Interceptor.attach(m.address, {onEnter(args) {
          if (!recording || recording.events.length > 5000) return;
          const ev = {t: Date.now() - recording.started, cls: n, method: m.name, params: m.parameters};
          const base = stat ? 0 : 1;
          if (!stat) { try { ev.self = describeObject(args[0]); } catch (e) {} }
          const values = kinds.map((k, i) => {
            try {
              const a = args[base + i];
              if (k === 'int') return a.toInt32();
              if (k === 'string') return a.isNull() ? null : readString(a).slice(0, 80);
              if (k === 'object') return a.isNull() ? null : describeObject(a);
            } catch (e) {}
            return undefined;
          });
          if (values.some(v => v !== undefined)) ev.args = values;
          recording.events.push(ev);
        }}));
      } catch (e) {}
    }
  }
  return {recording: true, hooks: recording.hooks.length};
}
function recordStop() {
  if (!recording) throw Error('Not recording');
  for (const h of recording.hooks) h.detach();
  const events = recording.events; recording = null;
  return {events};
}
