// The game's Continue manager (FM.UI.ContinueManagerModule): state, Continue, required action.
let pending = null, pumpFound = false; // UI-thread job queue (see 90-main.js)
let manager = null, managerClass = null, managerFields = [];
let continueMethod = null, openMethod = null, manualTimer = null;
let revision = 0, processingRevision = 0, lastEvent = null;
let inFlight = false, sawProcessing = false, inFlightAt = 0, ignoredContinues = 0;
const stateNames = {}, managerMethods = [], hooks = [];
const CONTINUE_HOOKS = ['SetContinueState', 'OnGameProcessingChanged', 'OnGameWaitingChanged', 'OnGameSavingChanged',
  'ProcessCurrentContinueFlowState', 'ContinueGame', 'ContinueOnNoAction', 'UpdateContinueState', 'CallTaskAction'];
const PROCESSING = 8, BUSY_STATES = [8, 11, 12]; // Processing, Waiting, Saving

function captureManager(o) {
  if (o.isNull() || !A.objectClass(o).equals(managerClass)) return;
  if (manager && A.target(manager).equals(o)) return;
  if (manager) A.unroot(manager);
  manager = A.root(o, 0);
}
function setupContinueManager(c) {
  managerClass = c; managerFields = fieldList(c);
  for (const m of methodList(c)) {
    managerMethods.push({name: m.name, parameters: m.parameters, returns: m.returns});
    if (m.name === 'ContinueGame' && m.parameters.length === 1) continueMethod = m.pointer;
    if (m.name === 'ProcessCurrentContinueFlowState' && m.parameters[0] === 'SI.Bindable.DynamicReference') openMethod = m.pointer;
    if (m.address.isNull() || !CONTINUE_HOOKS.includes(m.name)) continue;
    hooks.push(Interceptor.attach(m.address, {
      onEnter(args) {
        captureManager(args[0]);
        // A real (player) Continue reveals the timer argument the game expects.
        if (m.name === 'ContinueGame' && !pending) manualTimer = args[1].toInt32();
        this.state = m.name === 'SetContinueState' ? args[1].toInt32() : null;
      },
      onLeave() {
        revision++;
        if (m.name === 'SetContinueState') {
          if (this.state === PROCESSING) { processingRevision = revision; if (inFlight) sawProcessing = true; }
          if (inFlight && sawProcessing && !BUSY_STATES.includes(this.state)) inFlight = false;
        }
        lastEvent = {name: m.name, state: this.state, time: Date.now()};
        send({kind: 'event', ...lastEvent, revision});
      },
    }));
  }
}
function continueState() {
  if (!manager) return {available: false, reason: 'Waiting for Continue manager activity (press Continue once)', revision};
  const o = A.target(manager);
  const stateField = managerFields.find(f => f.name === 'm_continueState');
  const wc = A.classFromType(A.ftype(stateField.pointer));
  const wrapper = A.valueType(wc) ? o.add(stateField.offset - 16) : o.add(stateField.offset).readPointer();
  if (wrapper.isNull()) return {available: false, reason: 'State wrapper not initialized', revision};
  const value = fieldList(wc).find(f => f.type.endsWith('.ContinueFlowState') && f.offset >= 16);
  if (!value) return {available: false, reason: 'State wrapper layout not mapped', revision};
  const state = wrapper.add(value.offset).readS32();
  const active = !!o.add(managerFields.find(f => f.name === 'm_active').offset).readU8();
  const name = stateNames[state] || 'Unknown';
  return {available: true, active, state, stateName: name, canContinue: name === 'CanContinue' && active,
    processing: name === 'Processing', requiresDecision: name === 'NeedAction', processingRevision, revision, lastEvent};
}
function status() {
  const s = continueState();
  // The game can ignore a Continue (no Processing follows); release the latch after 8 s.
  if (inFlight && !sawProcessing && Date.now() - inFlightAt > 8000 && s.canContinue) { inFlight = false; ignoredContinues++; }
  return {...s, actionReady: !!s.canContinue && pumpFound && manualTimer !== null && !inFlight,
    actionInFlight: inFlight, ignoredContinues, pumpFound, manualTimer};
}
// Runs on the UI thread (from the pump).
function doContinue() {
  const before = continueState();
  if (inFlight) throw Error('A Continue action is already in flight');
  if (!before.available || !before.canContinue) throw Error('Continue is unavailable');
  if (!continueMethod || manualTimer === null) throw Error('Continue not initialised: press Continue once (fm click Continue)');
  const argv = Memory.alloc(Process.pointerSize); argv.writePointer(i32(manualTimer));
  const ex = Memory.alloc(Process.pointerSize); ex.writePointer(ptr(0));
  inFlight = true; sawProcessing = false; inFlightAt = Date.now();
  A.invoke(continueMethod, A.target(manager), argv, ex);
  if (!ex.readPointer().isNull()) throw Error('Continue raised an exception; do not retry automatically');
  return {invoked: true, before, after: continueState()};
}
function doOpenRequiredAction() {
  const before = continueState();
  if (inFlight) throw Error('A Continue action is already in flight');
  if (!before.available || !before.active || !before.requiresDecision) throw Error('Required action is unavailable');
  const field = managerFields.find(f => f.name === 'm_currentAction');
  if (!openMethod || !field) throw Error('Required action path not mapped');
  const action = A.target(manager).add(field.offset).readPointer();
  if (action.isNull()) throw Error('No current required action');
  const argv = Memory.alloc(Process.pointerSize); argv.writePointer(action);
  const ex = Memory.alloc(Process.pointerSize); ex.writePointer(ptr(0));
  A.invoke(openMethod, A.target(manager), argv, ex);
  if (!ex.readPointer().isNull()) throw Error('Opening the required action raised an exception');
  return {invoked: true, operation: 'open-required-action', before, after: continueState()};
}
