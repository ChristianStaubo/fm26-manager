// Press conferences (game state `PressConference`). New-signing unveilings are optional but
// block Continue until held. The Continue-slot "Attend Press Conference" does nothing when
// clicked; the button inside the message does. Leaving without starting does not clear it.
// Route: message → (delegate future ones to staff) → Attend Press Conference → Start Press
// Conference → answer every question with the first (most positive) answer → Leave.
import {Screen, waitFor, settle, click, clickWhere, isoDate, NeedsAnalyst} from '../../ui/index.mjs';
import {log} from '../../../capabilities/log.mjs';

const inRoom = s => s.hasText('Press Room');
const question = s => s.texts().find(t => /^Question \d+ of \d+$/.test(t)) || null;
// Answers: labelled StandardButtons inside the head coach panel, top (most positive) first.
export function answers(s) {
  const panel = s.items.find(i => i.kind === 'button' && / Head Coach\b/.test(i.label));
  if (!panel) return [];
  const [x, y, w, h] = panel.bounds;
  return s.buttons().filter(b => b.name === 'StandardButton' && b.label && b.bounds[0] >= x && b.bounds[0] < x + w && b.bounds[1] >= y && b.bounds[1] < y + h)
    .sort((a, b) => a.bounds[1] - b.bounds[1]);
}
const delegateButton = s => s.buttons(/^Delegate 'Attends .*Press Conferences' to /)[0];
const attendInMessage = s => s.buttons('Attend Press Conference').find(b => b.name !== 'continue-button');
// The message that announced the conference, in the Portal inbox.
const messageItem = s => s.buttons().find(b => b.name === 'NewsItemButton' && /to be unveiled|[Pp]ress [Cc]onference/.test(b.label));

// What the handler would use on this screen (for tests and dry runs).
export const locate = s => ({inRoom: inRoom(s), question: question(s), answers: answers(s).length,
  attend: !!attendInMessage(s), delegate: !!delegateButton(s), message: messageItem(s)?.label || null});

export async function pressConference({dryRun = false} = {}) {
  let s = await Screen.read();
  const entry = {action: 'press-conference', date: isoDate(s.date())};
  if (dryRun) return {...entry, dryRun: true, ...locate(s)};
  if (!inRoom(s)) {
    if (!attendInMessage(s)) {
      if (!messageItem(s)) { await click('Portal'); s = await waitFor(x => !!messageItem(x), {what: 'press conference message', timeout: 5000}).catch(() => Screen.read()); }
      if (!messageItem(s)) throw new NeedsAnalyst('Press conference pending but no message announcing it was found', {texts: s.texts().slice(0, 40)});
      await clickWhere(messageItem, 'press conference message');
      s = await waitFor(x => !!attendInMessage(x), {what: 'Attend Press Conference (message)'});
    }
    // Hand future unveilings to staff when the message offers it (once per save).
    if (delegateButton(s)) { await clickWhere(delegateButton, 'delegate press conferences'); entry.delegated = true; await settle(800); }
    await clickWhere(attendInMessage, 'Attend Press Conference (message)');
    s = await waitFor(inRoom, {what: 'press room'});
  }
  if (!question(s)) { await click('Start Press Conference'); s = await waitFor(x => !!question(x) && answers(x).length > 0, {what: 'first question'}); }
  let answered = 0;
  for (let q = question(s); q; q = question(s)) {
    if (++answered > 20) throw new NeedsAnalyst('Press conference did not end after 20 answers', {question: q});
    await clickWhere(x => answers(x)[0], `answer to ${q}`);
    s = await waitFor(x => question(x) !== q || !answers(x).length, {what: `next question after ${q}`});
    if (question(s) && !answers(s).length) s = await waitFor(x => answers(x).length > 0 || !question(x), {what: 'answers'});
  }
  await click('Leave Press Conference', {name: 'continue-button'});
  await settle(1500);
  const done = {...entry, answered};
  await log(done);
  return done;
}
