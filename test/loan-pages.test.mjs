// Loans (2026-10-18): one page reader, one decision. Schmitt to Monaco (2036-01-05) stopped for the user
// because the option page never asked the loan table; the old reader turned an unread wage share into 0%.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScreen} from './screens.mjs';
import {Screen} from '../game/ui/screen.mjs';
import {Unreadable} from '../game/ui/overlays.mjs';
import {loanOfferPage, readLoanPage, pageLoanFields, setDepthSource} from '../game/screens/transfer-offers.mjs';

const edit = (name, fn) => { const tree = structuredClone(loadScreen(name).tree); fn(tree.nodes); return new Screen(tree); };

test('the option page reads like the plain page: wage share, duration, playing time, age', () => {
  const s = loadScreen('loan-page-option-schmitt-monaco');
  assert.equal(loanOfferPage.match(s), true);
  assert.equal(readLoanPage(s).mandatory, false);
  const f = pageLoanFields(s);
  assert.deepEqual({player: f.player, age: f.age, wageShare: f.wageShare, duration: f.duration, playingTime: f.playingTime},
    {player: 'Emre Schmitt', age: 22, wageShare: 0.4, duration: 'End of season', playingTime: 'Squad Player'});
});

test('an option to buy is decided by the loan table, not stopped for the user (Schmitt: reject)', async () => {
  setDepthSource(() => ({role: 'backup', age: 22, pa: 165}));
  const r = await loanOfferPage.run(loadScreen('loan-page-option-schmitt-monaco'), {dryRun: true});
  assert.equal(r.decision, 'reject');
  assert.match(r.why, /option to buy/);
});

test('a wage share on the page that cannot be read is Unreadable, never 0%', async () => {
  const s = edit('loan-page-option-schmitt-monaco', nodes => { for (const n of nodes) if (n.dropdown && /^\d+% \(/.test(n.label || '')) n.label = ''; });
  assert.ok(Number.isNaN(readLoanPage(s).wageShare));
  await assert.rejects(loanOfferPage.run(s, {dryRun: true}), e => e instanceof Unreadable && e.missing.includes('wageShare'));
});
