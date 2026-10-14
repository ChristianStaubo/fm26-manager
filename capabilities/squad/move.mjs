// Move one of our players between squads (user, 2026-10-14: Eyestone, the first-choice GK, sat in
// the U21s and could not be picked). Profile → Actions → Squad → "Move To Senior Squad" /
// "Move To U18 Squad" (mapped 2030-07-17). The squad tables flag U21-registered league regulars
// (fm squad alerts; fm audit fails on them).
import {Screen, openPlayer, peekActions, actionPath, settle, overlays, NeedsAnalyst, isoDate} from '../../game/ui/index.mjs';
import {log} from '../log.mjs';

export const MOVES = {senior: 'Move To Senior Squad', u18: 'Move To U18 Squad'};

export async function movePlayer(name, club, {to = 'senior', dryRun = false} = {}) {
  const item = MOVES[to];
  if (!item) throw new Error(`--to ${Object.keys(MOVES).join('|')}`);
  const profile = await openPlayer(name, club);
  const {sub} = await peekActions('Squad');
  if (!sub.includes(item)) return {action: 'move', name, to, moved: false, why: `"${item}" not offered (already there?)`, offered: sub};
  if (dryRun) return {action: 'move', name, to, moved: false, dryRun: true};
  await actionPath(['Squad', item]);
  await settle(1500);
  const s = await Screen.read(), open = overlays(s);
  if (open.length) throw new NeedsAnalyst(`A dialog opened after "${item}": read it (fm overlays)`, {overlays: open});
  const after = (await peekActions('Squad')).sub;
  const entry = {action: 'move', date: isoDate(profile.date()), name, to, moved: !after.includes(item)};
  await log(entry);
  return entry;
}
