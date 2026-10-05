# Analyzing midfielders

Scores for defensive and central midfielders. The method (role groups,
percentiles, shrinkage, the attribute/stat split) is the same as in
[DEFENDERS.md](DEFENDERS.md). Findings come from the Brighton-2 save
(2025/26, 185 DM/central/wide midfielders with 16+ full, detailed matches).

## Roles

| Role | Attributes | Stats |
|---|---|---|
| Defensive midfielder | Tackling, Positioning, Anticipation, Marking, Concentration, Work Rate, Teamwork, Decisions, Passing, Composure | possession won/90, interceptions/90, tackles won/90, pressures completed/90, tackle %, passes completed/90, pass %, rating |
| Central / playmaking midfielder | Passing, Vision, Technique, First Touch, Decisions, Composure, Anticipation, Work Rate, Stamina, Off The Ball | progressive passes/90, xA/90, passes completed/90, pass %, possession won/90, shots/90, rating |

Ranking: output rank is the headline, blended rank is supplementary (see
[README.md](README.md)).

## Which stats are useful

| Stat (per 90) | Stable | Main attribute drivers | Use |
|---|---|---|---|
| Passes completed | 0.94 | Consistency, Tackling, Decisions | Yes, but partly reflects team style |
| Progressive passes | 0.90 | Consistency, Vision, Composure, Passing | Yes |
| Possession won | 0.80 | Tackling, Marking, Positioning | Yes |
| Interceptions | 0.81 | Tackling, Positioning, Anticipation | Yes |
| Pressures completed | 0.77 | Work Rate, Tackling, Anticipation | Yes |
| Rating | 0.70 | Consistency, Important Matches | Yes |
| Tackles won | 0.69 | Tackling, Work Rate | Yes |
| xA | 0.59 | Vision, Technique, First Touch | Yes |
| Header % | 0.51 | Jumping Reach, Heading, Strength | Context only |
| Tackle % | 0.45 | weak (Bravery 0.17) | Low weight |
| Assists, goals | 0.25-0.30 | — | No: use xA and xG instead |

Midfield stats are much more stable than defender stats. Midfielders are on
the ball often, so a season gives a large sample. The midfield group
includes wide midfielders, which inflates the stability of style-driven stats
such as dribbles.

Hidden attributes matter: **Consistency** is a top driver of most midfield
stats and of rating.

## Stats and attributes can disagree

When stats are much better than attributes, the player is outperforming his
profile. Possible reasons: a role or system that suits him, hidden
attributes, or luck. With 1,500+ minutes and stable stats, trust the output
more than the attribute ranking. Young players also grow into their
attributes.

Case: **Carlos Baleba**, 2025/26. Some of his DM numbers are among the best
in the Premier League: 11.2 possession won, 4.7 interceptions and 3.2
pressures completed per 90. His attributes are only average for a PL DM, and
he played 1,059 minutes. On output he ranks 7th of 32; the old attribute-heavy
score put him 21st, which undersold him. Age 22, PA 170: keep and develop.

## 2025/26 Brighton check

Output ranks (blended rank in brackets):
- Pascal Groß: 6th of 51 PL central midfielders (4th). Elite output, but age 35, £115K/week
  (highest wage), contract to 2027.
- Carlos Baleba: 7th of 32 PL DMs, 9th of 51 PL CMs (22nd). Output well ahead of
  attributes; age 22, PA 170.
- Junior Mwanga (new signing): 2nd of 31 Ligue 1 DMs (12th). Value £5.8M.
- Johann Lepenant (new signing): 15th of 53 Ligue 1 CMs.
- James Milner: 17th of 32 PL DMs. Age 40, contract expires 30 June 2026.
- Under 900 minutes, so not ranked: Wieffer, Hinshelwood, Ayari, O'Riley, Gómez.
  Several are valued at £20-40M: a squad-size and sales question.
