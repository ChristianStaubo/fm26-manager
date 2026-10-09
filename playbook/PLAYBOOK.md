# The Manager's Playbook

How this manager runs a club. Every capability implements a section here; the numbers live in
`playbook/policy.json`. Read this first; when a case isn't covered, follow the section's intent.
These are the user's rules (decided 2026-10-09).

## 1. Objective: get better and get richer, never worse
- The goal is a **better team for less money**: buy players the market undervalues who are
  **at least as good** as the player they replace, and sell players who are underperforming
  or overvalued.
- **Every move must leave the XI at least as good.** Selling a weak performer is fine; selling and
  ending up worse is not.
  - The model case is Damsgaard (sold for good money, replaced by a player as good or better
    who cost less).
- Spend the budget when it improves the squad. There's **no reserve**, but **no spending for its
  own sake**: we're here to make money too.
- Baseline (claude-2): 2025/26 finished **9th, 55 points**. Over ~3 seasons, finish higher than
  that with a positive transfer balance.

## 2. Squad shape
- **Lean squad:** about **two players per position**, plus a few versatile players, so each
  position has **three** options. Don't sign beyond that.
- A position with three or more specialists has a sell candidate. A sale must never leave a
  position below two (unless the replacement is already signed).
- Registration: the assistant picks the 25. Check that new signings are in it.
- **Youth (under 21):** keep the high-potential ones; loan out those who won't play; sell the
  rest when bids come.

## 3. Valuation: what a player is worth to *us*
- **Trust FM's valuation** as the anchor: the game's value range [v_low, v_high] is what the
  market pays.
- Adjust for us:
  - our own **young players are worth slightly more** (resale)
  - a **starter is never worth less than the cost of replacing his output** (the cheapest market
    player who matches it)
  - expiring contracts lose value
- Result: a **minimum** (we won't sell below it), a **target** (we counter towards it), and
  **keep** (he's worth more to us than the market pays).

## 4. Selling
- **Anyone is for sale** at the right price, including through a transfer listing.
- **Listing:** players below *Influential* in the squad hierarchy can be listed freely when the
  numbers say so (overvalued, underperforming, surplus, costing us).
- **Influential and above** (Squad → Dynamics): moving them upsets the squad.
  - **At most one per window**, and only when he's **really costing us** (wages against output,
    clear decline), not just slightly overvalued.
- Players **aged 30+ on big wages** are sellable at the bottom of their range: their value only falls.
- Add-ons count as part of the fee (they are usually hit).
- Accept a bid when its total (incl. add-ons) is at or above our minimum; counter towards the
  target; reject lowballs. Up to 3 counters.
- A loan with an **obligation** to buy is a sale. A loan with an **option** to buy is a loan:
  accept it when he's surplus and the wage relief is real.
- Never sell without knowing who replaces him (already in the squad, or a target we can afford).

## 5. Buying
- **Needs first:** buy for a position that is short (below two) or where a starter is
  underperforming. The signing must be **at least as good** as the player he replaces.
- **Targets:**
  - strong output in their own league (rank)
  - for players meant to **start**, attributes at least the **40th percentile** of our league
    (PL-readiness)
  - **any age**: value per pound is what counts
- Price: open at 0.9× the bottom of his range and walk away above 1.1× the top (or a lower max).
  A flat "the offer is unacceptable" means walk away.
- Wages: up to **1.3× our first-team median** (top 25 earners). Above that, skip the target.

## 6. Contracts
- The **Director of Football negotiates**. We decide who and for how long.
- Length:
  - **up to 5 years** for most players
  - **29: 3–4 years**
  - **30+: 2 years at most**
- Renew starters and good-value rotation players before they expire; let declining or surplus
  players go.

## 7. Team selection
- **Keep the current tactic** (4-2-3-1 Gegenpress). Buy and select for it.
- The XI is the best output per position in that shape, and **new signings start** (they were
  bought to play).
- On holiday, "Use team selection where possible" is **ticked**, so this XI plays. Watch injuries.

## 8. Matches, conversations, admin
- During the season we are "on holiday": the assistant runs matches, press and player
  conversations.
- One-off manager decisions (captaincy, friendlies…) are settled by going on holiday.
- Invitations (friendlies, youth leagues) are accepted.

## 9. Learning
- After every window and every season, the manager writes to its **notebook**
  (`local/notebook/<save>.md`): what worked, what didn't, and what to do differently. It reads the
  notebook before the next window or season.
- Lessons the user confirms move into this playbook.
