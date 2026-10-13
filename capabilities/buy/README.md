# buy: what's our min and max price, and how do we get him?
Implements playbook §5. Numbers: `playbook/policy.json` → `buying`, `contracts`.

**Interface:**
- `fm price "<name>"` → open at, walk away above, his wage vs our cap
- `fm buy "<name>" --club "<club>" [--open N] [--max N] [--wage-max N --replaces "<name>"] [--dry-run]`
**How:**
- open at FM's value (`open_at`; lower if the club is keen to sell), raise by `raise_step` of the
  bottom of his range, walk away above `default_max` × the top (or the analyst's maximum)
- the maximum is compared on the total, add-ons and pre-filled extras included
- a flat "the offer is unacceptable" means walk away: no raising, no retrying
- personal terms: staff first, then `contracts/personal-terms.mjs` within the wage cap
**Never:** chooses targets (that's `scout` plus the manager), and never finalizes above the maximum.
**Screens:** `docs/screens/transfers.md`.
