import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {record, all, summary} from './interventions.mjs';

const policy = {autonomy: {buy: 'approve', contracts: 'auto'}, autonomy_promotion: {consecutive_unchanged: 3}};

test('promotion by rule: N unchanged approvals in a row, and every correction has a guard test', () => {
  const file = pathToFileURL(`${mkdtempSync(`${tmpdir()}/iv-`)}/i.jsonl`);
  record({capability: 'buy', kind: 'approved-changed'}, file);
  record({capability: 'buy', kind: 'correction', rule: 'skip just-signed players'}, file);
  for (let i = 0; i < 3; i++) record({capability: 'buy', kind: 'approved-unchanged'}, file);
  let s = summary(all(file), policy).capabilities.buy;
  assert.equal(s.streak, 3); assert.equal(s.eligibleForAuto, false, 'a correction without a guard test blocks promotion');
  record({capability: 'buy', kind: 'correction', rule: 'x', guard: 'test/x.test.mjs'}, file);
  for (let i = 0; i < 3; i++) record({capability: 'buy', kind: 'approved-unchanged'}, file);
  const file2 = pathToFileURL(`${mkdtempSync(`${tmpdir()}/iv-`)}/i.jsonl`);
  for (let i = 0; i < 3; i++) record({capability: 'buy', kind: 'approved-unchanged'}, file2);
  s = summary(all(file2), policy).capabilities.buy;
  assert.equal(s.eligibleForAuto, true);
  assert.equal(s.interventionRate, 0);
  assert.throws(() => record({capability: 'buy', kind: 'maybe'}, file2), /kind/);
});
