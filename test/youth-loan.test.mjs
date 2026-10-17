// Friction 2026-10-14T23-23-41: Adelaide's loan offer for Sullivan (19, U18 GK) blocked fm run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {youthLoanOffer, readYouthLoan} from '../game/screens/transfer-offers.mjs';

test('youth loan offer: read, and rejected under 75% of his wage (Adelaide 70%)', async () => {
  const s = loadScreen('youth-loan-offer-adelaide');
  assert.deepEqual(readYouthLoan(s), {club: 'Adelaide', player: 'Sullivan', age: 19, fee: 20000, wageShare: 0.7, duration: 'End of season'});
  assert.equal(youthLoanOffer.match(s), true);
  const r = await youthLoanOffer.run(s, {dryRun: true});
  assert.equal(r.decision, 'reject');
});

test('youth loan approach (Wellington, 80%, First-Choice Goalkeeper) → loan table: unlisted prospect, starts, >= 75% → accept', async () => {
  const {loanOffer, readLoan, setDepthSource} = await import('../game/screens/transfer-offers.mjs');
  setDepthSource(() => ({role: 'surplus', age: 19, pa: 134}));
  const s = loadScreen('youth-loan-approach-wellington');
  assert.equal(readLoan(s).age, 19);
  assert.equal(loanOffer.match(s), true);
  const r = await loanOffer.run(s, {dryRun: true});
  assert.equal(r.decision, 'accept');
});

test('"<Club> in offer for <Player>" is a bid for our player (LOSC for Franculino, 2030-07-21)', async () => {
  const {incomingOffer} = await import('../game/screens/transfer-offers.mjs');
  assert.equal(incomingOffer.match(loadScreen('bid-franculino-losc')), true);
});

test('loan-back request (Nürnberg for Miceli): matched and accepted by policy', async () => {
  const {loanBackRequest} = await import('../game/screens/transfer-offers.mjs');
  const s = loadScreen('loan-back-request-miceli');
  assert.equal(loanBackRequest.match(s), true);
  const r = await loanBackRequest.run(s, {dryRun: true});
  assert.deepEqual([r.club, r.player, r.decision], ['1. FC Nürnberg', 'Miceli', 'accept']);
});

test('"Wolves want to extend Torrente loan": a loan approach (31, listed, 80%) → accepted (2033-01-17)', async () => {
  const {loanOffer, readLoan} = await import('../game/screens/transfer-offers.mjs');
  const s = loadScreen('loan-extend-torrente');
  const l = readLoan(s);
  assert.equal(l.club, 'Wolves'); assert.equal(l.player, 'Torrente'); assert.equal(l.salaryPct, '80%');
  assert.equal(loanOffer.match(s), true);
});

test('"Loan offers made for Brentford\'s Đukić" → offers-summary; the plain loan page (Köln, 50%, Important Player, not listed) → rejected by the loan table', async () => {
  const {plainLoanPage, readPlainLoanPage} = await import('../game/screens/transfer-offers.mjs');
  const {offersSummary} = await import('../game/screens/transfer-activity.mjs');
  assert.equal(offersSummary.match(loadScreen('loan-offers-summary-dukic')), true);
  const s = loadScreen('loan-page-dukic-koln');
  const l = readPlainLoanPage(s);
  assert.equal(l.player, 'Petar Đukić'); assert.equal(l.club, '1. FC Köln'); assert.equal(l.age, 20);
  assert.equal(l.wageShare, 0.5); assert.equal(l.playingTime, 'Important Player');
  assert.equal(plainLoanPage.match(s), true);
  const {setDepthSource} = await import('../game/screens/transfer-offers.mjs');
  setDepthSource(() => ({role: 'surplus', age: 20, pa: 172}));
  // Not listed: a prospect needs a start AND >= 75% (user's loan table, 2033-09-01): Köln's 50% is rejected.
  assert.equal((await plainLoanPage.run(s, {dryRun: true})).decision, 'reject');
});
