import test from 'node:test';
import assert from 'node:assert/strict';
import {decideSale, decidePayoff, loadRules} from './decide.mjs';
import {inWindow, nextWindowOpen, nextDate, daysBetween, loadSeason} from '../season/season.mjs';

const policy = loadRules();
const sale = o => decideSale({negotiable: true, countersSoFar: 0, monthsLeft: 24, ...o}, policy);

// Not listed: for sale only at our price, sell_ask (1.3) x the top of his value (user, 2031-07-22:
// "we should not reject bids, we should counter them at prices we want to sell our players at").
test('Kislyak (value £36-39M) bid £34M → counter at our sell price ~£50.7M', () => {
  const r = sale({guaranteed: 34e6, upfront: 26.75e6, vLow: 36e6, vHigh: 39e6, minimum: 36e6, negotiable: false});
  assert.equal(r.action, 'counter');
  assert.equal(r.guaranteedAsk, 50.7e6);
  assert.equal(r.upfront, 50.7e6 - 7.25e6);
});
test('Kayode (value £63-75M, a player we want to keep) bid £61.5M → counter ~£97.5M', () => {
  const r = sale({guaranteed: 61.5e6, upfront: 33e6, total: 72e6, vLow: 63e6, vHigh: 75e6, minimum: 64.8e6, keyPlayer: true, negotiable: false});
  assert.equal(r.action, 'counter');
  assert.equal(r.guaranteedAsk, 97.5e6);
});
test('a bid at or above our sell price is accepted; lowballs are countered, not rejected', () => {
  assert.equal(sale({guaranteed: 51e6, vLow: 36e6, vHigh: 39e6}).action, 'accept');
  assert.equal(sale({guaranteed: 1000, vLow: 63e6, vHigh: 63e6, negotiable: false}).action, 'counter');
});
test('reject only once the counters are spent', () => {
  assert.equal(sale({guaranteed: 40e6, vLow: 36e6, vHigh: 39e6, countersSoFar: 2}).action, 'counter');
  assert.equal(sale({guaranteed: 40e6, vLow: 36e6, vHigh: 39e6, countersSoFar: 3}).action, 'reject');
});
test('a contract in its last year sells at the bottom of his range', () => {
  assert.equal(sale({guaranteed: 7.6e6, vLow: 7.6e6, vHigh: 8.4e6, monthsLeft: 11}).action, 'accept');
});
test('unreadable offers escalate', () => {
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

// Price book: listed with an Unspecified asking price; our minimum decides (user, 2026-10-08).
const listed = o => decideSale({priceBook: true, vLow: 49e6, vHigh: 60e6, minimum: 54.8e6, target: 68.5e6, negotiable: true, countersSoFar: 0, monthsLeft: 24, ...o});
test('price book: a bid at or above our minimum is accepted, even for a £60M player (no escalation)', () => {
  assert.equal(listed({guaranteed: 55e6, upfront: 55e6}).action, 'accept');
});
test('price book: below the minimum → counter at the target first, then halfway, then reject', () => {
  const c1 = listed({guaranteed: 45e6, upfront: 45e6});
  assert.equal(c1.action, 'counter'); assert.equal(c1.guaranteedAsk, 68.5e6);
  const c2 = listed({guaranteed: 50e6, upfront: 50e6, countersSoFar: 1});
  assert.equal(c2.action, 'counter'); assert.equal(c2.guaranteedAsk, 61.65e6);
  assert.equal(listed({guaranteed: 52e6, upfront: 52e6, countersSoFar: 3}).action, 'reject');
});
test('price book: non-negotiable below the minimum is countered too, at the target', () => {
  const c = listed({guaranteed: 50e6, upfront: 50e6, negotiable: false});
  assert.equal(c.action, 'counter'); assert.equal(c.guaranteedAsk, 68.5e6);
});

// Loans (user, 2026-10-08): an obligation to buy makes it a sale.
test('loan with obligation to buy is decided as a sale of the summed fees', async () => {
  const {decideLoan} = await import('./decide.mjs');
  const d = decideLoan({priceBook: true, loanFee: 2e6, monthlyFee: 100e3, months: 10, obligationFee: 54e6, vLow: 49e6, vHigh: 60e6, minimum: 54.8e6, target: 68.5e6, negotiable: true, countersSoFar: 0});
  assert.equal(d.asSale, true); assert.equal(d.guaranteed, 57e6); assert.equal(d.action, 'accept');
});
test('loan with only an option to buy is a plain loan → escalate', async () => {
  const {decideLoan} = await import('./decide.mjs');
  const d = decideLoan({loanFee: 2.6e6, monthlyFee: 29e3, months: 10, optionFee: 1.8e6, vLow: 2.2e6, vHigh: 5.2e6});
  assert.equal(d.asSale, false); assert.equal(d.action, 'escalate');
});

test('add-ons count as fee: Newcastle for Yarmoliuk (35.75M guaranteed, 48.5M total) vs a price-book minimum of 46M', () => {
  const o = {priceBook: true, minimum: 46e6, target: 49e6, negotiable: false, guaranteed: 35.75e6, upfront: 25.5e6, total: 48.5e6, vLow: 44e6, vHigh: 49e6, countersSoFar: 0, monthsLeft: 36};
  assert.equal(decideSale(o).action, 'accept');
  assert.equal(decideSale({...o, total: 35.75e6}).action, 'counter');
});
