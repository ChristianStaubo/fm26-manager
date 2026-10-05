# Analyzing goalkeepers

How we judge whether a goalkeeper is good, and whether he is worth his price.
Findings come from the Brighton-2 save (2025/26 season, checked in-game on
17 June 2026). Re-test them as more seasons are played.

## Summary

| Use | Metric |
|---|---|
| Main performance metric | **Goals prevented per 90 (shots on target)**, shrunk for sample size |
| Cross-check / what the game shows | The game's **xGP per 90** |
| Skill signal that isn't noisy | Shot-stopping attribute score |
| Context, not blamed on the keeper | Team xG faced per 90 |
| Moneyball | Goals prevented per 90 against transfer value and wage |

Judge a keeper on all of these together. A keeper is clearly good or bad only
when the performance metric and the attributes agree.

## The two goals-prevented metrics

### The game's xGP

`xGP = xG of every shot faced - goals conceded`

Shown in-game as xGP and xGP/90. The export's `xgp` matches the game exactly:
Verbruggen's -10.08 and -0.30 per 90.

**Weakness:** it includes shots that miss the target. When a striker blazes a
big chance over the bar, the keeper's xGP goes up though he never touched the
ball. Over one season that is mostly the opposition's finishing luck. Keep it
as a cross-check and because it is what the game and other players quote. Don't
rank keepers by it alone.

### Our metric: goals prevented from shots on target

Only shots the keeper has to deal with count. Each is worth the league's
average chance of going in.

```
expected conceded = shots on target faced x league goals per shot on target
goals prevented   = expected conceded - goals conceded
per 90            = goals prevented / minutes x 90
```

Premier League 2025/26 rate: **22.8%** of shots on target became goals.
Compute the rate per competition, because leagues differ a lot (Ligue 1 is
about 9.5%).

Worked example, Verbruggen 2025/26: 210 shots on target faced, 46.9 expected,
63 conceded, so **-16.1 (-0.47 per 90)**. Raya: -7.8. Henderson: +5.4.

**Weakness:** every shot on target counts the same, whether it's a tap-in or a
30-yard scuff. Keepers who face many shots on target per match get easier ones
on average, so this metric flatters them. Correct for it by comparing each
keeper with keepers in the **same league** who face a similar number of shots
on target per 90. Show the raw and corrected values side by side.

### How the metrics were tested

There were 73 keepers with 20 or more matches. Each metric was tested three
ways:
- **Stable?** Split each keeper's matches into two random halves; does the
  metric agree between the halves?
- **Biased by team quality?** Does it correlate with the team's xG faced?
- **Does it measure skill?** Does it correlate with shot-stopping attributes?

| Metric | Stable between halves | Biased by team | Correlation with shot-stopping attributes |
|---|---|---|---|
| Game's xGP | 0.11 | no | -0.10 |
| Save % | 0.21 | no | 0.32 |
| Our goals prevented (raw) | **0.54** | yes, by shots-on-target volume (0.43) | **0.58** |
| Our goals prevented (volume-corrected) | 0.40 | no | 0.45 |

The game's xSv % uses another on-target xG field that adds up to only about
half of goals conceded and differs by competition. **Don't use xSv %.**

## Per 90, and why it isn't enough

Per-90 numbers make keepers with different minutes comparable. They don't fix
small samples: a keeper with one clean sheet in 90 minutes gets an extreme per-90
number. Always shrink toward average according to how much he played:

```
reliability = minutes / (minutes + K)
shrunk per 90 = reliability x observed per 90
```

K is the number of minutes at which the metric is half signal, half noise.
Estimate it from the split-half results:
- Our goals prevented: **K ≈ 1,300 minutes**. A full season (3,420 minutes) keeps about 72% of the value.
- Game's xGP: **K ≈ 12,000 minutes**. A full season keeps only about 22%.

Don't rank keepers with fewer than 900 minutes. Report them as "insufficient
sample" with their attributes.

## Shot-stopping attributes

The attributes that best predicted our goals prevented: **Reflexes, Agility,
Positioning, One on Ones, Handling** (r = 0.32 to 0.43). This mostly agrees
with an external FM study's list: Bravery, Reflexes, Agility, One on Ones. Use
the average of Reflexes, Agility, Positioning, One on Ones, Handling, Aerial
Reach and Bravery as the shot-stopping score until we have enough data to fit
weights.

Vision is close to zero or negative. Keepers with high Vision tend to be
ball-playing keepers who are weaker shot-stoppers. Score distribution separately
(Kicking, Passing, Vision, First Touch, Composure) and count it only if our
tactic plays out from the back.

## Context: team defence

The team's xG faced per 90 is stable (0.51 split-half) and belongs to the
team and tactic, not the keeper. Brighton faced 1.56 xG per match in 2025/26;
Liverpool faced 0.97. Report it beside the keeper. Never use raw goals conceded
or clean sheets to judge the keeper.

## Moneyball

The market prices keepers on CA, reputation and age. The edge is in keepers
whose shrunk goals prevented per 90 and shot-stopping score are better than their
transfer value and wage suggest. Sell keepers whose price is high and whose
shot-stopping is poor.

Data caveats:
- Lower-detail leagues lack keeper data for about 39% of matches. Cross-league
  comparison is rough.
- A transfer value of £300M (Alisson, Ortega, Martínez) appears to be a
  not-for-sale placeholder.

## 2025/26 case: Bart Verbruggen

| | Value |
|---|---|
| Our goals prevented | -16.1 (-0.47 per 90); 3rd-worst of 18 PL starters after volume correction |
| Game's xGP | -10.08 (-0.30 per 90) |
| Shot-stopping score | 14.0, bottom third of PL starters |
| Team xG faced | 1.56 per match, among the highest in the league |
| Profile | Ball-playing keeper (best role BGK, Vision 14), age 23, CA 151 / PA 165 |
| Market | Transfer value £48-54M, wage £25K/week |

Output ranks (shrunk goals prevented per 90): Verbruggen **19th of 21** PL keepers
(-0.24/90). Beadle 6th of 25 Championship keepers (+0.08/90). Rushworth 24th of 25.
Steele: 630 minutes, too few to rank. Best cheap PL option on output: Bernd Leno
(3rd, £11.5M, age 34, £90K/week).

**Conclusion:** a below-average shot-stopper valued for his ability, age and
potential. That makes him a Moneyball sell candidate. In-house alternative: James Beadle (21, £6K/week),
whose goals prevented was positive on loan in the Championship. The
evidence is one season, so recommendations must say that.
