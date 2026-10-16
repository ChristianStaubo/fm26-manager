// Routine NeedAction screens that need no judgment: always delegate to staff.
// To add one: write {name, match, run} below and list it in HANDLERS. Unknown screens stop
// the autopilot so the model can look (see .claude/skills/fm-operate).
import {clickWhere, isoDate, parseMoney} from '../../ui/index.mjs';
import {log, history} from '../../../capabilities/log.mjs';
import {registrationHandler} from './registration.mjs';
import {NeedsAnalyst, click, recover, waitFor, settle} from '../../ui/index.mjs';

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
  // Also without Delay Transfer: "Kayode close to signing for R. Madrid" (2032-01-29) had Accept /
  // Cancel / Delegate 'Finalizing player sales…' only.
  match: s => s.buttons('Accept').length === 1 && s.buttons('Cancel').length === 1
    && (s.buttons('Delay Transfer').length === 1 || s.buttons(/^Delegate 'Finalizing player sales/).length === 1)
    && !s.buttons(/^Delegate 'Finalizing player signings/).length && s.texts().some(t => OUTGOING.test(t)),
  async run(s, {dryRun = false} = {}) {
    const headline = s.texts().find(t => OUTGOING.test(t)) || '';
    const player = OUTGOING.exec(headline)?.[1]?.trim();
    // Agreed = we accepted their bid, or they accepted our counter on the spot (Güreler, 2032-02-02).
    const agreed = player && (await history()).some(e => (e.accepted === true || /accept/i.test(JSON.stringify([e.decision, e.label, e.action]))) && JSON.stringify(e).includes(player));
    const entry = {action: 'confirm-outgoing', date: isoDate(s.date()), headline, player, agreed: !!agreed};
    if (!agreed) throw new NeedsAnalyst(`Confirm Transfer for ${player || 'unknown player'}: no record of us agreeing this deal. Read it (fm deal "${player}") and decide: fm click Accept / Cancel`, entry);
    if (dryRun) return {...entry, dryRun: true};
    await clickWhere(x => x.buttons('Accept')[0], 'Accept transfer');
    await log(entry);
    return entry;
  },
};

// "<Club> squad numbers to be decided" (2026-07-25): Respond → Ask Assistant to Assign → Confirm
// Squad Numbers → "Submit the current set of squad numbers?" Yes (KNOWN_DIALOGS, via recover).
const numbersPage = s => s.buttons('Ask Assistant to Assign').length === 1 && s.buttons('Confirm Squad Numbers').length === 1;
const squadNumbers = {
  name: 'squad-numbers',
  match: s => numbersPage(s) || (s.hasText(/squad numbers to be decided$/) && s.buttons('Respond').length === 1),
  async run(s, {dryRun = false} = {}) {
    const entry = {action: 'squad-numbers', date: isoDate(s.date()), detail: 'assistant assigned squad numbers'};
    if (dryRun) return {...entry, dryRun: true};
    if (!numbersPage(s)) { await click('Respond'); await waitFor(numbersPage, {what: 'squad numbers page'}); }
    await click('Ask Assistant to Assign'); await settle(1000);
    await click('Confirm Squad Numbers');
    await waitFor(x => x.tree.nodes.some(n => n.name === 'GenericModalDialog' && n.visible), {what: 'submit squad numbers dialog'});
    await recover();
    await log(entry);
    return entry;
  },
};

// Work permit rejected for a signing ("Lemaitre's work permit application rejected", 2030-07-18):
// Appeal (£5K) or Don't Appeal; the deal is on hold. policy.buying.work_permit_appeal decides:
// 'appeal' (approved signings), 'decline', or 'ask' (stop for the user).
export const workPermitRejected = {
  name: 'work-permit-rejected',
  match: s => s.buttons('Appeal').length === 1 && s.buttons("Don't Appeal").length === 1 && s.hasText(/work permit application rejected$/),
  async run(s, {dryRun = false} = {}) {
    const {loadPolicy} = await import('../../../capabilities/sell/decide.mjs');
    const player = s.texts().map(t => /^(.+)'s work permit application rejected$/.exec(t)?.[1]).find(Boolean) || '?';
    const cost = parseMoney(/cost of (£[\d,.]+[KM]?)/.exec(s.texts().find(t => /work permit appeal/.test(t)) || '')?.[1] ?? '');
    const rule = loadPolicy().buying.work_permit_appeal || 'ask';
    const entry = {action: 'work-permit', date: isoDate(s.date()), player, cost, rule};
    if (rule === 'ask' || dryRun) { if (!dryRun) await log({...entry, executed: false}); throw new NeedsAnalyst(`${player}: work permit rejected; appeal (${cost ? '£' + cost : 'cost unknown'}) or not? (policy buying.work_permit_appeal = ask)`, entry); }
    await click(rule === 'appeal' ? 'Appeal' : "Don't Appeal");
    await log({...entry, executed: true, choice: rule});
    return entry;
  },
};

// A signing refuses to complete without a work permit ("Ablaß unwilling to join without work permit",
// 2030-07-28): Persuade <X> to Complete Transfer (a chat) / Cancel Transfer; it blocks Continue.
// Supervisor rule (logged for the user's review): one honest persuasion ("…a good chance of getting a
// work permit if we keep at it"); if he still refuses, cancel: a permit appeal is uncertain.
export const unwillingWithoutPermit = {
  name: 'unwilling-without-permit',
  match: s => s.buttons('Cancel Transfer').length === 1 && s.buttons(/^Persuade .+ to Complete Transfer$/).length === 1,
  async run(s, {dryRun = false} = {}) {
    const player = /^Persuade (.+) to Complete Transfer$/.exec(s.buttons(/^Persuade .+ to Complete Transfer$/)[0].label)[1];
    const entry = {action: 'unwilling-without-permit', date: isoDate(s.date()), player};
    if (dryRun) return {...entry, dryRun: true};
    const {Screen, waitFor} = await import('../../ui/index.mjs');
    // The Portal overview shows this message as a tile over its buttons: the Continue slot ("Discuss
    // Transfer") opens the message itself (Ablaß, 2030-07-28: "occluded by layout-tile").
    if (s.buttons('Discuss Transfer').some(b => b.name === 'continue-button')) { await click('Discuss Transfer', {name: 'continue-button'}); await settle(2000); }
    const tried = (await history()).some(e => e.action === 'unwilling-without-permit' && e.player === player && e.persuaded === 'tried');
    if (!tried) {
      await click(`Persuade ${player} to Complete Transfer`);
      const x = await waitFor(y => y.buttons(/^I suggest you think again and join the club/).length > 0, {what: 'persuasion options', timeout: 8000}).catch(() => null);
      if (x) { await click(x.buttons(/^I suggest you think again and join the club/)[0].label); await settle(2500); }
      await log({...entry, persuaded: 'tried'});
      const after = await Screen.read();
      if (!after.buttons('Cancel Transfer').length) return {...entry, persuaded: 'tried', outcome: 'persuaded'};
    }
    await recover().catch(() => {});
    if ((await Screen.read()).buttons('Discuss Transfer').some(b => b.name === 'continue-button')) { await click('Discuss Transfer', {name: 'continue-button'}); await settle(2000); }
    await click('Cancel Transfer');
    await log({...entry, outcome: 'cancelled'});
    const {record} = await import('../../../capabilities/interventions.mjs');
    record({capability: 'buy', kind: 'supervisor-decision', date: entry.date, decided: `cancel ${player}: refuses without a work permit after one persuasion`});
    return {...entry, outcome: 'cancelled'};
  },
};

export const HANDLERS = [unwillingWithoutPermit, workPermitRejected, 
  squadNumbers,
  // "<Club> squad to be decided": register every eligible 21+ player, then submit (registration.mjs).
  registrationHandler,
  outgoingConfirm,
  invitation,
  // Board "Season expectations" (Response Required): keep the board's preselected objectives and
  // Confirm (user rule: no change of ambition unless asked). The Confirm button sits at the end
  // of the message, past the objectives (2026-06-25).
  {...delegate('season-expectations', /^Confirm$/, 'kept board expectations (defaults)'),
    match: s => s.hasText('Season expectations') && s.hasText(/^The board are ready to discuss season expectations/) && s.buttons('Confirm').length === 1},
  // Mid-season "Change Season Expectations" (Response Required, 2031-01-01): "Due to your
  // performance in the league we would like to offer you the opportunity to change your season
  // expectations"; options as buttons (Top half finish / Qualify for the Europa League / … Champions
  // League) + Confirm. Pick the least ambitious (the first): a raised target is judged and only adds
  // sacking risk (scoreboard floor: never relegated).
  {name: 'change-season-expectations',
    match: s => s.hasText('Change Season Expectations') && s.hasText(/opportunity to change your season expectations/) && s.buttons('Confirm').length === 1,
    async run(s, {dryRun = false} = {}) {
      const opts = s.buttons(/^(Top half finish|Qualify for |Win |Avoid |Finish |Mid-table|Promotion)/).sort((a, b) => a.bounds[1] - b.bounds[1]);
      const pick = opts[0]?.label;
      const entry = {action: 'change-season-expectations', date: isoDate(s.date()), options: opts.map(o => o.label), kept: pick || 'unchanged'};
      if (dryRun) return {...entry, dryRun: true};
      if (pick) { await click(pick); await settle(500); }
      await click('Confirm');
      await log(entry);
      return entry;
    }},
  // "<Club> offer job interview" (Arsenal, 2033-06-22; Brighton 2033-01): we manage Brentford, so
  // Decline Interview, always.
  {...delegate('decline-job-interview', /^Decline Interview$/, 'declined a job interview (we stay)'),
    match: s => s.hasText(/ offer job interview$/) && s.buttons('Decline Interview').length === 1},
  // "Confirm Transfer" after a signing is agreed: hand finalizing to the General Manager.
  delegate('delegate-finalizing', /^Delegate 'Finalizing player signings/, 'GM finalizes signings'),
  // Squad code of conduct (fines): let the assistant choose.
  delegate('code-of-conduct', /^Ask .+ to Pick$/, 'assistant sets code of conduct'),
  // "Collective bonuses to be decided" (2031-07-30, Response Required): Low / Normal / High per
  // competition; a change moves money to or from the transfer budget. Keep the game's preselection
  // and Confirm, as with the board's expectations (supervisor rule, for the user's review: Low would
  // add ~£9.8M to the budget).
  {...delegate('collective-bonuses', /^Confirm$/, 'kept the preselected collective bonuses'),
    match: s => s.hasText('Collective bonuses to be decided') && s.buttons('Confirm').length === 1},
  // "<Player> injured" (2031-08-07, Lawrence, dislocated shoulder): Send To Specialist (£3.1K, out
  // 6-7 weeks) beats the club doctor (7-8) and the physio (7-9): a few thousand for weeks back.
  {...delegate('injury-specialist', /^Send To Specialist/, 'sent the injured player to a specialist'),
    match: s => s.hasText(/ injured$/) && s.buttons(/^Send To Specialist/).length === 1},
  // No specialist offered (McAidoo, bruised toe, 2032-08-08: Give Injection / Leave To Physio): the
  // physio. Never an injection: he plays once, then is out longer.
  {...delegate('injury-physio', /^Leave To Physio/, 'left the injury to the physio'),
    match: s => s.hasText(/ injured$/) && !s.buttons(/^Send To Specialist/).length && s.buttons(/^Leave To Physio/).length === 1},
  // "Choose <Club> captain for the season" (2031-08-04): keep the current captain and vice-captain
  // (Confirm Captains). Changing them upsets the dressing room; not our decision to make.
  {...delegate('confirm-captains', /^Confirm Captains$/, 'kept the captain and vice-captain'),
    match: s => s.hasText(/^Choose .+ captain for the season$/) && s.buttons('Confirm Captains').length === 1},
  // "<Club> training camp squad" (2031-06-30, Response Required: name a preliminary squad for the
  // pre-season camp; buttons Respond / Auto Select / Auto Select - include youth prospects): the
  // staff pick it (Auto Select), as a person would. Not the match XI.
  {...delegate('training-camp-squad', /^Auto Select$/, 'staff pick the training camp squad'),
    match: s => s.hasText(/training camp squad$/) && s.buttons('Auto Select').length === 1},
  // "<Player> wants to discuss personal matters": go on holiday for a day and let the assistant
  // handle the conversation, as it does all season (user, 2026-10-09). This replaces auto-Decline
  // (2026-10-04; 34 declines in 2026 while morale and results fell).
  // "Ask <leader> to Resolve Issue" had no effect when clicked (31 tries).
  {name: 'player-issue',
    // Titles vary ("wants to discuss personal matters", "asks to discuss future"); the buttons don't.
    // Also "<Player> asks to discuss future … feels underpaid" (Miretti, 2032-07-04): "Discuss New
    // Contract with <Player>" / Decline / Ask Agent / Ask <captain>: the assistant handles it too.
    match: s => s.buttons(/^Discuss (Issue|New Contract) with /).length === 1 && s.buttons('Decline').length === 1,
    async run(s, {dryRun = false} = {}) {
      const entry = {action: 'player-issue', date: isoDate(s.date()), detail: 'holiday 1 day: assistant handles the conversation', headline: s.texts().find(t => / wants to | asks to /.test(t))};
      if (dryRun) return {...entry, dryRun: true};
      const {holiday} = await import('../../../capabilities/season/holiday.mjs');
      await holiday({days: 1});
      await log(entry);
      return entry;
    }},
];
