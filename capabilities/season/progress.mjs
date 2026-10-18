// Progress monitor for the autopilot (robotics: execution monitoring; ROS Nav2's progress checker).
// The autopilot makes progress when the screen changes after it acts. Meeting a screen again with an
// action that already ran on it today means the action had no effect: stop in seconds, instead of
// looping until the 5-minute watchdog. Screens are compared by a fingerprint of what matters (the
// main pane's texts and buttons, any dialog, the Continue slot, the date), not by text that changes
// on its own (clock, match minutes, live scores).
import {createHash} from 'node:crypto';
import {overlays} from '../../game/ui/overlays.mjs';
import {isoDate} from '../../game/ui/screen.mjs';

const VOLATILE = /^(\d{1,2}:\d\d(\s?[AP]M)?|\d{1,3}(\+\d{1,2})?'|\d{1,2}\s?[-–]\s?\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}\b.*)$/;
const MAIN = i => i.bounds[0] > 480;   // the sidebar (news, inbox list) is left of this; summarize() uses the same line

// Portal tiles fold their live content into the label ("Fixture Schedule Sat 8/4 H 1 - 1…", "Matches
// Premier League (6) …", news) and tables are unnamed buttons (standings): all change during a day.
// Action buttons are named (SIButton, StandardButton, continue-button…). Live goals: "10' B. Díaz".
const TILES = new Set(['layout-tile-interaction-button', 'background-button', '']);
const LIVE = /^\d{1,3}(\+\d{1,2})?' /;
export function fingerprint(s) {
  const keep = i => MAIN(i) && i.label && i.label.length > 1 && !VOLATILE.test(i.label);
  const texts = s.items.filter(i => i.kind === 'text' && keep(i)).map(i => i.label).slice(0, 80);
  const buttons = [...new Set(s.items.filter(i => i.kind === 'button' && i.enabled && keep(i) && !TILES.has(i.name || '') && !LIVE.test(i.label)).map(i => i.label))].slice(0, 40);
  const dialog = overlays(s).find(o => o.kind === 'dialog');
  const parts = [isoDate(s.date()) || '', s.continueLabel() || '', dialog ? `${dialog.title}|${dialog.description}` : '', ...texts, '|', ...buttons];
  return createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 12);
}

/** One game day at a time: which screens we have seen, and which actions ran on each. */
export class Progress {
  constructor() { this.day = null; this.seen = new Set(); this.done = new Map(); }
  #today(day) { if (day !== this.day) { this.day = day; this.seen.clear(); this.done.clear(); } }
  /** A screen read. True when it is new today: that is progress (resets the watchdog). */
  saw(fp, day) { this.#today(day); const fresh = !this.seen.has(fp); this.seen.add(fp); return fresh; }
  /** Before acting: did this action already run on this very screen today? */
  repeated(fp, action, day) { this.#today(day); return !!this.done.get(fp)?.has(action); }
  /** After an action ran (not when it was refused before acting). */
  acted(fp, action, day) { this.#today(day); if (!this.done.has(fp)) this.done.set(fp, new Set()); this.done.get(fp).add(action); }
}
