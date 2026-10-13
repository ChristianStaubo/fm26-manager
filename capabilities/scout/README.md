# scout: what does a good player look like, and who is one?
Implements playbook §5. Numbers: `playbook/policy.json` → `buying`.

**Interface:**
- `fm window` each summer: every slot of our tactic, depth, and per slot the best, best-value,
  bench and free options, plus the sell list
- `fm review`: the scorecard per position
- `fm scout [--raw | --ability | --free | --best]`: older lenses, kept as second opinions
**How:**
- **attribute fit**: the role's key attributes (1-20, visible only; FM's hidden CA/PA are not used)
- **stat profile**: the position's core numbers per 90 (e.g. DM = progressive passes + possession
  won), league-adjusted, as a percentile among regulars
- score = the average of the two; the verdict is where they agree
- regulars only: a target must have played `min_minutes_share` of the minutes in his league's data
- skip inconsistent players and big-match flops (`min_consistency`, `min_important_matches`)
- "cheap" includes wages over the contract, not just the fee
**Exception:** `--best` ranks on FM's CA plus stats, on purpose, as a "find the best players" demo.
**Never:** bids. Prices come from `value`/`buy`.
