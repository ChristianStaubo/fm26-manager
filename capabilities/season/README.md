# season: what happens when? (window → holiday → report)
Implements playbook §1b, §7–8. The cycle: `playbook/cycle.json`. Calendar: `season.json` (window dates). Settings: `playbook/policy.json` → `holiday`.

**Interface:**
- `fm cycle [--budget N]`: **the loop**. Holiday to the next checkpoint in `playbook/cycle.json`, then
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
**Never:** makes a transfer or contract decision itself.
**Screens:** `docs/screens/season.md`.
