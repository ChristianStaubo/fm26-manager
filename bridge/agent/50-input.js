// Virtual keyboard via Unity's Input System (Escape/Enter/Tab only).
// A virtual MOUSE was tried and dropped: clicks registered only intermittently and a stuck
// button swallowed the player's real clicks. Keys are released 80 ms after the press.
let keyboard = null, lastEventTime = 0; // keyboard: legacy persistent device, removed by removeVirtualDevices
const deferred = [];
function defer(ms, fn) { deferred.push({at: Date.now() + ms, fn}); }
function runDeferred() {
  for (let i = 0; i < deferred.length;) {
    if (deferred[i].at <= Date.now()) {
      const d = deferred.splice(i, 1)[0];
      try { d.fn(); } catch (e) { send({kind: 'error', where: 'deferred input', message: e.message}); }
    } else i++;
  }
}
const inputSettings = () => call(cls('InputSystem'), 'get_settings', ptr(0));
function setBackgroundBehavior(v) { const s = inputSettings(); call(A.objectClass(s), 'set_backgroundBehavior', s, [i32(v)]); }
function inputInfo() {
  const s = inputSettings();
  return {focused: boolOf(call(cls('Application'), 'get_isFocused', ptr(0))),
    backgroundBehavior: A.unbox(call(A.objectClass(s), 'get_backgroundBehavior', s)).readS32()};
}
// Queue one state event, starting from the device's current state.
function queueState(handle, mutate) {
  const evPtr = Memory.alloc(8); evPtr.writePointer(ptr(0));
  call(cls('StateEvent'), 'From', ptr(0), [A.target(handle), evPtr, i32(2 /* Allocator.Temp */)]);
  const ev = evPtr.readPointer();
  if (ev.isNull()) throw Error('Could not create input state event');
  // Header: type(4) size(2) deviceId(2) eventId(4) time(8 @ +12); events must be newer than the last.
  const t = Math.max(ev.add(12).readDouble(), lastEventTime) + 0.001;
  ev.add(12).writeDouble(t); lastEventTime = t;
  mutate(ev.add(24)); // after the 20-byte header and 4-byte state format
  const arg = Memory.alloc(8); arg.writePointer(ev);
  call(cls('InputSystem'), 'QueueEvent', ptr(0), [arg]);
}
const KEYS = {Enter: 2, Tab: 3, Escape: 60}; // UnityEngine.InputSystem.Key
function pressKey(key) {
  // A temporary keyboard per press: ignore window focus for the press, then remove the device
  // and restore the setting, so nothing lingers that could block the player's real input.
  const bit = KEYS[key];
  if (bit === undefined) throw Error('Unsupported key: ' + key);
  const s = inputSettings(), before = A.unbox(call(A.objectClass(s), 'get_backgroundBehavior', s)).readS32();
  setBackgroundBehavior(2); // IgnoreFocus: the game is usually not the focused window
  const kb = A.root(call(cls('InputSystem'), 'AddDevice', ptr(0), [managedString('Keyboard'), managedString('ClaudeKeyboard'), ptr(0)]), 0);
  const clear = st => { for (let i = 0; i < 16; i++) st.add(i).writeU8(0); };
  // The focus setting and new device take a few frames to apply: press at 300 ms, release 100 ms later.
  defer(300, () => queueState(kb, st => { clear(st); st.add(bit >> 3).writeU8(1 << (bit & 7)); }));
  defer(400, () => queueState(kb, clear));
  defer(700, () => {
    try { call(cls('InputSystem'), 'RemoveDevice', ptr(0), [A.target(kb)]); } finally { A.unroot(kb); setBackgroundBehavior(before === 2 ? 0 : before); }
  });
  return {invoked: true, key, verificationRequired: true};
}
// Remove every virtual device (from this or an earlier agent) and restore the default.
function removeVirtualDevices() {
  const sys = cls('InputSystem'), removed = [];
  for (let i = 1; i < 400; i++) {
    const d = call(sys, 'GetDeviceById', ptr(0), [i32(i)]);
    if (d.isNull()) continue;
    const name = readString(call(A.objectClass(d), 'get_name', d));
    if (/^Claude/.test(name)) { call(sys, 'RemoveDevice', ptr(0), [d]); removed.push(name); }
  }
  if (keyboard) { A.unroot(keyboard); keyboard = null; }
  setBackgroundBehavior(0);
  return {invoked: true, removed};
}
