# Analyzing attackers

Scores for wingers, attacking midfielders and strikers. The method is the same as in
[DEFENDERS.md](DEFENDERS.md). Findings come from the Brighton-2 save (2025/26,
277 attacking midfielders and strikers with 16+ full, detailed matches).

## The key Moneyball finding: judge by xG and xA, not goals and assists

| Stat (per 90) | Stable | Main attribute drivers |
|---|---|---|
| xG | **0.61** | Anticipation, Finishing, Off The Ball |
| Goals | 0.43 | Finishing, Anticipation |
| xA | **0.65** | Vision, Crossing, Technique |
| Assists | 0.36 | Technique, Vision |
| **Goals minus xG** (finishing over/underperformance) | **0.03** | none |
| Shot conversion % | 0.11 | none |

Getting into scoring and creating positions is a stable skill. Over one season,
scoring more or fewer goals than xG predicts is almost pure noise: a striker
who "overperformed his xG" is mostly lucky, and one who "underperformed" is
mostly unlucky. That gives a Moneyball edge in both directions:
- **Sell** players whose goals far exceed their xG; the market pays for goals.
- **Buy** players with high xG and xA but disappointing goal and assist tallies.

## Other stats

| Stat (per 90) | Stable | Main attribute drivers |
|---|---|---|
| Dribbles | 0.89 | Dribbling, Crossing, Agility, Acceleration |
| Progressive passes | 0.88 | Crossing, Dribbling, Agility, Technique |
| Shots | 0.74 | Finishing, Off The Ball, Anticipation |
| Shots on target | 0.65 | Finishing, Off The Ball |
| Pass % | 0.66 | none: role and style |
| Rating | 0.53 | Technique, First Touch, Dribbling |
| Header % | 0.39 | Jumping Reach, Heading, Strength |
| Tackle % | 0.17 | none: don't use for attackers |

## Roles

| Role | Attributes | Stats |
|---|---|---|
| Winger / inside forward | Dribbling, Acceleration, Pace, Agility, Technique, Crossing, First Touch, Off The Ball, Finishing, Decisions | xG/90, xA/90, dribbles/90, progressive passes/90, shots/90, rating |
| Attacking midfielder | Vision, Passing, Technique, First Touch, Decisions, Off The Ball, Composure, Dribbling, Anticipation, Finishing | xA/90, xG/90, progressive passes/90, dribbles/90, pass %, rating |
| Striker | Finishing, Off The Ball, Anticipation, Composure, Heading, Jumping Reach, Strength, Acceleration, Pace, First Touch | xG/90, shots/90, xA/90, header %, rating |

## 2025/26 Brighton check

Output ranks (blended rank in brackets). Ranking method: [README.md](README.md).

| Player | Role | Output rank | Notes |
|---|---|---|---|
| Kaoru Mitoma | Winger | 5th of 45 PL (6th) | Elite. Age 29, contract 2027, value £54M: peak sale value is now or next season |
| Yankuba Minteh | Winger | 20th of 45 PL (19th) | Value £63M (highest in squad), age 21. Output doesn't match value yet |
| Jeremy Sarmiento | Winger | 7th of 62 Championship, on loan | Value £10.4M |
| Georginio Rutter | Attacking midfielder | 19th of 34 PL (24th) | 13 goals from about 10 xG: some finishing luck |
| Harry Howell | Attacking midfielder | 10th of 34 PL (27th) | Age 18, 961 minutes |
| Babis Kostoulas | Striker | 17th of 29 PL (21st) | Age 19 |
| Danny Welbeck | Striker | 24th of 29 PL (23rd) | Age 35 |
| Divin Mubama (new signing) | Striker | 16th of 55 in his previous league | Value £5.3M |

Evan Ferguson scored 18 at Roma from about 12.4 xG: a likely sell-high
candidate on the goals-vs-xG rule. Serie A isn't a loaded league, so he
can't be ranked.

**Striker is the weakest position in the squad.** Market candidates with strong
output and PL-level attributes: Will Lankshear (21, £12.7M) and Aune Heggebø (24, £8.6M).
