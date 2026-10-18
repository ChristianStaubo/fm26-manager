// Explore the game's own classes (development): find the objects and methods behind a screen, so a
// routine job can call the game directly instead of clicking through the UI (docs/next-steps.md #6).
//   explore({what: 'classes', pattern})        classes whose "namespace.Name" matches (regex, case-insensitive)
//   explore({what: 'methods', name, pattern})  a class's methods (own and inherited), static or not
//   explore({what: 'fields', name})            a class's fields
// The recorder (60-recorder.js) can then hook any of these classes by name while the user (or a
// command) does the job once.
let classIndex = null;
function indexClasses() {
  if (classIndex) return classIndex;
  classIndex = [];
  const count = Memory.alloc(Process.pointerSize), assemblies = A.assemblies(A.domain(), count);
  for (let i = 0; i < Number(count.readU64()); i++) {
    const image = A.image(assemblies.add(i * Process.pointerSize).readPointer());
    for (let j = 0; j < Number(A.count(image)); j++) {
      const c = A.klass(image, j);
      classIndex.push({c, name: className(c), ns: A.ns(c).readUtf8String()});
    }
  }
  return classIndex;
}
const METHOD_STATIC = 0x10;
const methodFlags = new NativeFunction(gm.getExportByName('il2cpp_method_get_flags'), 'uint32', ['pointer', 'pointer']);
const isStatic = m => (methodFlags(m, ptr(0)) & METHOD_STATIC) !== 0;
/** A class by "Name" or "Namespace.Name" (first match). */
function findClass(name) {
  const hit = indexClasses().find(x => x.name === name || `${x.ns}.${x.name}` === name);
  return hit ? hit.c : null;
}
function explore(r) {
  if (r.what === 'captured') return captures.splice(0);
  if (r.what === 'capture') return capture(r);
  if (r.what === 'crash') return lastCrash.map(a => { const m = Process.findModuleByAddress(a); const rg = Process.findRangeByAddress(a); return {address: String(a), module: m ? `${m.name}+0x${a.sub(m.base).toString(16)}` : null, method: methodAt(a), range: rg ? {base: String(rg.base), size: rg.size, prot: rg.protection, file: rg.file ? rg.file.path : null} : null}; });
  // Methods across many classes: classes matching `classes`, method names matching `pattern`.
  if (r.what === 'find') {
    const cre = new RegExp(r.classes || '^FM\\.', 'i'), mre = new RegExp(r.pattern, 'i'), out = [];
    for (const x of indexClasses()) {
      if (!cre.test(`${x.ns}.${x.name}`)) continue;
      for (const m of methodList(x.c)) if (mre.test(m.name) || (r.params && m.parameters.some(p => new RegExp(r.params).test(p))))
        out.push({cls: `${x.ns}.${x.name}`, name: m.name, parameters: m.parameters, returns: m.returns, static: isStatic(m.pointer)});
      if (out.length >= (r.limit || 200)) break;
    }
    return out;
  }
  const re = r.pattern ? new RegExp(r.pattern, 'i') : null, limit = Math.min(r.limit || 200, 2000);
  if (r.what === 'classes') {
    if (!re) throw Error('pattern required');
    return indexClasses().filter(x => re.test(`${x.ns}.${x.name}`)).slice(0, limit)
      .map(x => { const p = A.parent(x.c); return {name: x.name, ns: x.ns, parent: p.isNull() ? null : className(p), methods: methodList(x.c).length}; });
  }
  const c = findClass(r.name);
  if (!c) throw Error('Class not found: ' + r.name);
  if (r.what === 'methods') {
    const out = [];
    for (let k = c, depth = 0; !k.isNull() && depth < (r.depth ?? 1); k = A.parent(k), depth++)
      for (const m of methodList(k)) if (!re || re.test(m.name))
        out.push({cls: className(k), name: m.name, parameters: m.parameters, returns: m.returns, static: isStatic(m.pointer), hookable: !m.address.isNull()});
    return out.slice(0, limit);
  }
  if (r.what === 'fields') return fieldList(c).map(f => ({name: f.name, type: f.type, offset: f.offset}));
  throw Error('what: classes | methods | fields | capture | captured');
}

// Dump a managed object's instance fields, `depth` levels down (strings, numbers, enums, structs,
// lists of objects), to see what the game passes around (e.g. the OpenPanelEvent behind a click).
const FIELD_STATIC = 0x10;
const fieldFlags = new NativeFunction(gm.getExportByName('il2cpp_field_get_flags'), 'int', ['pointer']);
const isEnum = new NativeFunction(gm.getExportByName('il2cpp_class_is_enum'), 'bool', ['pointer']);
const elementClass = new NativeFunction(gm.getExportByName('il2cpp_class_get_element_class'), 'pointer', ['pointer']);
const valueSize = new NativeFunction(gm.getExportByName('il2cpp_class_value_size'), 'int32', ['pointer', 'pointer']);
function instanceFields(c) {
  const out = [];
  for (let k = c; !k.isNull(); k = A.parent(k)) for (const f of fieldList(k)) if (!(fieldFlags(f.pointer) & FIELD_STATIC)) out.push(f);
  return out;
}
const PRIMITIVE = {'System.Int32': a => a.readS32(), 'System.UInt32': a => a.readU32(), 'System.Int64': a => a.readS64().toString(),
  'System.UInt64': a => a.readU64().toString(), 'System.Boolean': a => a.readU8() !== 0, 'System.Single': a => a.readFloat(),
  'System.Double': a => a.readDouble(), 'System.Byte': a => a.readU8(), 'System.Int16': a => a.readS16(), 'System.UInt16': a => a.readU16()};
function dumpValue(addr, f, depth) {
  try {
    if (PRIMITIVE[f.type]) return PRIMITIVE[f.type](addr);
    if (f.type === 'System.String') return readString(addr.readPointer()).slice(0, 120);
    const fc = A.classFromType(A.ftype(f.pointer));
    if (A.valueType(fc)) {
      if (isEnum(fc)) return `${className(fc)}:${addr.readS32()}`;
      if (depth <= 0) return `(${className(fc)})`;
      const out = {_struct: className(fc)};
      for (const g of instanceFields(fc)) out[g.name] = dumpValue(addr.add(g.offset - 16), g, depth - 1);
      return out;
    }
    return dumpObject(addr.readPointer(), depth);
  } catch (e) { return '?' + e.message.slice(0, 40); }
}
function dumpObject(o, depth = 2) {
  if (o.isNull()) return null;
  const c = A.objectClass(o), name = className(c);
  if (name === 'String') return readString(o).slice(0, 120);
  if (depth <= 0) return `<${name}>`;
  if (/^List`1$/.test(name)) {
    const items = o.add(fieldOffset(c, '_items')).readPointer(), size = o.add(fieldOffset(c, '_size')).readS32();
    const ec = items.isNull() ? null : elementClass(A.objectClass(items));
    if (!ec) return {_list: name, size, element: null};
    if (A.valueType(ec)) {   // structs sit inline in the array (data from offset 32), each valueSize long
      const step = valueSize(ec, ptr(0)), fields = instanceFields(ec);
      return {_list: name, size, element: className(ec), items: Array.from({length: Math.min(size, 10)}, (_, i) => {
        const at = items.add(32 + i * step), x = {};
        for (const g of fields) x[g.name] = dumpValue(at.add(g.offset - 16), g, depth - 1);
        return x;
      })};
    }
    return {_list: name, size, items: readList(o).slice(0, 10).map(x => dumpObject(x, depth - 1))};
  }
  const out = {_class: name};
  for (const f of instanceFields(c)) out[f.name] = dumpValue(o.add(f.offset), f, depth - 1);
  return out;
}
// Capture the arguments of the next call(s) to Class.method, dumped `depth` levels down.
const captures = [];
function capture(r) {
  const c = findClass(r.name); if (!c) throw Error('Class not found: ' + r.name);
  const ms = methodList(c).filter(m => m.name === r.method && !m.address.isNull() && (r.argc == null || m.parameters.length === r.argc));
  if (!ms.length) throw Error('Method not found: ' + r.method);
  let left = r.count || 1;
  for (const m of ms) {
    const stat = isStatic(m.pointer);
    const h = Interceptor.attach(m.address, {onEnter(args) {
      if (left <= 0) return;
      left--;
      const ev = {t: Date.now(), cls: r.name, method: m.name, params: m.parameters, args: []};
      m.parameters.forEach((t, i) => {
        const a = args[(stat ? 0 : 1) + i];
        try {
          if (/^System\.(Int32|UInt32|Boolean)$/.test(t)) ev.args.push(a.toInt32());
          else if (A.valueType(A.classFromType(A.param(m.pointer, i)))) {
            // arm64: a struct over 16 bytes is passed as a pointer to its data (no object header).
            const vc = A.classFromType(A.param(m.pointer, i)), size = valueSize(vc, ptr(0));
            if (size > 16 && !isEnum(vc)) { const x = {_struct: className(vc)}; for (const g of instanceFields(vc)) x[g.name] = dumpValue(a.add(g.offset - 16), g, (r.depth || 3) - 1); ev.args.push(x); }
            else ev.args.push(`(value ${t})`);
          }
          else ev.args.push(dumpObject(a, r.depth || 3));
        } catch (e) { ev.args.push('?' + e.message); }
      });
      captures.push(ev);
      if (left <= 0) setTimeout(() => { try { h.detach(); } catch (e) {} }, 0);
    }});
  }
  return {hooked: ms.length, count: left};
}
