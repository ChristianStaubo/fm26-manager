// Train one of our players in a new position (user, 2035-01-19: Rosete, an MC rated 16 at DM, "should
// for sure be playing, DM"): Profile → Actions → Training → Position/Role → <position> → <role>
// (mapped 2035-01-20; no dialog follows). The user's position calls live in config/tactic.json
// "plays"; the depth chart already counts him there, this makes FM's rating catch up so the
// assistant picks him.
import {openPlayer, peekActions, actionPath, settle, overlays, Screen, NeedsAnalyst, isoDate} from '../../game/ui/index.mjs';
import {log} from '../log.mjs';

// Our tactic's role per position group (config/tactic.json slots: DM → "DM").
export const ROLE = {DM: ['DM', 'Defensive Midfielder'], CB: ['D (C)', 'Centre-Back'], ST: ['ST (C)', 'Advanced Forward']};

export async function trainPosition(name, club, pos, {dryRun = false} = {}) {
  const [menu, role] = ROLE[pos] || [];
  if (!menu) throw new Error(`No position-training route for ${pos} (known: ${Object.keys(ROLE).join(', ')})`);
  const profile = await openPlayer(name, club);
  const {sub} = await peekActions(['Training', 'Position/Role', menu]);
  if (!sub.includes(role)) throw new NeedsAnalyst(`"${role}" not offered under ${menu}`, {offered: sub});
  if (dryRun) return {action: 'train-position', name, pos, role, dryRun: true};
  await actionPath(['Training', 'Position/Role', menu, role]);
  await settle(1500);
  const open = overlays(await Screen.read());
  if (open.length) throw new NeedsAnalyst(`A dialog opened after position training: read it (fm overlays)`, {overlays: open});
  const entry = {action: 'train-position', date: isoDate(profile.date()), name, pos, role};
  await log(entry);
  return entry;
}
