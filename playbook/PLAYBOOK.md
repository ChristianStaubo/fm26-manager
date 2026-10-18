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

## 1b. The season cycle (user, 2026-10-15; as code 2031-05-28)
The order of steps lives in **`playbook/cycle.json`** and runs as code: `fm cycle` holidays to the next
checkpoint and runs every step, writing one report (`local/reports/checkpoints/`). Decide from the
report. Checkpoints: **january** (01-02), **newgen** (05-01), **season_end** (05-28), **summer** (07-02).
The rules behind them:
- **Free agents first** (user, 2031-05-28): a free player, or one whose contract ends by 30 June
  (pre-contract from January), worth £30M+ on attributes is always a buy: no fee, pure resale.
  January is when they're won; by May they've agreed moves (Mbappé → Monaco, Fortea → Bayern).
  Every one gets an answer: a pre-contract/bid, or a recorded pass (the judge asks).
- **Contracts ending in June:** ours: renew or sell (renewal test), never let value walk out free.
- **Summer window:** after the rollover (full-season stats). Lenses: wonderkid/growth for the
  business, moneyball for starters we need now; agent chat first; the split for contracts;
  renewals two seasons ahead; registration (assistant assigns); `fm save` before deadline day.
  Listed players keep an **Unspecified** asking price (user, 2026-10-15): on holiday the assistant
  only accepts offers matching the asking price, so nothing sells below our floor; bids come to us.
- **Newgens** (95% of intakes land in March-April, measured in our save): home-nation newgens can sign
  now; foreign under-18s are not a route (none would join, 2031-05-28). Buy in the summer.
- **Match days:** holiday only; the assistant picks the team and plays (user, 2031-01-01).

## 2. Squad shape
- **Lean squad:** about **two players per position**, plus a few versatile players, so each
  position has **three** options. Don't sign beyond that.
- A position with three or more specialists has a sell candidate. A sale must never leave a
  position below two (unless the replacement is already signed).
- Registration: the assistant picks the 25. Check that new signings are in it.
- **Youth (under 21):** keep the high-potential ones; loan out those who won't play; sell the
  rest when bids come.

- **Goalkeepers** (user, 2026-10-15): one quality starter and one cheap backup. Never two quality
  keepers (Ortega + Hülsmann + Backhaus: one is paid to sit).

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
- **Never just reject a bid: counter at the price we'd sell for** (user, 2031-07-22). If they say
  no, it's the same as a rejection; if they say yes, we've made a profit, and we're good at
  replacing players. A player who isn't listed sells at our sell price, a multiple of the top of his value (below); a counter or accept at that price is approved
  by this rule. **How much we need him sets the price** (user, 2032-02-02, Güreler): core (a starter,
  or no comparable replacement) 1.5x the top of his value, depth (rotation) 1.2x, surplus (fringe)
  1.0x (raised 2033-06-24, Champions League); a rising player (23 or under) 1.1x more; anyone our
  analysis would keep never below his minimum (Gallardo sold at his value, £56M; the user's estimate
  was £70-75M: FM's value is a reference, it follows contract length and wages); never below what we paid unless he's 30+ or in his last year; selling a core player means
  buying a replacement, depth doesn't. **All prices are totals, add-ons included**: a counter asks
  for our total minus the add-ons they offer. **Listed players: get the most we can** (user, 2032-01-04, Fresneda went at his
  minimum to the first bid): accept outright only at the target (top of his value, add-ons
  included); counter negotiable bids at 1.3x his value, then the target, then towards the
  minimum; turn down non-negotiable bids below the target (more come) until the window's last
  week, then take anything at the minimum. Non-negotiable bids can't be countered (the fee box is
  locked). Reject only once 3 counters are spent. Counters go through **Suggest Terms**.
- A loan with an **obligation** to buy is a sale. A loan with an **option** to buy is a loan:
  accept it when he's surplus and the wage relief is real.
- Never sell without knowing who replaces him (already in the squad, or a target we can afford).

- **No sale or loan is delegated to staff** (user, 2026-10-18; replaces the youth-squad delegation of
  2026-10-15). Staff accepted five bids for Awudu (20, PA 180, value £14M) at £6.75-8.5M up front while he
  was in the U21 squad; he was nearly gone to Barcelona. In the game, every sales responsibility (first
  team, U21, U18: initiating, negotiating, finalizing) and youth loan offers are the manager's: offers for
  any squad come to us and the sell matrix and loan table decide. Staff keep only what `policy.json`
  `delegate_to_staff` lists (contract negotiations, finalizing signings, code of conduct, matches).
  A staff bid for a signing nobody approved is withdrawn (Ebertz, 2036-01).

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

### Bidding (user, 2035-06-18)
- **Bid at the season-end checkpoint (28 May), not in July.** FM accepts bids while the window is closed;
  by 2 July Wark, Baldé and Quenda had gone elsewhere. Never advance the game with an open buy list.
- **Don't lowball a player worth far more to us than his price** (wonderkids, bargains, upgrades,
  replacements): open at his asking price or pay the release clause at once.
- **A flat rejection ends that day only:** FM takes a new bid the next day. For those targets, bid the
  asking price the next game day (the autopilot does it).
- **Final year of his contract: open at 0.7x his value** (Yılmaz went for 0.69x); the agent's range runs high.

### Wonderkids (user, 2034-09)
A cycle, not a one-off: buy cheap, develop away, then play or sell.
1. **Buy** (summer buy table): PA >= 175, aged 16-20 (18+ unless British/Irish), <= £15M, up to 4 a
   window, and at most **10 in the portfolio** (prospects <= 23 outside the depth chart).
2. **On arrival:** one at our backup level (squad average - 25 CA) joins the squad; the rest go
   straight on the loan list (approve with `--note "wonderkid"`; the autopilot lists him when he signs).
3. **On loan** while he is a prospect (<= 21, or <= 23 with PA >= 160) and outside the depth chart:
   the loan table decides offers (he must start; never an option to buy).
4. **Promoted** when his CA reaches our backup level: the depth chart takes him as a backup/starter.
5. **Over 23:** a normal player. Not starting → surplus → the sell table sells him.

## 6. Contracts
- The **Director of Football negotiates**. We decide who and for how long.
- Length:
  - **up to 5 years** for most players
  - **29: 3–4 years**
  - **30+: 2 years at most**
- Renew starters and good-value rotation players before they expire; let declining or surplus
  players go.

- **Personal terms: the split** (user's sessions, 2026-10-15). The *raise* is what is negotiated, not
  the demand: open at **current wage + half the raise he asks**, then **halfway between our offer and
  his counter**, then take his counter. Never below his current wage, never above his demand. Fer
  López (£49K, asked £88K) → £69K; Lawrence (£49.5K, asked £73K) → £60K, counter £66K → £64K.
  Without a current wage (unknown): 10% under the demand. Bonuses, clauses and length untouched.
  **Promises: always try one lower** than he asked (the "(Recommended)" option, else the next down).
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
  payoffs, the season (Continue, holiday, popups), scouting and the XI run alone. Countering a bid
  at our sell price (above) is automatic; so is accepting a bid at or above it.
- **Before stopping on a screen** (user, 2026-10-18): a cheap model looks at it first. It may read a fact
  a handler couldn't (the decision tables still decide), or press one safe button (`policy.json`
  `autopilot.fallback.safe_buttons`) on a screen with no money involved; anything about fees, wages,
  contracts or offers stops for us. Each such call is logged for review.
- An approval is one player, one action and a price: buy up to a maximum, sell from a minimum.
  The manager proposes (`fm buy … --dry-run` prices it); the user approves in chat; the main
  session records it (`fm approve`). The tools refuse anything outside it.
