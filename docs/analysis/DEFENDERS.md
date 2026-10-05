# Analyzing defenders

How we score centre-backs, full-backs and wing-backs. The aim is a usable score,
not a perfect one. Findings come from the Brighton-2 save (2025/26, 182
centre-backs and 132 full-backs with 16+ full, detailed matches). The general
method (testing metrics, per 90 and shrinkage) is in
[GOALKEEPERS.md](GOALKEEPERS.md).

## Score by role, not position

What a defender should do depends on our tactic. Score each player in the role
we actually use him in:

| Role | Attributes (supplementary) | Stats (output) |
|---|---|---|
| Centre-back | Jumping Reach, Heading, Strength, Positioning, Marking, Tackling, Anticipation, Concentration | headers won/90, interceptions/90, header %, rating |
| Defensive full-back | Acceleration, Pace, Stamina, Work Rate, Anticipation, Composure, Tackling, Marking | pressures completed/90, interceptions/90, possession won/90, tackles won/90, headers won/90, rating |
| Attacking / playmaking wing-back | Crossing, Passing, Vision, Technique, First Touch, Dribbling, Acceleration, Pace, Stamina, Work Rate | dribbles/90, progressive passes/90, crosses completed/90, xA/90, pass %, header %, rating |

The wing-back stats are the user's own Moneyball view, validated below. For
a playmaking wing-back, defensive output barely matters.

## Score calculation

See [README.md](README.md): output rank (stats only, shrunk for minutes) is the
headline; blended rank (75% output, 25% attributes) is supplementary.

The defensive full-back stats are purely defensive. An earlier version
included progressive passes, which inflated passers' "defensive" scores.

## Which stats are useful

"Stable" means agreement between two random halves of a season. Values near
0 are noise.

**Centre-backs**

| Stat (per 90) | Stable | Main attribute drivers | Use |
|---|---|---|---|
| Headers won | 0.69 | Jumping Reach 0.66, Heading, Strength | Yes, best CB stat |
| Avg rating | 0.42 | Positioning, Marking, Tackling | Yes |
| Interceptions | 0.32 | Tackling, Marking, Strength | Yes, low weight |
| Header % | 0.32 | Jumping Reach, Heading | Yes, low weight |
| Possession won | 0.70 | none | No: reflects role/system |
| Tackles, key tackles, clearances, blocks | 0.08-0.33 | weak | No |
| Mistakes leading to goal | 0.06 | none | No, too rare |

**Full-backs and wing-backs**

| Stat (per 90) | Stable | Main attribute drivers |
|---|---|---|
| Progressive passes | 0.86 | Technique, First Touch, Passing, Off The Ball |
| Dribbles | 0.83 | Acceleration, Pace, Dribbling |
| Crosses completed | 0.70 | Crossing, Corners |
| Pressures completed | 0.61 | Acceleration, Stamina, Work Rate |
| Tackles won | 0.56 | Stamina, Acceleration |
| Interceptions | 0.54 | Anticipation, Composure |
| Rating | 0.45 | Important Matches, Consistency |
| Pass % | 0.34 | Passing, Composure |
| xA | 0.33 | Crossing, First Touch, Vision |
| Header % | 0.26 | Jumping Reach, Heading |

xA and header % are noisy over one season: shrink them and weight them lightly.

## Findings

- **No possession adjustment.** In FM, raw defensive stats barely depend
  on opponent possession. Adjusting for it, as real-life analytics does,
  made the bias worse.
- **No goals-prevented equivalent yet.** No individual defensive stat
  correlates with the team's xG conceded (r ≈ 0). Possible future test: team
  xG conceded with and without the player.
- **Hidden attributes matter.** Consistency and Important Matches drive the
  average rating. Bravery drives blocks; Composure and Concentration drive
  interceptions. Pace barely affects centre-back stats, though it may matter in
  ways we can't measure, such as recovery runs.

## 2025/26 Brighton check

Premier League output ranks (blended rank in brackets):
- Lewis Dunk: **5th of 64** centre-backs (14th). Elite output at 34; the
  case for replacing him is age and his £87K wage, not performance.
- Jan Paul van Hecke: 7th of 64 (3rd). Core asset, £55K wage.
- Olivier Boscagli: 37th of 64 as a centre-back (54th). Weak aerially.
- Maxim De Cuyper: **5th of 51** defensive full-backs (27th); 16th of 51 as
  an attacking wing-back. He defends by reading and pressing (interceptions 87th
  percentile, possession won 89th, headers won 92nd), not tackling (tackles won 20th,
  tackle % 11th). He progresses the ball (progressive passes 97th) but creates little
  (xA 22nd). Attributes (Anticipation, Positioning, Marking 11) don't explain
  his output: back it, but check it holds next season.
- Ferdi Kadıoğlu: 19th of 51 as an attacking wing-back, 37th of 51 defensively. The
  creator of the pair (xA 78th percentile, crosses 83rd).
