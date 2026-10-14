# contracts: who do we keep, and on what wage?
Implements playbook §6. Numbers: `playbook/policy.json` → `contracts`.

**Interface:**
- `fm renew "<name>" --club <club>`: the Director of Football negotiates a renewal (`renew.mjs`)
- personal terms for signings are handled inside `fm run` (`personal-terms.mjs`)
- `wage-exceptions.mjs`: a signing that replaces an outgoing player may earn up to his wage, even above the cap (`fm buy --wage-max N --replaces "<name>"`)
**How:**
- renew starters and good-value rotation players; let declining or surplus players go
- contract length by age: up to 5 years, 4 at 29, 2 at 30+
- personal terms: the probe (`contracts.probe`, user 2026-10-15): open 4 ticks under his demand (5 when
  it's £75K+), read his counter (written into the form): firm → 1 tick under it, flexible → 2; the last
  round takes it. Only the salary moves; bonuses, clauses and length untouched. `--preview` stops
  before Suggest Terms. "Exceeds board's max allowance" = payroll budget too small: stop for the user
- wage cap = `max_salary_vs_first_team_median` × the first-team median (`analysis/wage_bands.py`);
  above it, stop for a decision. The club's wage budget is the real limit.
**Never:** cancels a deal because talks stall.
**Screens:** `docs/screens/contracts.md`.
