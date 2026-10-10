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
| review | `fm review [--max-value N] [--max-age N]` | **start here**: who to sell and who to buy (best, value, free/expiring), each player scored on attributes (prediction) + the position's core stats (evidence) |
| squad | `fm squad` | depth per position, needs, sell candidates, youth |
| scout | `fm scout` · `--best` · `--raw` · `--ability` · `--free` | the older lenses: a second opinion on a shortlist |
| value | `fm value "<name>"` | our minimum/target for a player |
| buy | `fm buy "<name>" --club … --max N` | negotiates a signing to a max |
| sell | `fm run` answers bids; `fm sell "<name>"` lists | sale decisions against our minimum |
| contracts | `fm renew "<name>"` | the DoF renews; wage cap in personal terms |
| xi | `fm xi` | suggested starting XI |
| season | `fm run`, `fm holiday --season` | the window autopilot; holiday through the season |
After saving the game, add `--fresh` to the first data command (re-exports the save, ~30 s).

## A transfer window
1. `fm review`: the sell and buy lists. `fm squad`: depth and needs. `fm xi`: who starts now.
   Read each score as two halves: attributes (will he be good?) and stats (has he been?). Both
   high = pay for it; stats without attributes = regression risk (sell ours, avoid theirs);
   attributes without stats = possible bargain; "attributes only" = no recent minutes (free/expiring).
2. **Sell first where it improves us:**
   - the review's sell list: weak on both, stats not backed by attributes, lucky finishers, a
     market price far above the score; plus surplus and 30+ on big wages
   - at most one Highly Influential-or-above player per window, and only if he's really costing us
   - never leave a position below two without the replacement lined up (`fm value` for the price)
3. **Buy for the needs**, three ways: the **best** upgrade we can afford, the best **value** (points
   gained per £10M, fee **and** wages), and **free/expiring** players. Few, targeted moves; each at
   least as good as the player he replaces. `fm price` for the walk-away, then `fm buy`. A swap may
   pay above the wage cap up to the outgoing player's wage (`--wage-max N --replaces X`).
4. Renew whoever the playbook says to keep (`fm renew`).
5. Advance with `fm run` until the window closes; it answers bids by the rules.
6. Check `fm xi` and make sure the XI is set in the game; then `fm holiday --season`.
7. **Write the lessons:** `fm note "<what worked / what didn't / what to change>"`. Keep it short and
   actionable, not a diary.

## Season report (at the return date)
League position, points and cup runs against the baseline in the playbook; money in and out; how the
buys performed against the players sold. Then write the notebook.
