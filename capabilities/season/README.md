# season: what happens when? (window → holiday → report)
Implements playbook §1b, §7–8. The cycle: `playbook/cycle.json`. Calendar: `season.json` (window dates). Settings: `playbook/policy.json` → `holiday`.

**Interface:**
- `fm cycle [--budget N]`: **the loop**. To the next checkpoint in `playbook/cycle.json` (inside a transfer window the autopilot drives, a match day is a one-day holiday; outside, holiday), then
  run it (`checkpoint.mjs`)
- `fm checkpoint [<name>] [--budget N] [--no-save]`: run one checkpoint now: save, fresh export,
  every step in order, one report in `local/reports/checkpoints/<date>-<name>.md` (+ `.json`). No
  name: what's next. Steps are capability calls (`STEPS`); a failing step is reported, not skipped
- `fm continue [N]`: press Continue until something needs us (`continue.mjs`)
- `fm run [--until YYYY-MM-DD]`: the autopilot through a window; routine screens are handled,
  decisions stop it with exit 2 (`autopilot.mjs`)
- `fm holiday [--until …] [--season]`: holiday between windows, going again when FM ends it early
  (`holiday.mjs`)
**How:** this module only sequences. Screen handlers live in `game/screens/`; decisions come from
`sell`, `buy` and `contracts`.
**Stuck detection** (`progress.mjs`, robotics' execution monitoring): the autopilot fingerprints each
screen (main pane texts and action buttons, dialog, Continue slot, date; not clocks, live scores or
Portal tiles). A handler meeting a screen it already acted on today stops at once (`stuck: …`).
Progress for the 5-minute watchdog is a screen not seen before today, not a decision. A handler
that can't read a fact it needs throws `Unreadable` (`need()` in `game/ui/overlays.mjs`) before
acting: the autopilot reads again (twice at most), then hands over; it never decides on a blank.
**Fallback before a stop** (`fallback.mjs`, policy `autopilot.fallback`): a cheap model (`claude -p`,
Haiku, the user's login; ~4-8 s) looks first. A fact a handler can't read: it reads only that fact, which
must appear on the screen, and the handler's table decides. No handler: it may press one `safe_buttons`
button that is on the screen, or none; a screen with `money_words` always stops. At most 3 per run,
never twice on one screen; each is a `supervisor-decision` in the ledger for review. `FM_FALLBACK=off`.
**Verdicts** (`verdicts.mjs`, `fm verdicts` / `fm verdict`): every row a checkpoint raises (renewals, final
year, free agents, wonderkids, newgens, needs, buys, bargains, sells, plan) gets the manager's act / propose /
pass with a reason, stored beside the report (`<date>-<name>.verdicts.jsonl`). The judge fails a checkpoint
(from 2026-10-18 on) with rows unanswered. The user's review (`fm verdicts agree|overturn`) feeds the
autonomy ledger: agreed verdicts count towards 'auto'.
**Never:** makes a transfer or contract decision itself.
**Screens:** `docs/screens/season.md`.
