# contracts: who do we keep, and on what wage?
Implements playbook §6. Numbers: `playbook/policy.json` → `contracts`.

**Interface:**
- `fm renew "<name>" --club <club>`: the Director of Football negotiates a renewal (`renew.mjs`)
- personal terms for signings are handled inside `fm run` (`personal-terms.mjs`)
- `wage-exceptions.mjs`: a signing that replaces an outgoing player may earn up to his wage, even above the cap (`fm buy --wage-max N --replaces "<name>"`)
**How:**
- renew starters and good-value rotation players; let declining or surplus players go
- contract length by age: up to 5 years, 4 at 29, 2 at 30+
- personal terms: keep the agent's bonuses and clauses, offer `salary_factors` of the demand in turn
- wage cap = `max_salary_vs_first_team_median` × the first-team median (`analysis/wage_bands.py`);
  above it, stop for a decision. The club's wage budget is the real limit.
**Never:** cancels a deal because talks stall.
**Screens:** `docs/screens/contracts.md`.
