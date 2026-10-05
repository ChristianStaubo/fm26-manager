// Bounded Continue loop: press Continue until the game needs an action, an unknown state
// appears, or a step/time limit is hit. Each call returns; the caller decides what's next.
import {open, unlink} from 'node:fs/promises';
import path from 'node:path';
import {classifyState, getState, request, RUNTIME_DIR} from '../../bridge/client.mjs';

// Each invocation owns progression until it returns. A handoff ends the loop;
// only an explicit new invocation can resume it.
export async function control({maxSteps=10, durationMs=50000, pollMs=200}={}, io={}) {
  if (!Number.isInteger(maxSteps) || maxSteps<1 || maxSteps>100) throw Error('maxSteps must be 1–100');
  if (!Number.isInteger(durationMs) || durationMs<1 || durationMs>55000) throw Error('durationMs must be 1–55000');
  if (!Number.isInteger(pollMs) || pollMs<50 || pollMs>1000) throw Error('pollMs must be 50–1000');
  const read=io.read || getState, act=io.act || request;
  const now=io.now || Date.now, sleep=io.sleep || (ms=>new Promise(r=>setTimeout(r,ms)));
  const deadline=now()+durationMs;
  let state=null, steps=0, awaitingProcessing=null, ignoredBefore=null;
  const result=(reason, extra={})=>({reason,steps,state,requiresExplicitResume:true,...extra});
  try {
    while(now()<deadline) {
      state=await read();
      const category=classifyState(state);
      if(category==='unavailable') return result('unavailable');
      // A successful invocation alone does not prove a progression cycle ended.
      if(awaitingProcessing!==null) {
        if(state.processingRevision>awaitingProcessing && category!=='busy' && !state.actionInFlight) awaitingProcessing=null;
        // The bridge reports a Continue the game ignored; it is safe to try again.
        else if(ignoredBefore!==null && state.ignoredContinues>ignoredBefore && !state.actionInFlight) {awaitingProcessing=null;steps--;}
        else {await sleep(pollMs);continue;}
      }
      if(category==='busy' || state.actionInFlight) {await sleep(pollMs);continue;}
      if(category==='required-action') {
        if(now()>=deadline) return result('time-limit');
        await act('open-required-action');
        state=await read();
        return result('required-action',{opened:true});
      }
      if(category!=='ready') return result('handoff');
      if(steps>=maxSteps) return result('step-limit');
      if(now()>=deadline) return result('time-limit');
      awaitingProcessing=state.processingRevision;ignoredBefore=state.ignoredContinues ?? null;
      // Refusals raised before invoking (state changed between read and act) are safe to retry.
      try { await act('advance'); }
      catch(e) { if (/Continue is unavailable|already in flight|timed out before running|Another game operation/.test(e.message)) { awaitingProcessing=null; await sleep(pollMs); continue; } throw e; }
      steps++;
      await sleep(pollMs);
    }
    return result('time-limit',{progressionPending:awaitingProcessing!==null || !!state?.actionInFlight});
  } catch(error) {
    // An action may have succeeded even if its response was lost. Never retry.
    return result('error',{error:error.message,doNotRetryAutomatically:true});
  }
}

// One operator at a time: an exclusive lock file while the loop or autopilot runs.
export const LOCK = path.join(RUNTIME_DIR, 'controller.lock');
export async function withLock(owner, fn) {
  let lock;
  try { lock = await open(LOCK, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') throw new Error(`Another runner holds ${LOCK}. If no fm process is running, delete it.`); throw e; }
  try { await lock.writeFile(JSON.stringify({pid: process.pid, owner, startedAt: new Date().toISOString()})); return await fn(); }
  finally { await lock.close(); await unlink(LOCK); }
}
