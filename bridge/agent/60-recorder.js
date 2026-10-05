// Recorder: log FM UI method calls while the player performs an action by hand.
// This is how unknown controls are mapped: record a real click, then replay the entry
// point (e.g. SIDropdown.TriggerSelectionEvent for fee presets). See docs/ui-notes.md.
let recording = null;
const RECORD_SKIP = /^(get_|set_Weak|\.ctor|\.cctor|OnGeometryChanged|UpdateDynamicElementsStyle|BindToData|UnbindFromData|LazyInit|RegisterOrUnregister|CalculateButtonNavigation|ProcessFlags|<)/;
const RECORD_DEFAULT = ['FMCombobox', 'SIDropdown', 'DropdownRowNavigatable', 'StreamedDropdownList', 'NavigatableVisualElement', 'SILongField', 'SIClickable'];
function describeObject(o) {
  try { const n = nameOf(o); return className(A.objectClass(o)) + (n ? '#' + n : ''); } catch (e) { return '?'; }
}
function recordStart(names) {
  if (recording) throw Error('Already recording');
  recording = {events: [], hooks: [], started: Date.now()};
  for (const n of names || RECORD_DEFAULT) {
    const c = classes.get(n); if (!c) continue;
    for (const m of methodList(c)) {
      if (m.address.isNull() || RECORD_SKIP.test(m.name)) continue;
      try {
        recording.hooks.push(Interceptor.attach(m.address, {onEnter(args) {
          if (!recording || recording.events.length > 5000) return;
          const ev = {t: Date.now() - recording.started, cls: n, method: m.name, params: m.parameters};
          try { ev.self = describeObject(args[0]); } catch (e) {}
          if (/^System\.(Int32|Boolean)$/.test(m.parameters[0] || '')) { try { ev.arg0 = args[1].toInt32(); } catch (e) {} }
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
