# squad: what the squad needs (playbook §2)
**Interface:** `fm squad [--fresh]` → JSON (`analysis/manager.py squad`).
**Decides nothing; reports:**
- depth per position, per side, against 2 specialists per slot and 3 options with versatile cover
- `needs`: depth, or a starter in the bottom third of his league
- `sell_candidates`: surplus, 30+ on big wages, expensive players who don't play
- `youth`: keep if high potential, else loan or sell
- `hierarchy`: from `fm dynamics` once read; Influential and above may move at most once per window
**Never:** buys or sells. Starters come from `xi`.
