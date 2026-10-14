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

test('youth loan approach (Wellington, 80%) → accept by the same rule (friction 2026-10-14T23-26-27)', async () => {
  const {loanOffer, readLoan} = await import('../game/screens/transfer-offers.mjs');
  const s = loadScreen('youth-loan-approach-wellington');
  assert.equal(readLoan(s).age, 19);
  assert.equal(loanOffer.match(s), true);
  const r = await loanOffer.run(s, {dryRun: true});
  assert.equal(r.decision, 'accept');
});
