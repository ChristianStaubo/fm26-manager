---
name: fm-moneyball
description: Moneyball analysis of the FM26 save — export the save, rank our players on output, find sell-high candidates, underpriced targets and expiring contracts, and turn it into a transfer plan. Use at the start of a transfer window, after a season, or to judge a specific offer.
---

# Moneyball analysis

Method: `docs/analysis/README.md` (output first, attributes supplementary) and
`docs/DECISION_GUIDELINES.md`. Club: `config/club.json`. Tactic slots: `config/tactic.json`.

## 1. Fresh data
Ask the user to **save the game** (or save it yourself: FM menu → Save Game). Then:
```bash
python3 analysis/squad_report.py                       # newest save matching config/club.json
python3 analysis/squad_report.py --max-value 40 --max-wage 80000 --max-age 27   # wider market
```
Needs FM26 Scout (`FM26_SCOUT_PATH`, default `../fm26-scout`). Report → `local/reports/`,
export → `local/exports/<save>.csv` (one row per player and competition; columns include
minutes, goals, xg, xg_p90, value, wage, contract_expires, on_loan_at, loan_ends).

## 2. Read it
- **League finish** and budget: `fm screen` on the Portal (Stages tile), report Finances.
- **Sell high**: value well above output rank; goals far above xG; big wage + few minutes;
  age 29+ with value still high. Prefer players with an internal replacement.
- **Keep**: high output rank on a low value/wage; young players whose output beats their value.
- **Contracts**: anything expiring this 30 June → renew now (or sell if not wanted).
- **Loans**: players returning (loan_ends) are free depth — count them.
- **Buy**: market tables (output per £); check the attribute floor and age. ST/AMC often have no
  candidates under the filters — search the export directly (goals/xG per 90, minutes ≥ 1500).
- Caveat: only the leagues loaded in the save have stats.

## 3. Plan (show the user, then execute with fm-transfers)
| Sell (asking price = top of value) | Keep / renew | Buy (opening bid, walk-away max) |
State the reason with numbers for each line, the money in/out, wage bill change, and the squad
after the window (two senior players per position, three goalkeepers).

## 4. Judging one offer
Inputs: offer terms (`fm screen` on View Offer), player output rank, depth after sale, contract
months left, replacement options. Output: accept / reject / counter (with up-front fee) and why.
The defaults in `tasks/transfers/rules.json` apply unless there is a football reason not to.

Thin market (a role lists no candidates)? Loosen the search: `python3 analysis/squad_report.py --max-value 35 --min-output 54 --min-minutes 900`. The report's budget line comes from the save; the live budget is `node cli/fm.mjs offers`.
