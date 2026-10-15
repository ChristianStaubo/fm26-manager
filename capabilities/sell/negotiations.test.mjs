// Negotiation rounds from the decision log: our ask vs their offer, their reply, the gap they closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {negotiations} from './negotiations.mjs';

const offer = (guaranteed, extra = {}) => ({player: 'Ben Gannon Doak', club: 'Man Utd', guaranteed, upfront: guaranteed, vLow: 48e6, vHigh: 48e6, minimum: 45e6, ...extra});
const e = (date, o, decision, executed = true) => ({action: 'incoming-offer', date, offer: o, decision, executed});

test('a countered deal: ask %, their reply, and the share of the gap they closed', () => {
  const [d] = negotiations([
    e('2031-06-17', offer(35e6), {action: 'counter', guaranteedAsk: 49e6}),
    e('2031-06-17', offer(35e6), {action: 'counter', guaranteedAsk: 49e6}, false),   // dry run: ignored
    e('2031-06-20', offer(42e6), {action: 'counter', guaranteedAsk: 46e6}),
    e('2031-06-23', offer(46e6), {action: 'accept'}),
  ]);
  assert.equal(d.rounds.length, 3);
  assert.deepEqual([d.rounds[0].askPct, d.rounds[0].replyPct, d.rounds[0].closed], [0.4, 0.2, 0.5]);
  assert.equal(d.outcome, 'sold 46000000');
});

test('add-ons count in the offer; a counter with no reply stays open', () => {
  const [d] = negotiations([e('2031-06-17', offer(35e6, {total: 39.6e6}), {action: 'counter', guaranteedAsk: 48e6})]);
  assert.equal(d.rounds[0].offer, 39.6e6);
  assert.match(d.outcome, /no reply/);
});
