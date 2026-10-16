// Main: run jobs on Unity's UI thread, discover classes, export the RPC API.
//
// Every game call must happen on the UI thread. We hook UIElementsRuntimeUtility.UpdatePanels
// (called each frame) and run at most one queued job when it returns.
function queueJob(kind, fn, {action = false, timeoutMs = 2000} = {}) {
  if (pending) throw Error('Another game operation is pending');
  // The latch is released when the status is read (20-continue.js status()): read it before refusing,
  // or a run stopped mid-Continue leaves every UI action refused (2033-01-21, holiday after a stop).
  if (action && inFlight) status();
  if (action && inFlight) throw Error('A Continue action is in flight');
  if (!pumpFound) throw Error('UI pump unavailable');
  return new Promise((resolve, reject) => {
    const job = {kind, fn, resolve, reject}; pending = job;
    setTimeout(() => { if (pending === job) { pending = null; reject(Error(kind + ' timed out before running')); } }, timeoutMs);
  });
}
function pump() {
  if (deferred.length) runDeferred();
  if (!pending) return;
  const job = pending; pending = null;
  try { job.resolve(job.fn()); } catch (e) { job.reject(e); }
}

attached(() => {
  const count = Memory.alloc(Process.pointerSize), assemblies = A.assemblies(A.domain(), count);
  for (let i = 0; i < Number(count.readU64()); i++) {
    const image = A.image(assemblies.add(i * Process.pointerSize).readPointer());
    for (let j = 0; j < Number(A.count(image)); j++) {
      const c = A.klass(image, j), name = className(c), ns = A.ns(c).readUtf8String();
      registerClass(c, name, ns);
      if (name === 'UIElementsRuntimeUtility' && ns === 'UnityEngine.UIElements')
        for (const m of methodList(c)) if (m.name === 'UpdatePanels' && m.parameters.length === 0 && !m.address.isNull()) {
          hooks.push(Interceptor.attach(m.address, {onLeave: pump})); pumpFound = true;
        }
      if (name === 'ContinueFlowState')
        for (const f of fieldList(c)) { if (f.name === 'value__') continue; const v = Memory.alloc(8); A.staticValue(f.pointer, v); stateNames[v.readS32()] = f.name; }
      if (name === 'ContinueManagerModule' && ns === 'FM.UI') setupContinueManager(c);
    }
  }
});

rpc.exports = {
  status() { return attached(status); },
  advance() { if (inFlight) throw Error('A Continue request is already in flight'); return queueJob('advance', doContinue, {action: true}); },
  openrequiredaction() { return queueJob('open-required-action', doOpenRequiredAction, {action: true}); },
  uitree() { return queueJob('uitree', uiTree); },
  ui(request) {
    const reading = ['inputInfo', 'recordStop'].includes(request.action);
    return queueJob('ui:' + request.action, () => uiAction(request), {action: !reading});
  },
  uimetadata() { return classMetadata; },
  inspect() { return attached(() => ({pid: Process.id, managerAddress: manager ? A.target(manager).toString() : null, manualTimer, states: stateNames, methods: managerMethods})); },
  anchor() { return attached(() => manager ? A.target(manager).toString() : null); },
  seed(address, timer) { return attached(() => { captureManager(ptr(address)); if (Number.isInteger(timer)) manualTimer = timer; }); },
  dispose() {
    clearSnapshot();
    if (recording) recordStop();
    if (pending) { pending.reject(Error('Agent disposed')); pending = null; }
    for (const h of hooks) h.detach();
    if (manager) { A.unroot(manager); manager = null; }
  },
};
send({kind: 'ready', methods: managerMethods.length, classes: classes.size, pump: pumpFound});
