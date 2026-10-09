// fm scout must pass its lens flags through to the analysis (they were silently dropped once:
// every lens returned the output lens, friction 2026-10-09T13-16-17). Needs a local save export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {exportPath} from '../capabilities/data.mjs';

const scout = (...flags) => JSON.parse(execFileSync('node', ['cli/fm.mjs', 'scout', ...flags, '--positions', 'CB', '--per', '2'],
  {cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', timeout: 120000}));
test('each scout lens reaches its own analysis', {skip: !existsSync(exportPath()) && 'no local save export'}, () => {
  assert.ok(scout().targets, 'output lens');
  assert.match(scout('--raw').method, /plain stat/);
  assert.match(scout('--ability').method, /ability/);
  assert.match(scout('--free').method, /free agents/);
});
