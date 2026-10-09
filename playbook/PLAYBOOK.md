# The Manager's Playbook

How this manager runs a club. Every capability implements a section here, and the numbers live in
`playbook/policy.json`. Read this first; when a rule is unclear, follow the intent of the section.
Rules marked ❓ are drafts waiting for the user's decision.

## 1. Objective
- Compete **and** make transfer profit: buy output the market underprices, sell what it
  overprices. Over about 3 seasons, finish higher than the season before the manager took over
  (claude-2 baseline: 9th, 55 points), with a positive net transfer balance.
- ❓ When they conflict, which wins: league position or profit? Draft: **position first**. Never
  weaken the XI for money; profit comes from fringe players and from selling at the right time.
- ❓ Budget use per window. Draft: spend what the needs require, keep **≥ 20%** in reserve for
  injuries and January.

## 2. Squad shape
- **Lean squad:** about **two players per position**, plus a few versatile players, so each
  position has **three** options. Don't sign beyond that.
- A position with three or more specialists has a sell candidate. Selling must never leave a
  position below two.
- Registration: the assistant picks the 25. Check that new signings are in it.
- ❓ Youth: draft keeps under-21s with high potential (PA ≥ 140) and loans out those who won't
  play; youth doesn't count toward the two per position.

## 3. Valuation: what a player is worth to *us*
Our value is not the game's value. It starts from the market range and is adjusted for what the
player does for this team.
- **Anchor:** the game's value range for him [v_low, v_high]. That's what the market will pay.
- **Adjustments** (`value` capability):
  - his importance to us (output rank in his role and whether he starts)
  - age (resale curve)
  - contract length (expiring contracts lose value)
  - the **cost of replacing his output** (the cheapest market player who matches it)
- Result: a **minimum** (we won't sell below it), a **target** (we counter towards it), and
  **keep** (he's worth more to us than the market pays).
- ❓ Age curve: draft adds value for ages 21–24 (resale upside), is neutral at 25–28, and
  discounts 29+ (decline). Is that how you see it?
- ❓ Replacement cost: draft floors starters at the cost of their cheapest like-for-like
  replacement. Agree?

## 4. Selling
- **We don't transfer-list players.** We wait for bids and judge each one with the `value`
  capability.
- **Protected players are not for sale:** the squad's **Influential players and above**
  (Squad → Dynamics) and **key starters**.
  - ❓ Draft adds an exception for a bid of **2× his top value or more**. Do you want one?
- Add-ons count as part of the fee (they are usually hit).
- Accept a bid when its total (incl. add-ons) is at or above our minimum; counter towards the
  target; reject lowballs. Up to 3 counters.
- A loan with an **obligation** to buy is a sale. A loan with an **option** to buy is a loan:
  accept it when he's surplus and the wage relief is real.
- ❓ Players aged 30+ on big wages: draft treats them as sellable at the bottom of the range
  even if they're useful, because their value only falls. Agree?

## 5. Buying
- **Needs first:** buy only for a position that is below two (or three with cover), or where a
  starter is clearly weak.
- **Targets:** strong output in their own league (rank) **and** a minimum attribute level against
  our league (PL-readiness).
  - ❓ Draft minimum: the **40th percentile** of PL attributes for a starter, none for depth.
- ❓ Age: draft prefers **21–26** (resale); 27+ only on low fees (≤ £10M).
- Price: open at 0.9× the bottom of his range and walk away above 1.1× the top (or a lower max
  we set). A flat "the offer is unacceptable" means walk away.
- Wages: up to **1.3× our first-team median** (top 25 earners). Above that, skip the target.
- Contracts are negotiated by staff (Director of Football).

## 6. Contracts
- Renew starters and good-value rotation players before they expire; let declining or surplus
  players go.
- ❓ Length by age: draft gives ≤ 25 up to 5 years, 26–29 up to 3, 30+ 1 year only.
- Wage cap as for buying.

## 7. Team selection
- The XI is the best output per position in our formation, with new signings starting (they were
  bought to play).
- On holiday, "Use team selection where possible" is **ticked**, so this XI plays. Watch injuries.
- ❓ Tactics: draft keeps the current shape (4-2-3-1 Gegenpress) unless the squad clearly doesn't
  fit it. Do you want the manager to change formation?

## 8. Matches, conversations, admin
- We are "on holiday" during the season: the assistant runs matches, press and player
  conversations. One-off manager decisions (captaincy, friendlies…) are settled by going on holiday.
- Invitations (friendlies, youth leagues) are accepted.

## 9. Learning
- After every window and every season, the manager writes what worked, what didn't, and what to
  do differently to its **notebook** (`local/notebook/<save>.md`), and reads it before the next one.
  Lessons the user confirms move into this playbook.
