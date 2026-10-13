# season: what happens when? (window → holiday → report)
Implements playbook §7–8. Calendar: `season.json` (window dates). Settings: `playbook/policy.json` → `holiday`.

**Interface:**
- `fm continue [N]`: press Continue until something needs us (`continue.mjs`)
- `fm run [--until YYYY-MM-DD]`: the autopilot through a window; routine screens are handled,
  decisions stop it with exit 2 (`autopilot.mjs`)
- `fm holiday [--until …] [--season]`: holiday between windows, going again when FM ends it early
  (`holiday.mjs`)
**How:** this module only sequences. Screen handlers live in `game/screens/`; decisions come from
`sell`, `buy` and `contracts`.
**Never:** makes a transfer or contract decision itself.
**Screens:** `docs/screens/season.md`.
