import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {get, learn, forget, key} from '../game/ui/person-index.mjs';

test('person index: learned once, found by folded name and club, forgotten on a wrong open', () => {
  const file = pathToFileURL(join(mkdtempSync(join(tmpdir(), 'fm-people-')), 'person-index.json'));
  assert.equal(get('Petar Đukić', 'Brentford', file), null);
  learn('Jereno Esajas', 'Brentford', 46799, file);
  learn('Paolo Boem', 'Brentford', 114409, file);
  learn('Nobody', 'Brentford', -1, file);   // not an index: ignored
  assert.equal(get('jereno  esajas', 'BRENTFORD', file), 46799);
  assert.equal(get('Paolo Boem', 'Brentford', file), 114409);
  assert.equal(get('Nobody', 'Brentford', file), null);
  forget('Paolo Boem', 'Brentford', file);
  assert.equal(get('Paolo Boem', 'Brentford', file), null);
  assert.equal(key('Zukić', 'LOSC Lille'), 'zukic|losc lille');
});
