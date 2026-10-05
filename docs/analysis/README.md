# Player analysis

How we rate players for the Moneyball save. Position-specific detail:
[goalkeepers](GOALKEEPERS.md), [defenders](DEFENDERS.md),
[midfielders](MIDFIELDERS.md), [attackers](ATTACKERS.md).

## Scoring

1. **Output rank is the headline.** It ranks what a player produced, as if we
   couldn't see attributes, so our assumptions about which attributes matter
   can't bias it.
   - Outfield: average percentile of the role's stats against the same role in
     the same league (900+ minutes), shrunk toward average:
     `50 + (raw - 50) x minutes / (minutes + 1500)`.
   - Goalkeepers: goals prevented per 90 from shots on target, shrunk by
     `minutes / (minutes + 1300)`.
2. **Blended rank is supplementary.** 75% output, 25% attribute percentile.
   Use it to spot output that may be distorted by the team, the role or luck.
3. **Flags mark big gaps.** "Output >> attributes" means proven but possibly
   overachieving; check whether it holds next season. "Attributes >> output"
   means talent that isn't showing; find out why (role, team, injuries).
4. **Market searches rank by output per £, with an attribute floor.** Output
   is ranked within each player's own league, so a player who dominates a weak
   league looks elite. Candidates must have attributes at least at the
   bottom-quarter level of our league's players in that role.

Report ranks as "5th of 51 PL full-backs", with the comparison group:
same role, same main league, 900+ minutes.

## Rules learned from the 2025/26 data

- Judge attackers by xG and xA, not goals and assists. Goals minus xG is
  noise over a season (stability 0.03). Sell overperformers, buy unlucky
  high-xG players.
- Judge keepers by shots-on-target goals prevented, not the game's xGP,
  which counts shots that miss the target.
- No possession adjustment: in FM it makes defensive stats more biased, not
  less.
- Tackles, clearances, blocks, mistakes, conversion % and tackle % are mostly
  noise. Don't rank on them.
- Every metric gets tested for stability (two halves of a season), team bias
  and attribute link before it's used.

## Producing the report

```bash
python3 analysis/squad_report.py     # newest save (config/club.json); needs FM26 Scout (FM26_SCOUT_PATH or ../fm26-scout)
```

The report goes to `local/reports/` (ignored by git: it contains game
database values). It covers finances, every contracted player's best role with
output and blended ranks, and a market shortlist per role. Wage room isn't in the save
(the game's payroll includes staff wages), so read "Salary available" from
Club > Finances.
