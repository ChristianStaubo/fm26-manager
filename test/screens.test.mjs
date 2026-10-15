// Recorded screens (test/screens/*.json.gz, from friction reports) and what must recognise them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {HANDLERS} from '../capabilities/season/autopilot.mjs';

const handlerFor = s => HANDLERS.filter(h => h.match(s)).map(h => h.name);

test('Confirm Transfer (signing agreed, before the window opens) → delegate finalizing', () => {
  const s = loadScreen('confirm-transfer-lopez');
  assert.equal(s.continueLabel(), 'Confirm Transfer');
  assert.deepEqual(handlerFor(s), ['delegate-finalizing']);
});

test('Pending new-signing press conference (message open) → Attend button in the message, not the Continue slot', async () => {
  const {locate} = await import('../game/screens/admin/press.mjs');
  const s = loadScreen('press-conference-message');
  assert.equal(s.continueLabel(), 'Attend Press Conference');
  assert.deepEqual({inRoom: false, attend: true}, (({inRoom, attend}) => ({inRoom, attend}))(locate(s)));
});

test('A leftover hover tooltip is reported as a tooltip, not a dropdown (recover clicks Portal)', async () => {
  const {overlays} = await import('../game/ui/overlays.mjs');
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
  const {readFriendly} = await import('../game/screens/admin/handlers.mjs');
  const s = loadScreen('friendly-proposal');
  assert.deepEqual(handlerFor(s), ['accept-invitation']);
  const f = readFriendly(s.texts().find(t => !!readFriendly(t)));
  assert.ok(f.date instanceof Date && f.fee > 0);
});
test('readFriendly parses date and fee from the proposal text', async () => {
  const {readFriendly} = await import('../game/screens/admin/handlers.mjs');
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
  const {readLoan} = await import('../game/screens/transfer-offers.mjs');
  const {decideLoan} = await import('../capabilities/sell/decide.mjs');
  const s = loadScreen('loan-approach-plain');
  assert.deepEqual(handlerFor(s), ['loan-offer']);
  const l = readLoan(s);
  assert.equal(l.club, 'Leicester'); assert.equal(l.player, 'Milambo');
  assert.equal(l.loanFee, 0); assert.equal(l.unusedMonthlyFee, 17250); assert.equal(l.duration, 'End of season');
  assert.equal(l.obligationFee, undefined);
  assert.equal(decideLoan(l).action, 'escalate');
});

test('Loan approach with a mandatory future fee is an obligation to buy (Al-Ahli for Schade, 2026-07)', async () => {
  const {readLoan} = await import('../game/screens/transfer-offers.mjs');
  const {Screen} = await import('../game/ui/screen.mjs');
  const lines = ['Al-Ahli make loan approach for Schade', 'Fee', '£500K', 'Duration', 'End of season', 'Playing Monthly Fee', '£75K',
    'Mandatory Future Fee', '£43.5M', 'Agreed Playing Time', 'Regular Starter'];
  const nodes = [{id: 0, parent: null, visible: true, bounds: [0, 0, 1680, 1050]},
    ...lines.map((text, k) => ({id: k + 1, parent: 0, visible: true, text, bounds: [540, 100 + k * 20, 300, 18]}))];
  const l = readLoan(new Screen({nodes}));
  assert.equal(l.obligationFee, 43.5e6);
  assert.equal(l.optionFee, undefined);
});

test('Loan-to-buy detail page (Aston Villa for Milambo): value = overall + wage relief, judged as a sale', async () => {
  const {readLoanPage} = await import('../game/screens/transfer-offers.mjs');
  const {decideSale} = await import('../capabilities/sell/decide.mjs');
  const {loadRules} = await import('../capabilities/sell/decide.mjs');
  const s = loadScreen('loan-approach-obligation');
  assert.deepEqual(handlerFor(s), ['loan-offer-page']);
  const l = readLoanPage(s);
  assert.equal(l.player, 'Antoni Milambo'); assert.equal(l.overall, 15.25e6); assert.deepEqual(l.range, [16e6, 18.5e6]);
  assert.equal(l.mandatory, true); assert.ok(l.wageRelief > 1e6, `wage relief ${l.wageRelief}`);
  const noEsc = {...loadRules(), escalate: {...loadRules().escalate, offer_v_high_over: Infinity}};
  // Not listed: below our sell price (1.3 x £18.5M) → counter (the loan handler stops for it).
  assert.equal(decideSale({guaranteed: l.overall + l.wageRelief, vLow: l.range[0], vHigh: l.range[1], negotiable: false, countersSoFar: 0}, noEsc).action, 'counter');
});

test('Squad hierarchy (Dynamics): sections read from the raw tree, below the fold included', async () => {
  const {readHierarchy} = await import('../game/screens/dynamics.mjs');
  const h = readHierarchy(loadScreen('squad-hierarchy'));
  assert.deepEqual(h.team_leaders, ['Jordan Henderson', 'Ethan Pinnock', 'Rico Henry']);
  assert.equal(h.highly_influential.length, 10);
  assert.ok(h.influential.includes('Félix Correia'));
});
