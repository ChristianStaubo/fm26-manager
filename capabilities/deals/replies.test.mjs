// Every General Manager answer we have seen, buying and selling, maps to one state.
import test from 'node:test';
import assert from 'node:assert/strict';
import {classify} from './replies.mjs';

const SEEN = [
  ['Phil Giles General Manager Man City feel the offer for Ryan McAidoo is acceptable and are pleased at such swift negotiations.', 'accepted'],
  ['Phil Giles General Manager Aston Villa feel the negotiation for Ben Gannon Doak is acceptable.', 'accepted'],
  ['Phil Giles General Manager Man Utd have negotiated the offer for Ben Gannon Doak.', 'countered'],
  ['Phil Giles General Manager Man Utd have submitted a non-negotiable offer for Ben Gannon Doak.', 'final'],
  ['Phil Giles General Manager Brighton feel they can get more for Kellen Fisher. An improved offer will need to be submitted for further consideration.', 'more'],
  ['Phil Giles General Manager An offer has been made for Kellen Fisher.', 'made'],
  ['Phil Giles General Manager An agreement has been reached for the transfer of Hülsmann.', 'agreement'],
  ["Phil Giles General Manager Man Utd's Gannon Doak bid rejected", 'rejected'],
  ["Phil Giles General Manager I've noted some key considerations that should be reviewed before proceeding.", 'notes'],
  ['Phil Giles General Manager HSV declined to give an immediate answer. An offer will need to be submitted.', 'submit'],
  ["Phil Giles General Manager Al-Hilal don't feel a deal for Jesús Rosete can be achieved and have decided to walk away from negotiations.", 'walked'],
];
test('every answer seen maps to its state', () => { for (const [line, state] of SEEN) assert.equal(classify(line), state, line); });
test('an answer we have never seen is unknown (stop and capture), no line is null', () => {
  assert.equal(classify('Phil Giles General Manager Something new happened.'), 'unknown');
  assert.equal(classify(''), null);
});
