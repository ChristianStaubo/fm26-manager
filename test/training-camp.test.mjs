import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HANDLERS} from '../game/screens/admin/handlers.mjs';

// The pre-season camp message (2031-06-30), as the autopilot stopped on it.
const TEXTS = ['Phil Giles', 'Brentford training camp squad', 'Now', 'You have been asked to name a preliminary squad for the pre-season training camp in Dalian, China.'];
const BUTTONS = ['Respond', 'Auto Select', 'Auto Select - include youth prospects'].map(label => ({label}));
const screen = {
  texts: () => TEXTS, date: () => new Date(Date.UTC(2031, 5, 30)),
  hasText: m => TEXTS.some(t => (m instanceof RegExp ? m.test(t) : t === m)),
  buttons: m => BUTTONS.filter(b => m === undefined || (m instanceof RegExp ? m.test(b.label) : b.label === m)),
};

test('training camp squad: the staff pick it (Auto Select)', async () => {
  const h = HANDLERS.filter(x => x.match(screen));
  assert.deepEqual(h.map(x => x.name), ['training-camp-squad']);
  assert.equal((await h[0].run(screen, {dryRun: true})).detail, 'staff pick the training camp squad');
});

test('collective bonuses: keep the preselection and Confirm', async () => {
  const texts = ['Kornelius Saltrø', 'Collective bonuses to be decided', "Set the squad's collective win bonuses"];
  const buttons = ['Low (£7.25M)', 'Normal (£12.25M)', 'High (£17.25M)', 'Confirm'].map(label => ({label}));
  const s = {texts: () => texts, date: () => new Date(Date.UTC(2031, 6, 30)),
    hasText: m => texts.some(t => (m instanceof RegExp ? m.test(t) : t === m)),
    buttons: m => buttons.filter(b => m === undefined || (m instanceof RegExp ? m.test(b.label) : b.label === m))};
  assert.deepEqual(HANDLERS.filter(x => x.match(s)).map(x => x.name), ['collective-bonuses']);
});

test('captains: keep them (Confirm Captains)', async () => {
  const texts = ['David Rainford', 'Choose Brentford captain for the season'];
  const buttons = ['Review Captaincy', 'Confirm Captains', 'Warn Savinho About Losing Captaincy'].map(label => ({label}));
  const s = {texts: () => texts, date: () => new Date(Date.UTC(2031, 7, 4)),
    hasText: m => texts.some(t => (m instanceof RegExp ? m.test(t) : t === m)),
    buttons: m => buttons.filter(b => m === undefined || (m instanceof RegExp ? m.test(b.label) : b.label === m))};
  assert.deepEqual(HANDLERS.filter(x => x.match(s)).map(x => x.name), ['confirm-captains']);
});

test('injury: send him to a specialist (quickest return)', async () => {
  const texts = ['James Haycock', 'Jamie Lawrence injured'];
  const buttons = ['Send To Specialist (£3.1K) Out for 6 to 7 weeks - May prevent recurrence', 'Use Club Doctor (Free) Out for between 7 weeks and 8 weeks', 'Leave To Physio (Free)', 'Talk to Lawrence About Injury'].map(label => ({label}));
  const s = {texts: () => texts, date: () => new Date(Date.UTC(2031, 7, 7)),
    hasText: m => texts.some(t => (m instanceof RegExp ? m.test(t) : t === m)),
    buttons: m => buttons.filter(b => m === undefined || (m instanceof RegExp ? m.test(b.label) : b.label === m))};
  assert.deepEqual(HANDLERS.filter(x => x.match(s)).map(x => x.name), ['injury-specialist']);
});

test('a player asking for a new contract is a player issue: the assistant handles it (Miretti)', async () => {
  const texts = ['Paul Hodges', 'Miretti asks to discuss future'];
  const buttons = ['Discuss New Contract with Miretti', 'Decline', 'Ask Agent to Resolve Issue', 'Ask Savinho to Resolve Issue'].map(label => ({label}));
  const s = {texts: () => texts, date: () => new Date(Date.UTC(2032, 6, 4)),
    hasText: m => texts.some(t => (m instanceof RegExp ? m.test(t) : t === m)),
    buttons: m => buttons.filter(b => m === undefined || (m instanceof RegExp ? m.test(b.label) : b.label === m))};
  assert.deepEqual(HANDLERS.filter(x => x.match(s)).map(x => x.name), ['player-issue']);
});
