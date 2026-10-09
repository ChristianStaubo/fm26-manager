import test from 'node:test';
import assert from 'node:assert/strict';
import {control} from './continue.mjs';

const state=(stateName,extra={})=>({available:true,active:true,stateName,actionReady:stateName==='CanContinue',processingRevision:0,actionInFlight:false,...extra});
function fixture(states, failAction=false) {
  let index=0,time=0;
  const actions=[];
  return {actions,io:{read:async()=>states[Math.min(index++,states.length-1)],
    act:async op=>{actions.push(op);if(failAction)throw Error('Lost response');},
    now:()=>time,sleep:async ms=>{time+=ms;}}};
}
test('ready → processing → required action opens once and hands off',async()=>{
  const f=fixture([state('CanContinue'),state('Processing',{processingRevision:1,actionInFlight:true}),state('NeedAction',{processingRevision:1}),state('NeedAction',{processingRevision:1})]);
  const r=await control({},f.io);
  assert.equal(r.reason,'required-action');assert.equal(r.steps,1);
  assert.deepEqual(f.actions,['advance','open-required-action']);
});
test('busy at startup waits; handoff does not resume even if opening unblocks',async()=>{
  const f=fixture([state('Saving'),state('NeedAction'),state('CanContinue')]);
  const r=await control({},f.io);
  assert.equal(r.reason,'required-action');assert.deepEqual(f.actions,['open-required-action']);
});
test('unfamiliar and unavailable states never act',async()=>{
  for(const s of [state('Match'),state('Unknown'),state('CanContinue',{active:false}),{available:false}]) {
    const f=fixture([s]);await control({},f.io);assert.deepEqual(f.actions,[]);
  }
});
test('missing processing evidence times out without another Continue',async()=>{
  const f=fixture([state('CanContinue')]);const r=await control({durationMs:1000},f.io);
  assert.equal(r.reason,'time-limit');assert.equal(r.progressionPending,true);assert.deepEqual(f.actions,['advance']);
});
test('action response failure stops without retry',async()=>{
  const f=fixture([state('CanContinue')],true);const r=await control({},f.io);
  assert.equal(r.reason,'error');assert.equal(r.doNotRetryAutomatically,true);assert.deepEqual(f.actions,['advance']);
});
test('step budget stops after confirmed processing',async()=>{
  const f=fixture([state('CanContinue'),state('CanContinue',{processingRevision:1})]);
  const r=await control({maxSteps:1},f.io);assert.equal(r.reason,'step-limit');assert.deepEqual(f.actions,['advance']);
});
test('in-flight action from another invocation cannot be repeated',async()=>{
  const f=fixture([state('CanContinue',{actionInFlight:true})]);const r=await control({durationMs:1000},f.io);
  assert.equal(r.reason,'time-limit');assert.deepEqual(f.actions,[]);
});
