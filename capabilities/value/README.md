# value: what a player is worth to us (playbook §3)
**Interface:**
- `fm value "<name>" [--range LOW,HIGH]` → floor (our minimum), target, factors, replacement
  (`analysis/evaluate_offer.py --price`)
- `pricebook.mjs`: `price(name, range, date)` for code; `record`/`lookup` keep each listed player's
  minimum/target (`local/runs/price-book.json`)
**How:**
- FM's value range is the anchor
- our own players aged 23 and under +10%
- expiring contracts are discounted
- a starter never goes below the cost of replacing his output
- `keep` when our minimum is above his top value
**Never:** sells or buys.
