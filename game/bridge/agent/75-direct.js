// Direct game calls: do a routine job by calling the game's own code instead of clicking through
// screens (docs/next-steps.md #6). Each call runs on the UI thread, like a click. The UI path stays
// the fallback (game/ui/direct.mjs decides). Mapped 2026-10-18 with 70-explore.js:
//   A profile visit is a panel-history node: panel "PlayerReport" with arguments Player
//   (PersonReference: database index) and Team. Back re-opens a node with
//   PanelHistoryManager.OpenPanel(node). To open any person: copy the latest profile node, put
//   PersonReference(index) in its Player argument, and open the copy, as Back would.
//   A person's index is learned from a profile opened once through the UI (currentPerson).
// STATUS (2026-10-18): used by navigate.mjs openPlayer (direct first, the search as the fallback).
// UI 7.6 s vs direct 1.15 s per profile (local/runs/benchmarks). The faults while mapping came from a
// PersonReference built from an Int32 (no session pair); it is now copied from one the game made.
const objectNew = new NativeFunction(gm.getExportByName('il2cpp_object_new'), 'pointer', ['pointer']);
// Exceptions: Frida's default ('steal') turns a fault inside the game's code into a JS error and abandons
// the call midway; 'propagate' hands it to the game, and FM crashed on openPerson (2026-10-18). Steal it is.
const wbarrier = new NativeFunction(gm.getExportByName('il2cpp_gc_wbarrier_set_field'), 'void', ['pointer', 'pointer', 'pointer']);
const PROFILE_PANEL = 2208093440;   // PanelID.m_id of "PlayerReport" (FM26 build 23583635)
const PERSON_TABLE = 1;             // DatabaseTableType of people

/** A method by exact parameter types, own or inherited (overloads differ by type, not count). */
function methodBySig(c, name, params) {
  for (let k = c; !k.isNull(); k = A.parent(k)) {
    const m = methodList(k).find(m => m.name === name && m.parameters.length === params.length && m.parameters.every((p, i) => p === params[i] || (params[i] instanceof RegExp && params[i].test(p))));
    if (m) return m.pointer;
  }
  throw Error(`Method not found: ${name}(${params.join(', ')})`);
}
// Which game method holds a native address (to name a crash site): the method that starts closest below it.
let methodStarts = null, lastCrash = [];
function methodAt(addr) {
  if (!methodStarts) {
    methodStarts = [];
    for (const x of indexClasses()) if (/^(SI|FM|UnityEngine\.UIElements)/.test(x.ns))
      for (const m of methodList(x.c)) if (!m.address.isNull()) methodStarts.push({a: m.address, name: `${x.ns}.${x.name}.${m.name}`});
    methodStarts.sort((p, q) => p.a.compare(q.a));
  }
  let best = null;
  for (const m of methodStarts) { if (m.a.compare(addr) <= 0) best = m; else break; }
  return best && addr.sub(best.a).toUInt32() < 0x10000 ? `${best.name}+0x${addr.sub(best.a).toString(16)}` : null;
}
function invoke(method, obj, args = []) {
  const ex = Memory.alloc(Process.pointerSize); ex.writePointer(ptr(0));
  const argv = args.length ? Memory.alloc(Process.pointerSize * args.length) : ptr(0);
  args.forEach((a, i) => argv.add(i * Process.pointerSize).writePointer(a));
  let r;
  try { r = A.invoke(method, obj, argv, ex); }
  catch (e) {
    // Raw addresses only here (the UI thread is waiting); explore({what: 'crash'}) names them later.
    let trace = [];
    try { trace = Thread.backtrace(e.context, Backtracer.FUZZY).slice(0, 12); } catch (x) {}
    lastCrash = e.context ? [e.context.pc, ...trace] : [];
    const where = lastCrash.length ? 'pc ' + lastCrash[0] + ' (fm explore crash)' : '';
    throw Error(`${e.message}${where ? ' at ' + where : ''}`);
  }
  const exc = ex.readPointer();
  if (!exc.isNull()) {
    let what = '';
    try {
      const ec = A.objectClass(exc), msg = readString(exc.add(fieldOffset(ec, '_message')).readPointer());
      let trace = ''; try { trace = readString(exc.add(fieldOffset(ec, '_stackTraceString')).readPointer()); } catch (e) {}
      what = `${className(ec)}: ${msg}${trace ? ' | ' + trace.split('\n').slice(0, 4).join(' / ') : ''}`;
    } catch (e) {}
    throw Error('Managed exception in a direct call' + (what ? ': ' + what : ''));
  }
  return r;
}
const sfield = (c, name) => fieldOffset(c, name) - 16;   // a field's offset inside a struct's data
/** Struct items of a List<struct>: pointers to each item's data, with the item class. */
function structList(list) {
  if (list.isNull()) return {items: [], cls: null};
  const lc = A.objectClass(list), arr = list.add(fieldOffset(lc, '_items')).readPointer(), size = list.add(fieldOffset(lc, '_size')).readS32();
  const cls = elementClass(A.objectClass(arr)), step = valueSize(cls, ptr(0));
  return {items: Array.from({length: size}, (_, i) => arr.add(32 + i * step)), cls, arr};
}

function historyManager() {
  const mc = findClass('FM.UI.PanelHistoryManagerModule');
  const mod = invoke(findMethod(mc, 'get_Instance', 0), ptr(0));
  if (mod.isNull()) throw Error('Panel history not available');
  const hm = invoke(findMethod(mc, 'get_PanelHistoryManager', 0), mod);
  if (hm.isNull()) throw Error('Panel history not available');
  return {hm, hc: findClass('FM.UI.PanelHistoryManager'), nc: findClass('FM.UI.PanelHistoryNode')};
}
/** Profile nodes in the history, newest last: {node, args, person index}. */
function profileNodes() {
  const {hm, hc, nc} = historyManager();
  const {items} = structList(hm.add(fieldOffset(hc, 'm_history')).readPointer());
  const out = [];
  for (const node of items) {
    if (node.add(sfield(nc, 'm_id')).readU32() !== PROFILE_PANEL) continue;
    const args = structList(node.add(sfield(nc, 'm_arguments')).readPointer());
    const player = args.items.find(a => readString(a.add(sfield(args.cls, 'Name')).readPointer()) === 'Player');
    if (!player) continue;
    const tv = player.add(sfield(args.cls, 'Value')).readPointer();
    const ref = tv.isNull() ? ptr(0) : tv.add(fieldOffset(A.objectClass(tv), 'm_value')).readPointer();
    if (ref.isNull()) continue;
    const rc = A.objectClass(ref);
    out.push({node, args, index: ref.add(fieldOffset(rc, 'm_index')).readS32(), table: ref.add(fieldOffset(rc, '<Type>k__BackingField')).readS32()});
  }
  return out;
}
/** The person on the most recently opened profile (to learn a name's index after a UI open). */
function currentPerson() {
  const p = profileNodes().at(-1);
  return p ? {index: p.index, table: p.table} : null;
}
// A PersonReference as the game builds one: from its id pairs. PersonReference(Int32) leaves out the
// session pair (1198877028 → a value that changes every game session) and the hash, and the profile
// faulted on it ("access violation 0xa2", 2026-10-18). So: copy a reference the game made (a profile
// in the history), swap the combined index, construct from that list.
const COMBINED = 1685218662;   // pair id of (table << 24 | index)
function personReference(index, template) {
  const c = findClass('FM.UI.PersonReference'), o = objectNew(c);
  if (!template) throw Error('No PersonReference to copy: open a profile through the UI first');
  const tc = A.objectClass(template), pairs = template.add(fieldOffset(tc, 'm_id')).readPointer(), lc = A.objectClass(pairs);
  const list = objectNew(lc);
  invoke(methodBySig(lc, '.ctor', [/^System\.Collections\.Generic\.IEnumerable<SI\.Interop\.InteropReference\.Pair>$/]), list, [pairs]);
  const {items, cls} = structList(list), combined = items.find(p => p.add(sfield(cls, 'm_id')).readU32() === COMBINED);
  if (!combined) throw Error('No combined-index pair in the template reference');
  combined.add(sfield(cls, 'm_value')).writeS32((PERSON_TABLE << 24) | index);
  invoke(methodBySig(c, '.ctor', [/^System\.Collections\.Generic\.List<SI\.Interop\.InteropReference\.Pair>$/]), o, [list]);
  const got = o.add(fieldOffset(c, 'm_index')).readS32(), table = o.add(fieldOffset(c, '<Type>k__BackingField')).readS32();
  if (got !== index || table !== PERSON_TABLE) throw Error(`PersonReference(${index}) came out as table ${table} index ${got}`);
  return o;
}
function templatePerson() {
  const t = profileNodes().at(-1);
  if (!t) return null;
  const player = t.args.items.find(a => readString(a.add(sfield(t.args.cls, 'Name')).readPointer()) === 'Player');
  const tv = player.add(sfield(t.args.cls, 'Value')).readPointer();
  return tv.add(fieldOffset(A.objectClass(tv), 'm_value')).readPointer();
}
function openPerson(index) {
  if (!Number.isInteger(index) || index <= 0 || index >= 1 << 24) throw Error('person index required (a database index, < 2^24)');
  const template = profileNodes().at(-1);
  if (!template) throw Error('No profile in the panel history yet: open one through the UI first');
  const {hm, hc, nc} = historyManager();
  const handles = [];
  const keep = o => { handles.push(A.root(o, 0)); return o; };   // pinned until the call returns
  try {
    // The person, wrapped as the history wraps it (a pooled ReferenceTypedValue).
    const tvc = findClass('SI.Core.TypedValue');
    const value = keep(invoke(findMethod(tvc, 'GetReferenceTypedValue', 0), ptr(0)));
    // SetValue is abstract on TypedValue: resolve it on the pooled value's own class (runtime_invoke doesn't dispatch).
    invoke(methodBySig(A.objectClass(value), 'SetValue', ['System.Object']), value, [keep(personReference(index, templatePerson()))]);
    // A copy of the template's argument list (the history keeps its own), Player replaced.
    const oldList = template.node.add(sfield(nc, 'm_arguments')).readPointer(), lc = A.objectClass(oldList);
    const list = keep(objectNew(lc));
    invoke(methodBySig(lc, '.ctor', [/^System\.Collections\.Generic\.IEnumerable<FM\.UI\.PanelHistoryNode\.Argument>$/]), list, [oldList]);
    const args = structList(list), player = args.items.find(a => readString(a.add(sfield(args.cls, 'Name')).readPointer()) === 'Player');
    wbarrier(args.arr, player.add(sfield(args.cls, 'Value')), value);
    // A copy of the node pointing at the new list, opened as Back would open it.
    const size = valueSize(nc, ptr(0)), node = Memory.alloc(size);
    Memory.copy(node, template.node, size);
    node.add(sfield(nc, 'm_arguments')).writePointer(list);
    invoke(methodBySig(hc, 'OpenPanel', ['FM.UI.PanelHistoryNode', 'SI.Bindable.Panel.TransitionCompleteCallback']), hm, [node, ptr(0)]);
    return {invoked: true, operation: 'open-person', index, template: template.index};
  } finally { for (const h of handles) A.unroot(h); }
}
function direct(r) {
  if (r.action === 'openPerson') return openPerson(r.index);
  if (r.action === 'currentPerson') return currentPerson();
  if (r.action === 'comparePerson') {   // read-only: ours vs the game's PersonReference for the same index
    const theirs = templatePerson(), index = r.index ?? currentPerson().index;
    return {ours: dumpObject(personReference(index, theirs), 3), theirs: dumpObject(theirs, 3)};
  }
  throw Error('direct: openPerson | currentPerson');
}
