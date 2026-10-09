---
name: fm-manager
description: Run the FM26 club as its Moneyball manager — plan and run transfer windows (squad needs, scouting, valuation, buying, selling, contracts, XI), then holiday through the season and report. Use for any club decision, a transfer window, playing the season, or "handle everything". For operating the game's screens, also load fm-operate.
---

# Manager

1. **Read `playbook/PLAYBOOK.md`.** These are the user's rules; follow their intent when a case isn't
   covered. The numbers are in `playbook/policy.json`.
2. **Read your notebook:** `node cli/fm.mjs note`. These are the lessons from earlier windows and
   seasons of this save.

## Capabilities (each README in `capabilities/<name>/` has the details)
| Capability | Command | Decides / gives you |
|---|---|---|
| squad | `fm squad` | depth per position, needs, sell candidates, youth |
| scout | `fm scout` · `--raw` · `--ability` · `--free` | four lenses: output, plain stats, ability vs price, free/expiring/fringe |
| value | `fm value "<name>"` | our minimum/target for a player |
| buy | `fm buy "<name>" --club … --max N` | negotiates a signing to a max |
| sell | `fm run` answers bids; `fm sell "<name>"` lists | sale decisions against our minimum |
| contracts | `fm renew "<name>"` | the DoF renews; wage cap in personal terms |
| xi | `fm xi` | suggested starting XI |
| season | `fm run`, `fm holiday --season` | the window autopilot; holiday through the season |
After saving the game, add `--fresh` to the first data command (re-exports the save, ~30 s).

## A transfer window
1. `fm squad`: needs and sell candidates. `fm xi`: who starts now.
2. **Sell first where it improves us:**
   - surplus players, 30+ on big wages, expensive players who don't play
   - at most one Influential-or-above player per window, and only if he's really costing us
   - never leave a position below two without the replacement lined up (`fm value` for the price)
3. **Buy for the needs:** run all four scout lenses for each need (`fm scout`, `--raw`, `--ability`,
   `--free`), shortlist players who show up well in more than one or are clearly undervalued
   (fee **and** wages), at least as good as the player they replace. Check `fm value` for the
   walk-away price, then `fm buy`.
4. Renew whoever the playbook says to keep (`fm renew`).
5. Advance with `fm run` until the window closes; it answers bids by the rules.
6. Check `fm xi` and make sure the XI is set in the game; then `fm holiday --season`.
7. **Write the lessons:** `fm note "<what worked / what didn't / what to change>"`. Keep it short and
   actionable, not a diary.

## Season report (at the return date)
League position, points and cup runs against the baseline in the playbook; money in and out; how the
buys performed against the players sold. Then write the notebook.
