// IL2CPP runtime helpers. The agent files in this folder are concatenated in
// name order by server.py and loaded as one Frida script.
const gm = Process.getModuleByName('GameAssembly.dylib');
function api(n, r, a) { return new NativeFunction(gm.getExportByName('il2cpp_' + n), r, a); }
const A = {
  arrayLength: api('array_length', 'uint64', ['pointer']),
  parent: api('class_get_parent', 'pointer', ['pointer']),
  unbox: api('object_unbox', 'pointer', ['pointer']),
  stringLength: api('string_length', 'int', ['pointer']),
  stringChars: api('string_chars', 'pointer', ['pointer']),
  stringNew: api('string_new', 'pointer', ['pointer']),
  domain: api('domain_get', 'pointer', []),
  attach: api('thread_attach', 'pointer', ['pointer']),
  detach: api('thread_detach', 'void', ['pointer']),
  assemblies: api('domain_get_assemblies', 'pointer', ['pointer', 'pointer']),
  image: api('assembly_get_image', 'pointer', ['pointer']),
  count: api('image_get_class_count', 'uint64', ['pointer']),
  klass: api('image_get_class', 'pointer', ['pointer', 'uint64']),
  name: api('class_get_name', 'pointer', ['pointer']),
  ns: api('class_get_namespace', 'pointer', ['pointer']),
  fields: api('class_get_fields', 'pointer', ['pointer', 'pointer']),
  fname: api('field_get_name', 'pointer', ['pointer']),
  offset: api('field_get_offset', 'int', ['pointer']),
  ftype: api('field_get_type', 'pointer', ['pointer']),
  tname: api('type_get_name', 'pointer', ['pointer']),
  free: api('free', 'void', ['pointer']),
  methods: api('class_get_methods', 'pointer', ['pointer', 'pointer']),
  mname: api('method_get_name', 'pointer', ['pointer']),
  argc: api('method_get_param_count', 'uint', ['pointer']),
  param: api('method_get_param', 'pointer', ['pointer', 'uint']),
  returnType: api('method_get_return_type', 'pointer', ['pointer']),
  objectClass: api('object_get_class', 'pointer', ['pointer']),
  classFromType: api('class_from_type', 'pointer', ['pointer']),
  valueType: api('class_is_valuetype', 'bool', ['pointer']),
  root: api('gchandle_new', 'pointer', ['pointer', 'bool']),
  unroot: api('gchandle_free', 'void', ['pointer']),
  target: api('gchandle_get_target', 'pointer', ['pointer']),
  invoke: api('runtime_invoke', 'pointer', ['pointer', 'pointer', 'pointer', 'pointer']),
  staticValue: api('field_static_get_value', 'void', ['pointer', 'pointer']),
};
function attached(fn) { const t = A.attach(A.domain()); try { return fn(); } finally { A.detach(t); } }
function typeName(t) { const p = A.tname(t); try { return p.readUtf8String(); } finally { A.free(p); } }
function className(c) { return A.name(c).readUtf8String(); }
function fieldList(c) {
  const it = Memory.alloc(Process.pointerSize); it.writePointer(ptr(0)); const out = [];
  for (;;) {
    const f = A.fields(c, it); if (f.isNull()) break;
    out.push({pointer: f, name: A.fname(f).readUtf8String(), offset: A.offset(f), type: typeName(A.ftype(f))});
  }
  return out;
}
function methodList(c) {
  const it = Memory.alloc(Process.pointerSize); it.writePointer(ptr(0)); const out = [];
  for (;;) {
    const m = A.methods(c, it); if (m.isNull()) break;
    const parameters = []; for (let i = 0; i < A.argc(m); i++) parameters.push(typeName(A.param(m, i)));
    out.push({pointer: m, address: m.readPointer(), name: A.mname(m).readUtf8String(), parameters, returns: typeName(A.returnType(m))});
  }
  return out;
}

// Method/field lookup walks the class hierarchy and is cached.
const methodCache = new Map(), fieldCache = new Map();
function findMethod(c, name, argc = 0, firstParam) {
  const key = c + ':' + name + ':' + argc + ':' + (firstParam || '');
  if (methodCache.has(key)) return methodCache.get(key);
  for (let k = c; !k.isNull(); k = A.parent(k)) {
    const m = methodList(k).find(m => m.name === name && m.parameters.length === argc && (!firstParam || m.parameters[0] === firstParam));
    if (m) { methodCache.set(key, m.pointer); return m.pointer; }
  }
  throw Error('Method not found: ' + name);
}
function fieldOffset(c, name) {
  const key = c + ':' + name;
  if (fieldCache.has(key)) return fieldCache.get(key);
  for (let k = c; !k.isNull(); k = A.parent(k)) {
    const f = fieldList(k).find(f => f.name === name);
    if (f) { fieldCache.set(key, f.offset); return f.offset; }
  }
  throw Error('Field not found: ' + name);
}
// Invoke a managed method. Value-type arguments are passed as pointers to their storage.
function call(c, name, obj, args = [], firstParam) {
  const ex = Memory.alloc(Process.pointerSize); ex.writePointer(ptr(0));
  const argv = args.length ? Memory.alloc(Process.pointerSize * args.length) : ptr(0);
  args.forEach((a, i) => argv.add(i * Process.pointerSize).writePointer(a));
  const result = A.invoke(findMethod(c, name, args.length, firstParam), obj, argv, ex);
  if (!ex.readPointer().isNull()) throw Error('Managed exception in ' + name);
  return result;
}
const boolOf = p => A.unbox(p).readU8() !== 0;
const i32 = v => { const m = Memory.alloc(4); m.writeS32(v); return m; };
const i64 = v => { const m = Memory.alloc(8); m.writeS64(v); return m; };
const u8 = v => { const m = Memory.alloc(4); m.writeU8(v ? 1 : 0); return m; };
const managedString = t => A.stringNew(Memory.allocUtf8String(t));
function readString(p) {
  if (p.isNull()) return '';
  const len = A.stringLength(p);
  if (len < 0 || len > 65536) throw Error('String exceeds safe read limit');
  return A.stringChars(p).readUtf16String(len);
}
function readList(p) {
  if (p.isNull()) return [];
  const c = A.objectClass(p), size = p.add(fieldOffset(c, '_size')).readS32();
  if (size < 0 || size > 20000) throw Error('Invalid list size');
  const arr = p.add(fieldOffset(c, '_items')).readPointer();
  if (size && (arr.isNull() || size > Number(A.arrayLength(arr)))) throw Error('Invalid list storage');
  const out = []; for (let i = 0; i < size; i++) out.push(arr.add(32 + i * Process.pointerSize).readPointer()); return out;
}
function isA(c, base) { if (!base) return false; for (let k = c; !k.isNull(); k = A.parent(k)) if (k.equals(base)) return true; return false; }
