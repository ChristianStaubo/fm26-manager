import test from 'node:test';
import assert from 'node:assert/strict';
import {decideSale, decidePayoff, loadRules} from './decide.mjs';
import {inWindow, nextWindowOpen, nextDate, daysBetween, loadSeason} from '../season/season.mjs';

const policy = loadRules();
const sale = o => decideSale({negotiable: true, countersSoFar: 0, monthsLeft: 24, ...o}, policy);

// Not listed: for sale only at our price, sell_ask (1.3) x the top of his value (user, 2031-07-22:
// "we should not reject bids, we should counter them at prices we want to sell our players at").
test('Kislyak (value £36-39M) bid £34M → counter at our sell price 1.5 x £39M = £58.5M (core)', () => {
  const r = sale({guaranteed: 34e6, upfront: 26.75e6, vLow: 36e6, vHigh: 39e6, minimum: 36e6, negotiable: false});
  assert.equal(r.action, 'counter');
  assert.equal(r.guaranteedAsk, 58.5e6);
  assert.equal(r.upfront, 58.5e6 - 7.25e6);
});
test('Kayode (value £63-75M, a player we want to keep) bid £61.5M → counter 1.5 x £75M = £112.5M', () => {
  const r = sale({guaranteed: 61.5e6, upfront: 33e6, total: 72e6, vLow: 63e6, vHigh: 75e6, minimum: 64.8e6, negotiable: false, importance: 'key starter'});
  assert.equal(r.action, 'counter');
  assert.equal(r.totalAsk, 112.5e6, 'a total, add-ons included');
  assert.equal(r.need, 'core'); assert.equal(r.replace, true);
});
test('a bid at or above our sell price is accepted; lowballs are countered, not rejected', () => {
  assert.equal(sale({guaranteed: 59e6, vLow: 36e6, vHigh: 39e6}).action, 'accept');
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
test('price book: accept at the target; between minimum and target, counter, or accept in the last days', () => {
  assert.equal(listed({guaranteed: 69e6, upfront: 69e6}).action, 'accept');
  assert.equal(listed({guaranteed: 55e6, upfront: 55e6}).action, 'counter');
  assert.equal(listed({guaranteed: 55e6, upfront: 55e6, daysToClose: 3}).action, 'accept');
});
test('price book: counters go 1.3 x value, then the target, then halfway to the minimum; then take the minimum', () => {
  const c1 = listed({guaranteed: 45e6, upfront: 45e6});
  assert.equal(c1.action, 'counter'); assert.equal(c1.guaranteedAsk, 78e6);
  assert.equal(listed({guaranteed: 50e6, upfront: 50e6, countersSoFar: 1}).guaranteedAsk, 68.5e6);
  assert.equal(listed({guaranteed: 50e6, upfront: 50e6, countersSoFar: 2}).guaranteedAsk, 61.65e6);
  assert.equal(listed({guaranteed: 56e6, upfront: 56e6, countersSoFar: 3}).action, 'accept');
  assert.equal(listed({guaranteed: 52e6, upfront: 52e6, countersSoFar: 3}).action, 'reject');
});
test('price book: a non-negotiable bid below the target waits for better bids, until the last days (Fresneda, 2032-01-04)', () => {
  assert.equal(listed({guaranteed: 56e6, upfront: 56e6, negotiable: false, daysToClose: 28}).action, 'reject');
  assert.equal(listed({guaranteed: 56e6, upfront: 56e6, negotiable: false, daysToClose: 5}).action, 'accept');
});

// Loans (user, 2026-10-08): an obligation to buy makes it a sale.
test('loan with obligation to buy is decided as a sale of the summed fees', async () => {
  const {decideLoan} = await import('./decide.mjs');
  const d = decideLoan({priceBook: true, daysToClose: 3, loanFee: 2e6, monthlyFee: 100e3, months: 10, obligationFee: 54e6, vLow: 49e6, vHigh: 60e6, minimum: 54.8e6, target: 68.5e6, negotiable: true, countersSoFar: 0});
  assert.equal(d.asSale, true); assert.equal(d.guaranteed, 57e6); assert.equal(d.action, 'accept');
});
test('loan with only an option to buy is a plain loan → escalate', async () => {
  const {decideLoan} = await import('./decide.mjs');
  const d = decideLoan({loanFee: 2.6e6, monthlyFee: 29e3, months: 10, optionFee: 1.8e6, vLow: 2.2e6, vHigh: 5.2e6});
  assert.equal(d.asSale, false); assert.equal(d.action, 'escalate');
});

test('add-ons count as fee: Newcastle for Yarmoliuk (35.75M guaranteed, 48.5M total) vs a price-book minimum of 46M', () => {
  const o = {priceBook: true, minimum: 46e6, target: 48e6, negotiable: false, guaranteed: 35.75e6, upfront: 25.5e6, total: 48.5e6, vLow: 44e6, vHigh: 49e6, countersSoFar: 0, monthsLeft: 36};
  assert.equal(decideSale(o).action, 'accept');
  assert.equal(decideSale({...o, total: 35.75e6}).action, 'reject');
});

// Sell price by need (user, 2032-02-02): Güreler, rotation CB, value £28-30M, bought for £17M.
test('need tiers: core 1.5x, depth 1.2x, surplus 1.0x the top of his value; totals with add-ons', () => {
  const base = {guaranteed: 17.45e6, upfront: 13.25e6, total: 23.7e6, vLow: 28e6, vHigh: 30e6, minimum: 32.2e6, monthsLeft: 40};
  const depth = sale({...base, importance: 'rotation', paid: 17e6});
  assert.equal(depth.need, 'depth'); assert.equal(depth.sellAt, 36e6); assert.equal(depth.totalAsk, 36e6);
  assert.equal(depth.upfront, 36e6 - 6.25e6 - 4.2e6, 'fee = total - their add-ons - their instalments');
  assert.equal(sale({...base, importance: 'fringe'}).sellAt, 30e6);
  assert.equal(sale({...base, importance: 'starter'}).sellAt, 45e6);
  assert.equal(sale({...base, importance: 'rotation', blockers: ['no comparable squad replacement']}).need, 'core');
});
test('never below what we paid, unless 30+ or in his last year', () => {
  const base = {guaranteed: 10e6, upfront: 10e6, vLow: 18e6, vHigh: 20e6, importance: 'fringe', paid: 25e6, monthsLeft: 40};
  assert.equal(sale(base).sellAt, 25e6);
  assert.equal(sale({...base, age: 31}).sellAt, 20e6);
  assert.equal(sale({...base, monthsLeft: 6}).sellAt, 18e6);
});

test('plain loan: accept when he is outside our XI and they pay 80%+ of his wage (Muharemović to Lens, 2033-01-07)', async () => {
  const {decideLoan} = await import('./decide.mjs');
  const loan = {loanFee: 92e3, monthlyFee: 41.5e3, months: 4, wageShare: 0.8};
  assert.equal(decideLoan({...loan, starter: false}).action, 'accept');
  assert.equal(decideLoan({...loan, starter: true}).action, 'escalate', 'a starter: the user decides');
  assert.equal(decideLoan({...loan, starter: undefined}).action, 'escalate', 'XI unknown: the user decides');
  assert.equal(decideLoan({...loan, starter: false, wageShare: 0.5}).action, 'escalate', 'too little wage relief');
  assert.equal(decideLoan({...loan, starter: false, optionFee: 5e6}).action, 'escalate', 'an option to buy: the user decides');
});

test('plain loan: a loan fee counts as wage relief (Sayman to Blackburn, £1.6M, 0% of ~£0.56M wages)', async () => {
  const {decideLoan} = await import('./decide.mjs');
  assert.equal(decideLoan({loanFee: 1.6e6, wageShare: 0, wageCost: 0.56e6, starter: false}).action, 'accept');
  assert.equal(decideLoan({loanFee: 0, wageShare: 0.5, wageCost: 0.56e6, starter: false}).action, 'escalate');
});

test('a rising player we would keep is not sold at his value (Gallardo, 21: £56M in 2032, £121.5M a year later)', () => {
  const g = {guaranteed: 44e6, upfront: 23.5e6, total: 46.6e6, vLow: 56e6, vHigh: 56e6, minimum: 58.52e6, keep: true, importance: 'rotation', age: 21, paid: 24.3e6, monthsLeft: 34, negotiable: true};
  const r = sale(g);
  assert.equal(r.need, 'depth'); assert.equal(r.rising, true);
  assert.equal(r.sellAt, 73.95e6, '56 x 1.2 (depth) x 1.1 (rising): the user put him at £70-75M');
  assert.equal(sale({...g, age: 27}).sellAt, 67.2e6, 'not rising: 56 x 1.2');
  assert.equal(sale({...g, age: 27, importance: 'fringe'}).sellAt, 64.4e6, 'keep: our minimum x 1.1 floors even a fringe player');
});

test('a sell-on we owe is priced in: ask gross so we keep our price net (Ortega, 40% to Lecce over £61M, Man City £73.75M)', () => {
  const owedSellOn = {pct: 0.4, to: 'U.S. Lecce', signedFor: 61e6};
  const city = {guaranteed: 56.25e6, upfront: 56.25e6, total: 73.75e6, vLow: 58e6, vHigh: 69e6, importance: 'key starter', age: 23, paid: 61e6, monthsLeft: 24, negotiable: true};
  const plain = sale(city), owed = sale({...city, owedSellOn});
  assert.equal(plain.sellAt, 113.85e6);
  assert.equal(owed.sellAt, 149.1e6, '(113.85 - 0.4 x 61) / 0.6: Lecce takes 40% of the profit, we keep £113.85M');
  assert.equal(owed.action, 'counter');
  assert.equal(sale({...city, guaranteed: 140e6, total: 140e6}).action, 'accept', 'without the owed cut £140M clears the price');
  assert.equal(sale({...city, owedSellOn, guaranteed: 140e6, total: 140e6}).action, 'counter', 'with it, £140M nets only ~£108.4M');
});

test('sell price by depth role x age (user, 2033-09-01): Truffert accepted, Newton/Didi/Brown countered', () => {
  const role = (r, ok = true) => ({role: r, depth_ok_without: ok});
  const truffert = sale({guaranteed: 27.25e6, upfront: 22e6, total: 35e6, vLow: 27e6, vHigh: 32e6, age: 31, paid: 0, monthsLeft: 22, negotiable: false, depth: role('backup')});
  assert.equal(truffert.sellAt, 27.2e6, 'backup, 30+: 0.85 x £32M');
  assert.equal(truffert.action, 'accept');
  assert.equal(sale({guaranteed: 30e6, upfront: 30e6, vLow: 26e6, vHigh: 32e6, age: 22, monthsLeft: 40, negotiable: true, depth: role('starter')}).sellAt, 48e6, 'starter, rising: 1.5x (not 1.65)');
  assert.equal(sale({guaranteed: 60e6, upfront: 50e6, total: 65e6, vLow: 52e6, vHigh: 64e6, age: 23, paid: 14e6, monthsLeft: 40, negotiable: true, depth: role('starter')}).sellAt, 96e6, 'Didi: 1.5 x £64M');
  assert.equal(sale({guaranteed: 50e6, upfront: 50e6, vLow: 55e6, vHigh: 66e6, age: 30, monthsLeft: 24, negotiable: false, depth: role('starter')}).sellAt, 79.2e6, 'starter, 30+: 1.2x');
  assert.equal(sale({guaranteed: 30e6, upfront: 30e6, vLow: 27e6, vHigh: 32e6, age: 31, monthsLeft: 22, negotiable: true, depth: role('backup', false)}).role, 'starter', 'depth falls below standard without him: priced as a starter');
});
