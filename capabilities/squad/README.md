# squad: which positions need improving?
Implements playbook §2. Numbers: `playbook/policy.json` → `squad`.

**Interface:** `fm squad [--fresh]` → JSON (`analysis/manager.py squad`).
**Reports (decides nothing):**
- depth per position and side: 2 specialists per slot, 3 options counting versatile cover
- `needs`: short on depth, or a starter in the bottom third of his league
- `sell_candidates`: surplus specialists, 30+ on big wages, expensive players who don't play
- `youth`: under-21s within reach of the first team's attributes are kept; the rest are loaned or sold
- `hierarchy`: from `fm dynamics` once read
**Never:** buys or sells. Starters come from `xi`.
