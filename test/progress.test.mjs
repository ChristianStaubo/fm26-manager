import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {loadScreen} from './screens.mjs';
import {Screen} from '../game/ui/screen.mjs';
import {need, Unreadable, NeedsAnalyst} from '../game/ui/overlays.mjs';
import {fingerprint, Progress} from '../capabilities/season/progress.mjs';
import {plainLoanPage, readPlainLoanPage} from '../game/screens/transfer-offers.mjs';

const edit = (name, fn) => { const s = loadScreen(name), tree = structuredClone(s.tree); fn(tree.nodes); return new Screen(tree); };

test('every saved screen has its own fingerprint', () => {
  const names = readdirSync(new URL('screens/', import.meta.url)).map(f => f.replace('.json.gz', ''));
  assert.equal(new Set(names.map(n => fingerprint(loadScreen(n)))).size, names.length);
});

test('a fingerprint ignores what changes on its own: the clock, live scores, Portal tiles', () => {
  const base = fingerprint(loadScreen('confirm-outgoing-loan'));
  const ticked = edit('confirm-outgoing-loan', nodes => {
    for (const n of nodes) {
      if (/^\d{1,2}\/\d{1,2}\/\d{4} /.test(n.label || '')) n.label = n.label.replace(/\d\d:\d\d$/, '23:59');
      if (/^\d{1,2}:\d\d$/.test(n.text || '')) n.text = '23:59';
      if (n.button && ['layout-tile-interaction-button', 'background-button', ''].includes(n.name || '')) n.label = (n.label || '') + ' 2 - 1 FT';
      if (n.button && /^\d+' /.test(n.label || '')) n.label = "90' A. Late Goal";
    }
  });
  assert.equal(fingerprint(ticked), base);
});

test('a fingerprint changes when the page does (a button appears or the message text changes)', () => {
  const base = fingerprint(loadScreen('confirm-outgoing-loan'));
  const s = loadScreen('confirm-outgoing-loan'), id = s.items.find(i => i.kind === 'text' && i.bounds[0] > 480 && i.label.length > 20).id;
  const changed = edit('confirm-outgoing-loan', nodes => { nodes.find(n => n.id === id).text += ' (updated)'; });
  const button = edit('confirm-outgoing-loan', nodes => { nodes.find(n => n.button && n.name === 'SIButton' && /^Delay Transfer/.test(n.label)).enabled = false; });
  assert.notEqual(fingerprint(button), base, 'an action button going away');
  assert.notEqual(fingerprint(changed), base);
});

test('progress: an action that already ran on this screen today is a repeat; a new day starts clean', () => {
  const p = new Progress();
  assert.equal(p.saw('A', '2035-07-10'), true);
  assert.equal(p.saw('A', '2035-07-10'), false, 'the same screen again is not progress');
  assert.equal(p.repeated('A', 'plain-loan-page', '2035-07-10'), false);
  p.acted('A', 'plain-loan-page', '2035-07-10');
  assert.equal(p.repeated('A', 'plain-loan-page', '2035-07-10'), true, 'back on A after acting: no effect');
  assert.equal(p.repeated('B', 'plain-loan-page', '2035-07-10'), false, 'another offer is another screen');
  assert.equal(p.repeated('A', 'plain-loan-page', '2035-07-11'), false);
  assert.equal(p.saw('A', '2035-07-11'), true);
});

test('need() names every missing fact; NaN and empty strings count as missing', () => {
  assert.doesNotThrow(() => need({wageShare: 0.8, duration: 'End of season'}, ['wageShare', 'duration'], 'x'));
  assert.throws(() => need({wageShare: NaN, duration: '', playingTime: 'Squad Player'}, ['wageShare', 'duration', 'playingTime'], 'Loan offer'),
    e => e instanceof Unreadable && e instanceof NeedsAnalyst && e.missing.join() === 'wageShare,duration' && /can't read wageShare, duration/.test(e.message));
});

test('a loan page read before it loaded is Unreadable, never a rejection (Cousins, 2035-07-10)', async () => {
  const loading = edit('loan-page-dukic-koln', nodes => {
    for (const n of nodes) if (n.dropdown && /\d+%/.test(n.label || '')) n.label = '';
  });
  assert.ok(Number.isNaN(readPlainLoanPage(loading).wageShare));
  assert.ok(plainLoanPage.match(loading), 'the handler still recognises the page');
  // Throws before any click (no bridge is running in tests).
  await assert.rejects(plainLoanPage.run(loading), e => e instanceof Unreadable && e.missing.includes('wageShare'));
});
