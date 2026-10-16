// Juninho (22, MC, no slot in our shape) listed for loan to develop (user, 2033-01-05): a loan offer for
// him is decided by the youth loan rule, not stopped as a first-team loan for the user.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {loadScreen} from './screens.mjs';

const dir = mkdtempSync(`${tmpdir()}/loanlist-`);
process.env.FM_LOAN_LIST = `${dir}/loan-list.json`;
writeFileSync(process.env.FM_LOAN_LIST, JSON.stringify({players: [{name: 'Sullivan', club: 'Brentford'}]}));

test('a loan-listed first-team player: the youth loan rule decides (75% of his wage)', async () => {
  const {youthLoanOffer, readYouthLoan} = await import('../game/screens/transfer-offers.mjs');
  const s = loadScreen('youth-loan-offer-adelaide');
  for (const i of s.items) if (typeof i.label === 'string') i.label = i.label.replace(/^19 year-old/, '22 year-old');
  assert.equal(readYouthLoan(s).age, 22);
  const r = await youthLoanOffer.run(s, {dryRun: true});
  assert.equal(r.decision, 'reject', '70% of his wage is under the 75% rule');
  assert.equal(r.youth, true);
});
