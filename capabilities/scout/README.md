# scout: who we could buy (playbook §5)
**Interface:** `fm scout [--positions RW,AM] [--budget N] [--per N] [--fresh]` → JSON per need:
the current starter, `to_start`, and candidates with output rank in their league, attribute
percentile vs our league, value, wage and contract.
**Filters:**
- natural in the position (side matters)
- wage ≤ 1.3× our first-team median
- starters need the 40th attribute percentile vs our league
- any age; sorted by output per £
**Never:** bids. Output ranks compare players within their own league; the attribute percentile is
the PL-readiness check. Goalkeepers often return no candidates (strict GK filter): judge GKs by hand.
