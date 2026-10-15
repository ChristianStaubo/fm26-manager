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
| plan | `fm plan --budget N` | **start every window here**: alerts, departures since the last snapshot, a priced buy list within budget, sells (proposals for the user's approval) |
| window | `fm window [--slots LB,RW]` | **start here**: the standard window report (every slot: depth, blended + moneyball scores, best/value/bench/free, sell list) |
| results | `fm results --label … [--position N]` | scoreboard row: money + table |
| review | `fm review` | older sell/buy list (superseded by `fm window`) |
| squad | `fm squad` | depth per position, needs, sell candidates, youth |
| scout | `fm scout` · `--best` · `--raw` · `--ability` · `--free` | the older lenses: a second opinion on a shortlist |
| value | `fm value "<name>"` | our minimum/target for a player |
| buy | `fm buy "<name>" --club … --max N` | negotiates a signing to a max |
| sell | `fm run` answers bids; `fm sell "<name>"` lists | sale decisions against our minimum |
| contracts | `fm renew "<name>"` | the DoF renews; wage cap in personal terms |
| xi | `fm xi` | suggested starting XI |
| season | `fm run`, `fm holiday --season` | the window autopilot; holiday through the season |
After saving the game, add `--fresh` to the first data command (re-exports the save, ~30 s).

## The season cycle
Summer window → `fm save` → `fm holiday --season --until <year>-01-02` → January checkpoint (contracts
ending in June: ours renew/sell; others' ≤ 6 months left: pre-contracts) → holiday to 05-01 →
newgen checkpoint (the March-April intakes: wonderkid lens) → holiday to 05-28 → `fm results` → summer. Playbook §1b.

## A transfer window (the standard workflow)
1. **Timing:** save the game in the **first days of July** (after the season rollover, before the
   first league match) and run `fm plan --budget N --fresh`. That is the only moment the export has
   everyone's full-season stats; later, scores lean on attributes alone (the report warns).
   **Act on the plan's `alerts` and `changes` first** (no contract: renew or release; regulars in
   the U21; starters who left). Its `buy` list is the proposal you bring to the user.
2. **Read `fm window`** for the detail behind a slot: every slot of our shape (`config/tactic.json`)
   with depth (two solid per slot, one more CB than we start) and two scores per player, both
   percentiles vs Premier League regulars:
   - **blended** = role attributes (the prediction: attributes travel between clubs) + core stats
   - **moneyball** = the core stats alone (the job in numbers, league-adjusted)
   - **★ Chabot profile** = elite on both over a full season in a strong league: the safest buy.
   FM's current ability (CA) is never a ranking (user). Stats from a few games or a weaker league
   don't travel (Franculino, Katić); attributes did.
Buying, selling and taking bids need the user's approval (playbook §10, `fm approvals`): propose
each move with its price (buy: player, club, open, max; sell: player, minimum, why), then stop for
the user. `fm buy`/`fm sell` refuse anything not approved, and `fm run` stops on bids it would take.

3. **Sell first** from the sell list (weak, overpriced per point, small-sample stats the attributes
   don't back), max one Highly Influential per window, never below depth without the replacement.
4. **Buy per slot:** a NEED slot gets a starter (best / value with x-market, cheaper = better), depth
   gets **bench** players (cheap, <= £8M) and free agents. Big clubs ask far above FM's value
   (Kevin: £59M value, ~£100M asked); smaller leagues are closer to value.
5. Advance with `fm run` until the window closes; renew who the playbook keeps (`fm renew`).
6. **Scoreboard:** `fm results --label "end of window" --fresh` (and at season end with
   `--position N --points N`): money and table into `local/reports/<save>-results.md`.
7. **Write the lessons:** `fm note "<what worked / what didn't / what to change>"`.

## Season report (at the return date)
League position, points and cup runs against the baseline in the playbook; money in and out; how the
buys performed against the players sold. Then write the notebook.
