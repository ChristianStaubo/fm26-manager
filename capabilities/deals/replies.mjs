// The club's answer during a negotiation, as an explicit set of states (2032-02: we met them one bug
// at a time: "acceptable", "negotiated", "can get more", "non-negotiable", "cannot sign"…).
// The General Manager line ("Phil Giles General Manager <answer>") → one state. Anything not listed
// is 'unknown': the caller saves the screen and stops, so a new answer becomes a test, not a timeout.
import {writeFileSync, mkdirSync} from 'node:fs';
const RUNS = new URL('../../local/runs/', import.meta.url);

export const REPLIES = [
  ['made', /An offer has been made/i],
  ['agreement', /An agreement has been reached/i],
  ['rejected', /is unacceptable|have rejected|bid rejected/i],
  ['final', /have submitted a non-negotiable offer/i],
  ['accepted', /prepared to accept the latest offer|feel the (offer|negotiation) for .+ is acceptable|(?<!un)acceptable/i],
  ['countered', /negotiated the offer|responded to the latest offer/i],
  ['more', /can get more|improved offer will need/i],
  ['submit', /declined to give an immediate answer|An offer will need to be submitted/i],
  ['notes', /noted some key considerations|prepared a few notes/i],
];
/** 'accepted' | 'countered' | 'more' | 'final' | 'rejected' | 'made' | 'agreement' | 'submit' | 'notes' | 'unknown' | null (no line) */
export function classify(gm) {
  if (!gm) return null;
  return REPLIES.find(([, re]) => re.test(gm))?.[0] ?? 'unknown';
}

/** Keep the screen of an answer we can't read (local/runs/<prefix>-<time>.json): it becomes a test. */
export function saveReplyScreen(prefix, x, extra = {}) {
  const dump = {...extra, buttons: x.buttons(/./).map(b => b.label).slice(0, 80), texts: x.texts().slice(0, 120)};
  mkdirSync(RUNS, {recursive: true});
  writeFileSync(new URL(`${prefix}-${Date.now()}.json`, RUNS), JSON.stringify(dump, null, 1));
  return dump;
}
