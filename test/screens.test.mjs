// Recorded screens (test/screens/*.json.gz, from friction reports) and what must recognise them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {HANDLERS} from '../tasks/progression/autopilot.mjs';

const handlerFor = s => HANDLERS.filter(h => h.match(s)).map(h => h.name);

test('Confirm Transfer (signing agreed, before the window opens) → delegate finalizing', () => {
  const s = loadScreen('confirm-transfer-lopez');
  assert.equal(s.continueLabel(), 'Confirm Transfer');
  assert.deepEqual(handlerFor(s), ['delegate-finalizing']);
});

test('Pending new-signing press conference (message open) → Attend button in the message, not the Continue slot', async () => {
  const {locate} = await import('../tasks/admin/press.mjs');
  const s = loadScreen('press-conference-message');
  assert.equal(s.continueLabel(), 'Attend Press Conference');
  assert.deepEqual({inRoom: false, attend: true}, (({inRoom, attend}) => ({inRoom, attend}))(locate(s)));
});

test('A leftover hover tooltip is reported as a tooltip, not a dropdown (recover clicks Portal)', async () => {
  const {overlays} = await import('../ui/overlays.mjs');
  const open = overlays(loadScreen('stray-tooltip'));
  assert.deepEqual(open.map(o => o.kind), ['tooltip']);
  assert.match(open[0].text, /attribute/);
});

test('Board season expectations (Response Required) → keep defaults and Confirm', () => {
  const s = loadScreen('board-season-expectations');
  assert.equal(s.continueLabel(), 'Response Required');
  assert.deepEqual(handlerFor(s), ['season-expectations']);
});

test('Friendly proposal (Accept/Reject Invitation) → accept-invitation', async () => {
  const {readFriendly} = await import('../tasks/admin/handlers.mjs');
  const s = loadScreen('friendly-proposal');
  assert.deepEqual(handlerFor(s), ['accept-invitation']);
  const f = readFriendly(s.texts().find(t => !!readFriendly(t)));
  assert.ok(f.date instanceof Date && f.fee > 0);
});
test('readFriendly parses date and fee from the proposal text', async () => {
  const {readFriendly} = await import('../tasks/admin/handlers.mjs');
  const f = readFriendly('Paris FC have offered Brentford a friendly match at Stade Jean-Bouin (France) on Monday July 13th 2026. Brentford will receive a fee of £55,000 if they accept the offer.');
  assert.equal(f.date.toISOString().slice(0, 10), '2026-07-13');
  assert.equal(f.fee, 55000);
  assert.equal(f.club, 'Paris FC');
});

test('Outgoing Confirm Transfer (loan out, Accept/Delay/Cancel) → confirm-outgoing, not our signing handler', () => {
  const s = loadScreen('confirm-outgoing-loan');
  assert.equal(s.continueLabel(), 'Confirm Transfer');
  assert.deepEqual(handlerFor(s), ['confirm-outgoing']);
});

test('Loan approach without a buy clause (Leicester for Milambo) → loan-offer, parsed, plain loan', async () => {
  const {readLoan} = await import('../tasks/transfers/incoming.mjs');
  const {decideLoan} = await import('../tasks/transfers/decide.mjs');
  const s = loadScreen('loan-approach-plain');
  assert.deepEqual(handlerFor(s), ['loan-offer']);
  const l = readLoan(s);
  assert.equal(l.club, 'Leicester'); assert.equal(l.player, 'Milambo');
  assert.equal(l.loanFee, 0); assert.equal(l.unusedMonthlyFee, 17250); assert.equal(l.duration, 'End of season');
  assert.equal(l.obligationFee, undefined);
  assert.equal(decideLoan(l).action, 'escalate');
});
