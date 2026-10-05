import test from 'node:test';
import assert from 'node:assert/strict';
import {decideSale, decidePayoff, loadRules} from './decide.mjs';
import {inWindow, nextWindowOpen, nextDate, daysBetween, loadSeason} from '../progression/season.mjs';

const policy = loadRules();
const sale = o => decideSale({negotiable: true, countersSoFar: 0, monthsLeft: 24, ...o}, policy);

test('first negotiable offer is always countered at 1.20 x v_high', () => {
  // Lyon's first Igor bid: £5.75M up front + £1.2M instalments; value £7.6M-£8.4M.
  const r = sale({guaranteed: 6950000, upfront: 5750000, vLow: 7600000, vHigh: 8400000});
  assert.equal(r.action, 'counter');
  assert.equal(r.guaranteedAsk, 10100000);
  assert.equal(r.upfront, 10100000 - 1200000);
});
test('counter never asks less than 10% above an already generous offer', () => {
  const r = sale({guaranteed: 12e6, upfront: 12e6, vLow: 7e6, vHigh: 8e6});
  assert.equal(r.guaranteedAsk, 13.2e6);
});
test('reply at or above 1.05 x v_high is accepted', () => {
  assert.equal(sale({guaranteed: 8.85e6, vLow: 7.6e6, vHigh: 8.4e6, countersSoFar: 1}).action, 'accept');
});
test('reply below 1.05 x v_high gets a second counter at 1.10 x', () => {
  const r = sale({guaranteed: 8.75e6, upfront: 7.55e6, vLow: 7.6e6, vHigh: 8.4e6, countersSoFar: 1});
  assert.equal(r.action, 'counter');
  assert.equal(r.guaranteedAsk, 9250000);
});
test('after max counters: accept at or above the floor, reject below', () => {
  assert.equal(sale({guaranteed: 8.4e6, vLow: 7.6e6, vHigh: 8.4e6, countersSoFar: 3}).action, 'accept');
  assert.equal(sale({guaranteed: 8.0e6, vLow: 7.6e6, vHigh: 8.4e6, countersSoFar: 3}).action, 'reject');
});
test('expiring contracts lower the floor to 0.8 x v_low', () => {
  assert.equal(sale({guaranteed: 6.2e6, vLow: 7.6e6, vHigh: 8.4e6, countersSoFar: 3, monthsLeft: 11}).action, 'accept');
});
test('lowball bids are rejected rather than countered (Wrexham £53.75K vs £110K-£210K)', () => {
  assert.equal(sale({guaranteed: 53750, vLow: 110000, vHigh: 210000}).action, 'reject');
});
test('small deals: one counter, then accept anything at or above v_low', () => {
  assert.equal(sale({guaranteed: 85000, vLow: 110000, vHigh: 210000}).action, 'counter');
  assert.equal(sale({guaranteed: 120000, vLow: 110000, vHigh: 210000, countersSoFar: 1}).action, 'accept');
  assert.equal(sale({guaranteed: 100000, vLow: 110000, vHigh: 210000, countersSoFar: 1}).action, 'reject');
});
test('non-negotiable offers: accept at v_high, else reject (Birmingham £24.5M for Osman goes to escalation first)', () => {
  assert.equal(sale({negotiable: false, guaranteed: 1.2e6, vLow: 0.75e6, vHigh: 1.2e6}).action, 'accept');
  assert.equal(sale({negotiable: false, guaranteed: 1.0e6, vLow: 0.75e6, vHigh: 1.2e6}).action, 'reject');
  assert.equal(sale({negotiable: false, guaranteed: 24.5e6, vLow: 20e6, vHigh: 30e6}).action, 'escalate');
});
test('key players and unreadable offers escalate', () => {
  assert.equal(sale({guaranteed: 9e6, vLow: 7e6, vHigh: 8e6, keyPlayer: true}).action, 'escalate');
  assert.equal(sale({guaranteed: NaN, vLow: 7e6, vHigh: 8e6}).action, 'escalate');
});
test('agent payoff: counter at 70%, accept any reply up to the opening ask (Igor: £450K → £325K)', () => {
  assert.deepEqual(decidePayoff({ask: 450000}, policy).amount, 315000);
  assert.equal(decidePayoff({ask: 450000, reply: 325000}, policy).action, 'accept');
  assert.equal(decidePayoff({ask: 450000, reply: 400000}, policy).action, 'accept');
  assert.equal(decidePayoff({ask: 450000, reply: 460000}, policy).action, 'escalate');
});
test('transfer windows', () => {
  const w = loadSeason().windows;
  assert.equal(inWindow(new Date('2026-07-01T00:00:00Z'), w), true);
  assert.equal(inWindow(new Date('2026-10-01T00:00:00Z'), w), false);
  assert.equal(nextWindowOpen(new Date('2026-09-02T00:00:00Z'), w).toISOString().slice(0, 10), '2027-01-01');
  assert.equal(nextWindowOpen(new Date('2027-02-03T00:00:00Z'), w).toISOString().slice(0, 10), '2027-06-16');
});
test('holiday return: next 28 May and day count (4 Aug 2025 → 297 days)', () => {
  const from = new Date('2025-08-04T00:00:00Z'), back = nextDate(from, '05-28');
  assert.equal(back.toISOString().slice(0, 10), '2026-05-28');
  assert.equal(daysBetween(from, back), 297);
});
