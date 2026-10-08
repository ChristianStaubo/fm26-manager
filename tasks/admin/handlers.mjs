// Routine NeedAction screens that need no judgment: always delegate to staff.
// To add one: write {name, match, run} below and list it in HANDLERS. Unknown screens stop
// the autopilot so the model can look (see .claude/skills/fm-operate).
import {clickWhere, isoDate, parseMoney} from '../../ui/index.mjs';
import {log, history} from '../log.mjs';
import {registrationHandler} from './registration.mjs';
import {NeedsAnalyst} from '../../ui/index.mjs';

// Invitations (friendly proposals, U18/U23 competition invitations, …): always accept
// (user, 2026-10-08). Friendly details are read for the log only.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "X have offered Brentford a friendly match at <ground> on Monday July 13th 2026. Brentford will receive a fee of £55,000 …"
export function readFriendly(text) {
  const m = / friendly match .* on \w+ (\w+) (\d{1,2})(?:st|nd|rd|th) (\d{4})/.exec(text || '');
  if (!m || MONTHS.indexOf(m[1]) < 0) return null;
  return {date: new Date(Date.UTC(+m[3], MONTHS.indexOf(m[1]), +m[2])), fee: parseMoney(/fee of (£[\d,.]+[KM]?)/.exec(text)?.[1]) ?? 0, club: /^(.+?) have offered/.exec(text)?.[1]};
}

const invitation = {
  name: 'accept-invitation',
  // Friendlies: Accept/Reject Invitation. Youth league entries ("U18 Division 2 invitation":
  // keep entering next season?): Accept/Decline under a title ending in "invitation".
  match: s => (s.buttons('Accept Invitation').length === 1 && s.buttons('Reject Invitation').length === 1)
    || (s.buttons('Accept').length === 1 && s.buttons('Decline').length === 1 && s.hasText(/ invitation$/)),
  async run(s, {dryRun = false} = {}) {
    const f = readFriendly(s.texts().find(t => !!readFriendly(t)));
    const entry = {action: 'accept-invitation', date: isoDate(s.date()), ...(f ? {kind: 'friendly', club: f.club, matchDate: isoDate(f.date), fee: f.fee} : {kind: s.texts().find(t => / invitation$/.test(t)) || 'invitation'})};
    if (dryRun) return {...entry, dryRun: true};
    await clickWhere(x => x.buttons('Accept Invitation')[0] || x.buttons('Accept')[0], 'Accept');
    await log(entry);
    return entry;
  },
};

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

// Loans: "Valdimarsson set to move on loan to Strasbourg"; sales: "Yarmoliuk close to signing for
// Newcastle" (2026-07-07, with a "Delegate 'Finalizing player sales…'" button).
const OUTGOING = /^(.+?) (?:set to (?:move|join|leave)|close to signing for) /;
// An agreed outgoing deal asks for a final "Confirm Transfer" (Accept / Delay Transfer / Cancel):
// "<Player> set to move on loan to <Club>". Accept only deals our log shows we agreed to; anything
// else (e.g. a deal agreed before this tooling, or by staff) stops for a decision.
const outgoingConfirm = {
  name: 'confirm-outgoing',
  // Our own signings show the same buttons plus "Delegate 'Finalizing player signings…'"
  // (delegate-finalizing handles those); outgoing ones read "<Player> set to move/join/leave".
  match: s => s.buttons('Accept').length === 1 && s.buttons('Delay Transfer').length === 1 && s.buttons('Cancel').length === 1
    && !s.buttons(/^Delegate 'Finalizing player signings/).length && s.texts().some(t => OUTGOING.test(t)),
  async run(s, {dryRun = false} = {}) {
    const headline = s.texts().find(t => OUTGOING.test(t)) || '';
    const player = OUTGOING.exec(headline)?.[1]?.trim();
    const agreed = player && (await history()).some(e => /accept/i.test(JSON.stringify([e.decision, e.label, e.action])) && JSON.stringify(e).includes(player));
    const entry = {action: 'confirm-outgoing', date: isoDate(s.date()), headline, player, agreed: !!agreed};
    if (!agreed) throw new NeedsAnalyst(`Confirm Transfer for ${player || 'unknown player'}: no record of us agreeing this deal. Read it (fm deal "${player}") and decide: fm click Accept / Cancel`, entry);
    if (dryRun) return {...entry, dryRun: true};
    await clickWhere(x => x.buttons('Accept')[0], 'Accept transfer');
    await log(entry);
    return entry;
  },
};

export const HANDLERS = [
  // "<Club> squad to be decided": register every eligible 21+ player, then submit (registration.mjs).
  registrationHandler,
  outgoingConfirm,
  invitation,
  // Board "Season expectations" (Response Required): keep the board's preselected objectives and
  // Confirm (user rule: no change of ambition unless asked). The Confirm button sits at the end
  // of the message, past the objectives (2026-06-25).
  {...delegate('season-expectations', /^Confirm$/, 'kept board expectations (defaults)'),
    match: s => s.hasText('Season expectations') && s.hasText(/^The board are ready to discuss season expectations/) && s.buttons('Confirm').length === 1},
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
