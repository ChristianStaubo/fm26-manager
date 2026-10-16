// The club's answer is the GM line, not a news story mentioning another club's general manager.
import test from 'node:test';
import assert from 'node:assert/strict';
import {gmLine, replyState} from './buy.mjs';

const screen = labels => ({buttons: re => labels.filter(l => re.test(l)).map(label => ({label})), hasText: () => false});
test('gmLine skips news that mentions a general manager (McAidoo, 2032-01-04)', () => {
  const s = screen(['Camarda rumors swirl as Man Utd watch on … catch the eye of Man Utd General Manager Jason Wilcox …',
    'Phil Giles General Manager Man City feel the offer for Ryan McAidoo is acceptable and are pleased at such swift negotiations.']);
  assert.match(gmLine(s), /^Phil Giles General Manager Man City/);
  assert.equal(replyState(s), 'accepted');
});

test("'they can get more' (no figure) is its own answer", () => {
  const s = screen(['Phil Giles General Manager Brighton feel they can get more for Kellen Fisher. An improved offer will need to be submitted for further consideration.']);
  assert.equal(replyState(s), 'more');
});
