# sell: who do we sell, and is this bid good enough?
Implements playbook §4. Numbers: `playbook/policy.json` → `selling`, `agent_payoff`.

**Interface:**
- `fm sell "<name>" --club <club> [--min N] [--dry-run]`: list a player (`list.mjs`); prices him
  with `value`, records the price book, asking price Unspecified
- bids, loans and agent payoffs are decided inside `fm run` (`decide.mjs`: `decideSale`,
  `decideLoan`, `decidePayoff`) → accept / reject / counter / escalate
**How:**
- anyone is for sale at the right price; Highly Influential and above at most one per window
- bids are judged on guaranteed money plus add-ons; never accept a first negotiable offer
- counter towards our target; after `max_counters`, accept at or above our floor
- lowballs are rejected outright (rejecting never loses a player)
- a loan with an obligation to buy is a sale; agent payoffs are always settled
- key players and big fees escalate to the manager
**Never:** sells without a replacement in the squad or an affordable target.
**Screens:** `docs/screens/transfers.md`.
