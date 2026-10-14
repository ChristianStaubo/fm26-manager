import test from 'node:test';
import assert from 'node:assert/strict';
import {readReply} from './ask.mjs';

test("agent reply: Banks won't join (just signed), Augsburg want £26M-£31M (2030-07-14)", () => {
  const r = readReply(["I know you're interested in signing Noahkai, but he doesn't want to join Brentford under any circumstances.",
    'Player Demands (2)', "Noahkai Banks wouldn't be interested in joining Brentford at this time as he has only just signed a new contract.",
    'I believe FC Augsburg will want somewhere between £26M and £31M to make a deal possible. FC Augsburg think Banks has a lot of potential.']);
  assert.equal(r.willing, false);
  assert.equal(r.justSigned, true);
  assert.deepEqual(r.feeRange, [26e6, 31e6]);
});

test('agent reply: a willing player with a fee range and a wage', () => {
  const r = readReply(['He would be open to a move.', 'I believe the club will want somewhere between £8.5M and £10M.', 'He wants £45K p/w.']);
  assert.equal(r.willing, true);
  assert.deepEqual(r.feeRange, [8.5e6, 10e6]);
  assert.equal(r.wage, 45000);
});

test('agent reply: "somewhere around £17M" and a wage demand (Güreler, 2030-07-14)', () => {
  const r = readReply(["I'm ecstatic to hear you're a fan of Hamza's. For his part, he is also extremely curious about making a move to Brentford.",
    'Player Demands (8)', 'I believe Beşiktaş will want somewhere around £17M to make a deal possible.', '£70K p/w']);
  assert.equal(r.willing, true);
  assert.deepEqual(r.feeRange, [17e6, 17e6]);
  assert.equal(r.wage, 70000);
});
