// Routine NeedAction screens that need no judgment: always delegate to staff.
// To add one: write {name, match, run} below and list it in HANDLERS. Unknown screens stop
// the autopilot so the model can look (see .claude/skills/fm-operate).
import {clickWhere, isoDate} from '../../ui/index.mjs';
import {log} from '../log.mjs';

const delegate = (name, pattern, describe) => ({
  name,
  match: s => s.buttons(pattern).length === 1,
  async run(s, {dryRun = false} = {}) {
    const entry = {action: name, date: isoDate(s.date()), detail: describe};
    if (dryRun) return {...entry, dryRun: true};
    await clickWhere(x => x.buttons(pattern)[0], name);
    await log(entry);
    return entry;
  },
});

export const HANDLERS = [
  // "Confirm Transfer" after a signing is agreed: hand finalizing to the General Manager.
  delegate('delegate-finalizing', /^Delegate 'Finalizing player signings/, 'GM finalizes signings'),
  // Squad code of conduct (fines): let the assistant choose.
  delegate('code-of-conduct', /^Ask .+ to Pick$/, 'assistant sets code of conduct'),
  // "<Player> wants to discuss personal matters": player morale is out of scope (user, 2026-10-04);
  // answer with the one-click option and move on.
  // "Ask <leader> to Resolve Issue" had no effect when clicked (31 tries); "Decline" works.
  {...delegate('player-issue', /^Decline$/, 'declined to discuss (morale out of scope)'),
    // Titles vary ("wants to discuss personal matters", "asks to discuss future"); the buttons don't.
    match: s => s.buttons(/^Discuss Issue with /).length === 1 && s.buttons('Decline').length === 1},
];
