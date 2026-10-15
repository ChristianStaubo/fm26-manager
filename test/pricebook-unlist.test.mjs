import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Brown (2031-01-08): unlisted to renew him, but his price-book entry (minimum £39M, range null)
// survived; Villa's bid then crashed the offer handler on book.range[0].
test('unlist removes the price-book entry; a range-less entry does not crash the bid handler', () => {
  const list = readFileSync(new URL('../capabilities/sell/list.mjs', import.meta.url), 'utf8');
  assert.match(list, /priceBookRemoved: pricebook\.remove\(name\)/);
  const offers = readFileSync(new URL('../game/screens/transfer-offers.mjs', import.meta.url), 'utf8');
  assert.equal((offers.match(/book\.range \?/g) || []).length, 2);
});
