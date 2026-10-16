import {test} from 'node:test';
import assert from 'node:assert/strict';
import {control} from '../capabilities/season/continue.mjs';

// 2028-06-23: FM sat in NewsAggregator with "News Site" in the Continue slot; control() waited
// forever (busy), and the autopilot looped on time-limit.
test('a lasting NewsAggregator state is a handoff, not busy', async () => {
  let t = 0;
  const state = {available: true, active: true, stateName: 'NewsAggregator', actionInFlight: false};
  const r = await control({}, {read: async () => state, act: async () => { throw Error('no act'); }, now: () => t, sleep: async ms => { t += ms; }});
  assert.equal(r.reason, 'handoff');
  assert.equal(r.stalled, 'NewsAggregator');
});

test('fresh load: CanContinue with actionReady=false and a plain Continue slot → press Continue once (friction 2026-10-14T08-09-28)', async () => {
  const {firstContinue} = await import('../capabilities/season/autopilot.mjs');
  assert.equal(firstContinue({stateName: 'CanContinue', actionReady: false}, 'Continue'), true);
  assert.equal(firstContinue({stateName: 'CanContinue', actionReady: true}, 'Continue'), false);
  assert.equal(firstContinue({stateName: 'NeedAction', actionReady: false}, 'Negotiate Contract'), false);
});

test('after a sale: stop only for a core player or a planned follow-up buy (Lawrence, depth, 2032-08-31: carry on)', async () => {
  const {saleNeedsBuy} = await import('../capabilities/season/autopilot.mjs');
  const sale = (player, decision) => ({action: 'incoming-offer', offer: {player}, decision});
  const policy = {selling: {follow_up: {'Tarik Muharemović': 'Natali'}}};
  assert.equal(saleNeedsBuy(sale('Jamie Lawrence', {action: 'accept', need: 'depth', replace: false}), policy), false);
  assert.equal(saleNeedsBuy(sale('Kellen Fisher', {action: 'accept', need: 'core', replace: true}), policy), true);
  assert.equal(saleNeedsBuy(sale('Tarik Muharemovic', {action: 'accept'}), policy), true);
  assert.equal(saleNeedsBuy(sale('Jamie Lawrence', {action: 'counter'}), policy), false);
});
