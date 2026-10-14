# buy: what's our min and max price, and how do we get him?
Implements playbook §5. Numbers: `playbook/policy.json` → `buying`, `contracts`.

**Interface:**
- `fm price "<name>"` → open at, walk away above, his wage vs our cap
- `fm ask "<name>" --club "<club>"` → his agent: will he join, the fee range the club wants, demands
- `fm buy "<name>" --club "<club>" [--open N] [--max N] [--wage-max N --replaces "<name>"] [--no-ask] [--dry-run]`
**How:**
- ask the agent first (one-time per player, user 2026-10-14): unwilling → no bid (usually a player
  who just signed a new contract: wait a season); else the value range becomes the agent's fee range
- a range starting above the user's approved limit stops for a new approval (no doomed bid)
- **release clause** on the offer screen ("has a minimum fee release clause of £X") within the max:
  pay exactly £X, every add-on fee and clause removed, no negotiating (user, 2026-10-14)
- a counter with a **sell-on clause** ("Percentage Of Profit From Next Sale"): remove it and offer
  their up-front fee without it; if they put it back, negotiate on (user: we buy young to sell on)
- open at FM's value (`open_at`; lower if the club is keen to sell), raise by `raise_step` of the
  bottom of his range, walk away above `default_max` × the top (or the analyst's maximum)
- the maximum is compared on the total, add-ons and pre-filled extras included
- a flat "the offer is unacceptable" means walk away: no raising, no retrying
- personal terms: staff first, then `contracts/personal-terms.mjs` within the wage cap
**Never:** chooses targets (that's `scout` plus the manager), and never finalizes above the maximum.
**Screens:** `docs/screens/transfers.md`.
