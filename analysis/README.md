# Analysis

Python (standard library only) on top of an FM26 Scout export of the save.

| Script | Output |
|---|---|
| `squad_report.py` | Markdown report: finances, starting XI vs best options, squad ranked on output, market targets with strong output per £ |
| `evaluate_offer.py` | JSON evidence for one incoming offer (importance, depth after sale, replacement) |
| `plan_window.py` | JSON window plan: weak XI slots, targets with max bids/wages, sale candidates |

Defaults come from `config/club.json` (club, save pattern) and `config/tactic.json` (slots).
FM26 Scout path: `FM26_SCOUT_PATH` (default `../fm26-scout`); saves: `FM26_SAVE_DIR` (default
FM26's games folder). Method: `docs/analysis/README.md`.
