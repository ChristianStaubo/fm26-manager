# plan: what do we do this window?
Implements playbook §2-5 and §10. Numbers: `playbook/policy.json` → `buying`, `squad`, `autonomy`.

**Interface:** `fm plan --budget N [--lens moneyball|attributes] [--max-age N] [--snapshot file.csv] [--max-value N] [--fresh]` → one JSON plan,
the same pass at the start of every window (run it in the first days of July, after saving):
1. `alerts`: players the squad tables leave out (no contract; league regulars registered in our U21).
2. `changes`: who left (with their minutes for us) and who arrived since the last snapshot export
   (`local/exports/<save>-*.csv`, e.g. `claude-3-endseason-2029-30.csv`).
3. `slots`: our shape (`config/tactic.json`) slot by slot, from `fm window`.
4. `buy`: a priced shopping list within the budget. Per slot, starters first (we lack a *proven*
   starter: solid on a real sample), then depth (cheapest solid option, at most £15M). Each pick has
   `open_at` and `walk_away` from `fm price`.
   `shortlist`: the top options per starter gap, so the user chooses. Each buy carries `against`:
   the red team's case (wage vs our median, price per score point, no full season, age 28+,
   injury-prone, inconsistent, likely work permit), from the reasons the user dropped Ortega/Gadou.
   **Lenses:** `moneyball` (default): proven output for the money. `attributes` (user, 2026-10-14):
   younger, better players we can sell on later, scored on attributes alone; the whole market up to
   `--max-age`, a pick must beat our weakest starter's attributes there (floor 40); a higher fee is
   fine, the wage cap still holds. Example: `fm plan --budget 200m --lens attributes --max-age 24 --max-value 80m`.
   `growth` (user, 2026-10-15, the business model: young, good stats, cheap → develop → sell):
   output vs peers **in his own league** (young players are rarely PL-level yet), x league strength,
   then cheap for it. Finds development bets in second tiers and smaller leagues (Stange, Kovács).
   `wonderkid` (user, 2026-10-15: "attributes are more important… find wonderkids"): role attributes
   vs his **age group** at the position (z-score ≥ 2), not vs PL regulars at their peak; best for his
   age, cheaper first. Validated: Lemaitre (CB, 21, £1M) comes out z 3.2; Arena (ST, 21) z 3.6.
   Young ones not ready to start: buy, then loan out to play (the youth loan rule).
5. `sell` (with real minutes) and `fringe` (no evidence either way).

**Never:** buys, sells or lists. Buying and selling need the user's approval (§10): the plan is the
proposal; the user approves each move and its price; the main session records it with `fm approve`.
**Code:** `analysis/plan.py` (on top of `analysis/window.py`).
