# value: what is a player worth to us, and in general?
Implements playbook §3. Numbers: `playbook/policy.json` → `valuation`, `selling._price_book`.

**Interface:**
- `fm value "<name>" [--range LOW,HIGH]` → our minimum, target, the factors, his replacement
  (`analysis/evaluate_offer.py --price`)
- `pricebook.mjs`: `price(name, range, date)` for code; `record`/`lookup` keep each listed
  player's minimum and target (`local/runs/price-book.json`, `fm prices`)
**How:**
- FM's value range is the market's price; our minimum and target are adjusted from it
- our own players aged 23 and under +10%; expiring contracts are discounted
- a starter never goes below the cost of replacing his output
- `keep` when our minimum is above the top of his range (worth more to us than the market pays)
**Never:** sells or buys.
