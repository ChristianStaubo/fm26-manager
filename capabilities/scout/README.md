# scout: who we could buy (playbook §5)
Four lenses, each blind where another sees. Use them all and weigh them; no single number decides.
| Lens | Command | Finds | Blind spot |
|---|---|---|---|
| **output** | `fm scout [--positions …] [--budget N]` | proven production in our role (weighted stats ranked within each league); starters need the 40th attribute percentile vs our league | volume-biased (deep-defending teams); players without minutes |
| **raw** | `fm scout --raw` | one plain stat per position (xG+xA, progressive passes, possession won, rating, goals prevented), × league strength. `bargains` = at least as good as our best on the stat, at our level, cheapest first | one stat is narrow; weak leagues inflate counting stats (ability floor guards) |
| **ability** | `fm scout --ability` | at our level (CA ≥ our best − 5), or young (≤ 23, PA ≥ 150) already near it; ranked by **price vs market** (median value of similar ability/age) | ignores form and output; fair-priced good players rank mid (Querfeld ×1.05, Andrey Santos ×1.01) |
| **best** | `fm scout --best [--max-value N] [--max-wage N] [--max-age N]` | simply better players: quality = CA + stat percentile (per-90, league-adjusted, vs PL players at the position); only players better than our weakest starter there; `beats_ours` = stats at or above his. **Uses FM's CA on purpose** (user: demo mode, find the best players) | ignores price until you filter; CA is hidden info a real manager wouldn't have |
| **free** | `fm scout --free` | free agents, contracts ending this summer, fringe/backup players at their clubs; at our level, current wage ≤ our cap | wages: their current wage is only a floor for their demand |
Notes:
- Output ranks compare players within their own league; league strength = the league's top-200 average
  ability vs ours.
- Only playable leagues have match stats: players elsewhere appear through European competitions only.
- "Cheap" is also about **wages over the contract**, not just the fee (Querfeld: £29K/wk vs our CBs' ~£48K).
**Never:** bids.
