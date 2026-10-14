# plan: what do we do this window?
Implements playbook §2-5 and §10. Numbers: `playbook/policy.json` → `buying`, `squad`, `autonomy`.

**Interface:** `fm plan --budget N [--snapshot file.csv] [--max-value N] [--fresh]` → one JSON plan,
the same pass at the start of every window (run it in the first days of July, after saving):
1. `alerts`: players the squad tables leave out (no contract; league regulars registered in our U21).
2. `changes`: who left (with their minutes for us) and who arrived since the last snapshot export
   (`local/exports/<save>-*.csv`, e.g. `claude-3-endseason-2029-30.csv`).
3. `slots`: our shape (`config/tactic.json`) slot by slot, from `fm window`.
4. `buy`: a priced shopping list within the budget. Per slot, starters first (we lack a *proven*
   starter: solid on a real sample), then depth (cheapest solid option, at most £15M). Each pick has
   `open_at` and `walk_away` from `fm price`.
5. `sell` (with real minutes) and `fringe` (no evidence either way).

**Never:** buys, sells or lists. Buying and selling need the user's approval (§10): the plan is the
proposal; the user approves each move and its price; the main session records it with `fm approve`.
**Code:** `analysis/plan.py` (on top of `analysis/window.py`).
