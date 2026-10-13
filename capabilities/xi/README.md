# xi: who plays?
Implements playbook §7. Numbers: `playbook/policy.json` → `tactic`, `holiday`.

**Interface:** `fm xi [--fresh]` → the suggested XI for our tactic (`config/tactic.json`, shape
only), with alternatives per slot.
**How:** visible attributes for the role anchor the pick; this season's output moves it; natural
position and new signings count. Setting the XI in the game is not automated: on holiday the
assistant picks the team (see `holiday` in `policy.json`).
**Never:** changes the tactic.
