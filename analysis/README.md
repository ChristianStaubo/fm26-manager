# Analysis

Python (standard library only) on top of an FM26 Scout export of the save.

| Script | Output |
|---|---|
| `squad_report.py` | Markdown report: finances, starting XI vs best options, squad ranked on output, market targets with strong output per £ |
| `evaluate_offer.py` | JSON evidence for one incoming offer (importance, depth after sale, replacement) |
| `manager.py` | the shared data layer (load, policy, `available_free`, alerts) + `fm squad`, `fm scout`, `fm price`, `fm xi` |
| `window.py` | `fm window`: every slot of our shape, depth, best/value/bench/free targets, sell list |
| `plan.py` | `fm plan`: the window's priced buy list within budget, lenses, sells; `free_first` on top |
| `free_agents.py` | `fm free`: free agents + contracts ending by 30 June (loanees too), ranked by worth |
| `newgens.py` | the newgen checkpoint: the new youth class by potential; signable now vs watch until 18 |
| `results.py` | `fm results`: the scoreboard row (money + table) |
| `review.py` | `fm review`: older sell/buy review (superseded by `window.py`) |
| `scorecard.py`, `wage_bands.py` | role attribute fit + core stats; wage bands by squad status |
| `backtest_resale.py`, `backtest_contracts.py` | the backtests behind the attributes lens and the renewal test |

Defaults come from `config/club.json` (club, save pattern) and `config/tactic.json` (slots).
FM26 Scout path: `FM26_SCOUT_PATH` (default `../fm26-scout`); saves: `FM26_SAVE_DIR` (default
FM26's games folder). Method: `docs/analysis/README.md`.
