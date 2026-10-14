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
- **Listing:** players below *Highly Influential* in the squad hierarchy (Influential and lower)
  can be listed and sold freely when the numbers say so (overvalued, underperforming, surplus,
  costing us).
- **Highly Influential and Team Leaders** (Squad → Dynamics, `fm dynamics`): moving them upsets
  the squad.
  - **At most one per window**, and only when he's **really costing us** (wages against output,
    clear decline), not just slightly overvalued.
- Players **aged 30+ on big wages** are sellable at the bottom of their range: their value only falls.
- **Sell high on luck:** a 26+ attacker who scored 3+ goals above his xG had a lucky season; his value peaks now and his finishing will regress (`fm squad` flags him).
- Add-ons count as part of the fee (they are usually hit).
- Accept a bid when its total (incl. add-ons) is at or above our minimum; counter towards the
  target; reject lowballs. Up to 3 counters.
- A loan with an **obligation** to buy is a sale. A loan with an **option** to buy is a loan:
  accept it when he's surplus and the wage relief is real.
- Never sell without knowing who replaces him (already in the squad, or a target we can afford).

- **Youth-squad deals are delegated** (user, 2026-10-15): offers and loans for players registered in
  our U21/U18 squads are handled by the staff member the user set in the game; we don't propose or act
  on them (Chase Sullivan's two loan offers, 2030-07).

## 5. Buying
- **First season of a new save: no signings** (user, 2026-10-10), except to keep a position at two
  or free/expiring players who clearly beat our starter. Collect a season of data on our own squad
  first; judge, then buy. (Last time 12 signings in one window broke the team.)
- **Needs first:** buy for a position that is short (below two) or where a starter is
  underperforming. The signing must be **at least as good** as the player he replaces.
- **Targets:**
  - strong output in their own league (rank)
  - judged only as a **regular starter**: 60% of the minutes his league's data window allows (the export holds ~the last 20 league games for other clubs). Smaller samples are noise (the 2027 signings were bought on ~11 apps and regressed). Rank attackers on xG/xA, not goals; a keeper's goals prevented needs more than one season
  - for players meant to **start**, attributes at least the **40th percentile** of our league
    (PL-readiness)
  - **personality**: skip inconsistent players and big-match flops (scout report traits)
  - starters must be proven at a comparable level; a lower-league star is a risk worth taking only as a backup
  - **any age**: value per pound is what counts (younger = resale)
- **Ask the agent before bidding** (user, 2026-10-14): his fee range replaces the scouted range.
  A player who **just signed a new contract** won't join: skip him for at least a season and find
  another (`fm plan` marks them `just_signed`: a contract running ~5 seasons).
- **Release clause:** if the offer screen shows one within our max, pay exactly it with no add-ons
  or clauses; nothing to negotiate (user, 2026-10-14).
- **No sell-on clauses** on players we buy: we buy young to sell on. Remove them from counters;
  keep countering if a club insists (user, 2026-10-14).
- Price: open at FM's value (the middle of his range; bids far below it are flatly rejected) and walk away above 1.1× the top (or a lower max).
  A flat "the offer is unacceptable" means walk away.
- Wages are **not a filter** for quality signings (user, 2026-10-10): pay what a better player costs, within the club's **wage budget** (`fm offers`: payroll available). Personal terms stop only above 2.5× our first-team median (a runaway demand). A swap that lowers the bill is always fine.

## 6. Contracts
- The **Director of Football negotiates**. We decide who and for how long.
- Length:
  - **up to 5 years** for most players
  - **29: 3–4 years**
  - **30+: 2 years at most**
- Renew starters and good-value rotation players before they expire; let declining or surplus
  players go.

- **Personal terms** (user's recorded sessions, 2026-10-15): open **~10% under his demand** (at least
  8 ticks, at most 15%), then read his counter: firm → 1 tick under it, flexible → 2; then take it.
  Bonuses, clauses and length untouched. **Promises: always try one lower** than he asked (user): the
  "(Recommended)" option when lower, else the next one down (Fresneda: Regular Starter). Fresneda £87K → £79K, accepted at once;
  Lawrence £73K → £60K → counter £66K → £64K.
- *Next (user, 2026-10-14, not automated yet):*
  - on the **promises** screen, try one step lower on playing time than asked (e.g. "Important
    Player" → "Regular Starter") before accepting their demand;
  - a **minimum fee release clause** caps our resale profit: if we must include one, try to raise
    it; leave it when the agent has locked it (Ortega, £82M, 2030-07).

- **Renewals** (user, 2026-10-15): a contracted player is a sellable asset; a final-year player is
  an asset losing value. Look **two seasons ahead** every window: regulars and players worth £5M+
  with ≤ 2 years left get a decision while there is leverage. **The renewal test:** renew when his
  transfer value ≥ **1.5×** what renewing costs (wage rise × 52 × years + loyalty bonus + agent
  fee), even above the wage cap; slightly higher wages are fine because he stays sellable. Else
  **sell this window** (worth £2M+), or **let him run down** (cheap, or 30+ and fringe). A player
  who refuses to talk is sold. A high earner asking a big rise is a sale, not a renewal (Brown, £155K
  asking £160-195K, 2030-07: "good, valued high, but we can replace"). We negotiate renewals ourselves (`fm renew`), never below 3 ticks
  under his demand, lowering bonuses only to the board's allowance.

## 7. Team selection
- **Keep the current tactic** (ours: 4-2-3-1 Gegenpress, `config/tactic.json`). Buy and select for it.
- The XI is the best output per position in that shape, and **new signings start** (they were
  bought to play).
- On holiday, "Use team selection where possible" is **unticked** for 2028/29 (user, 2026-10-10): the assistant picks the XI. (2027/28 had it ticked.)

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

## 10. Autonomy: what the manager does alone
- Each capability either acts on its own or needs the user's sign-off per action and price
  (`policy.json` `autonomy`). It starts on approval and is promoted to auto once its tests pass
  consistently: the agent earns autonomy one capability at a time.
- Now (user, 2026-10-14): **buying, selling and taking bids need approval**; contracts, agent
  payoffs, the season (Continue, holiday, popups), scouting and the XI run alone. Rejecting a bid
  stays automatic.
- An approval is one player, one action and a price: buy up to a maximum, sell from a minimum.
  The manager proposes (`fm buy … --dry-run` prices it); the user approves in chat; the main
  session records it (`fm approve`). The tools refuse anything outside it.
