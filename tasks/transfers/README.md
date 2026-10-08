# Transfers

Code: `sell.mjs` (transfer-list), `buy.mjs` (bids), `incoming.mjs` (bids for our players and agent
payoffs, used by the autopilot), `decide.mjs` + `rules.json` (the numbers). Log: `local/runs/decisions.jsonl`.

## Rules (rules.json) — the user's negotiation style
- Anchor: the in-game **Transfer Value** range (`v_low`–`v_high`); compare on **guaranteed** money
  (up front + instalments). Add-ons count at 50%.
- **Selling:** never accept a first negotiable offer. Counter at **1.20 × v_high** (and ≥ 10% above
  their offer), then 1.10 ×. Accept a reply ≥ **1.05 × v_high**. Max 3 counters, then accept at/above
  the floor (v_high; 0.8 × v_low if < 12 months left). Lowballs (< 0.5 × v_low) are rejected —
  a big counter on a lowball lost the buyer (Wrexham, 2026-07). Non-negotiable: accept ≥ v_high.
- **Agent payoff** (player demands compensation when sold): always settle — counter at 70% of the
  ask, accept any reply up to the ask.
- **Buying:** open at 0.9 × v_low (0.75 × if the club is keen to sell), raise by 0.1 × v_low, stop
  at 1.1 × v_high unless the analyst set a walk-away maximum.
- **Escalate** (stop for the model): purchases, key players, valuations ≥ £20M, depth problems.
- Revenue for the club is an explicit goal of the experiment.

## Planned change to selling (user, 2026-10-04 — not implemented yet)
**Price book** (user, 2026-10-08): `fm sell` reads the player's live value range (only visible
before he is listed), prices him with `analysis/evaluate_offer.py --price` (importance, cheapest
replacement with his output, contract, age), stores **minimum** and **target** in
`local/runs/price-book.json` (`fm prices`), and lists him with the asking price **Unspecified**.
The bid handler decides against the minimum (see rules.json `_price_book`). Refuses with
"Keep <name>" when our minimum is above the top of his range (McKnight: £24K–£200K, but his
output costs ~£11M to replace). `--price` (asking = that amount) and `--deter` (1.2 × v_high)
are only for re-pricing players listed before (sticky asking prices, below).

## Selling a player — `fm sell "<name>" --club <club> [--price N] [--deter] [--dry-run]`
Profile → Actions → Transfer → **Set Transfer Status** (card dialog) → status dropdown
"Transfer listed" → **Asking Price** box → Confirm. Default price = v_high (`--deter`: 1.2 ×), set with
`setFee(mode: 'atMost')`, so the result is the largest reachable value ≤ the target (£1M steps
at ~£60M: £64.8M → £64M). The other tab, "Loan Status", is not used.

## Buying — `fm buy "<name>" --club <club> [--open N] [--max N] [--dry-run]`
One sitting, with **Suggest Terms** (recorded from the user, Grealish, 2026-10-04). Do NOT use
"Make Offer" first: that sends a bid the club answers days later.
1. Profile → Actions → **Make An Offer** (or Transfer → Make An Offer) → offer screen with the
   fee pre-filled; buttons Make Offer / **Suggest Terms**.
2. Set Fee → **Suggest Terms**. The General Manager line (right panel) says:
   - "… have negotiated the offer …" / "… have responded to the latest offer …" → **counter**:
     the club's demand is written into the form (fee, instalments e.g. "Instalments (6 monthly)",
     "After League Appearances" add-ons). Buttons **Accept Demands** / **Withdraw Offer**; any
     edit (fee ±, remove an add-on with its ✕ button, instalment months dropdown) brings back
     **Suggest Terms** (+ Undo/Revert).
   - "… are prepared to accept the latest offer … Finalize the offer" → **Make Offer**.
3. Make Offer → "An offer has been made for …" → **Exit Talks**. (**Accept Demands** on a club
   counter submits the offer directly: "An offer has been made" → Exit Talks, no Make Offer.) The club confirms later
   (NeedAction): "Enter Contract Negotiations" (personal terms; staff/DoF where possible).
Costs on screen: "Current Transfer Budget Cost:" (up front) and "Future & Potential Total Cost
with Additional Fees:" (with add-ons). `fm buy` compares up front + 50% of add-ons with `--max`
(default 1.1 × top of value), raises by 10% of the value floor per round, accepts the club's
demand when it fits, and withdraws otherwise.

## Replies to our bids (autopilot `bid-response`)
"<Club> respond to <Player> offer" — "<Club> want £X for <Player>" — Accept / Withdraw / View
Offer. View Offer opens the negotiation screen already in the countered state (Accept Demands /
Make Offer / Withdraw Offer, plus Transfer Value). The handler accepts the demand if its value
≤ 1.1 × top of value, else makes one final offer at that maximum, else withdraws.

## Incoming offers (autopilot)
NeedAction "Review Transfer Offer": message with Accept / Reject / View Offer. The handler opens
View Offer, reads Negotiable, fee, guaranteed total ("Fee:"), Transfer Value, contract expiry,
and the coach report (key player?), decides with `decideSale`, then Negotiate Offer (after
setting the up-front fee) / Accept Offer / Reject Offer. Counters per player+club come from the log.

## Agent payoff (autopilot)
"<Player> demands compensation for <Club> deal": Accept Payoff / Negotiate / Reject Payoff →
Negotiate → Compensation box (presets + ±; **typed values become £0 here**) → Suggest Terms →
"I believe a payoff of £X is suitable" → Accept Payoff (**the StandardButton one**).

## Quirks
- Thiago's name search shows only Messages at first: retype (handled).
- The status dropdown may already show "Transfer listed" (re-listing just changes the price).
- A listed player's profile header shows his **asking price** (one amount) where the value range
  was; a single amount can also be an exact valuation. The dialog's status tells them apart.
- Some players have no "Set Transfer Status" entry: Transfer → **Transfer Status** submenu with
  "Transfer listed"/"No status set" greyed out = status locked (Ajer, June 2026: listed at £20M).
  `fm sell` reports `locked: true`; nothing to do.
- Transfer → **Transfer Offer Options** sets per-player automatic offer handling (accept at/above
  asking price, reject below, …). Not used yet; could replace some autopilot work.
- Selling a player can trigger an agent payoff demand a day later; the autopilot handles it.
- **An offer screen left open counts as an offer**: leaving the Make An Offer screen without
  pressing Make Offer still registered a bid at the pre-filled fee (Campbell, 2026-06). Never
  abandon an offer screen; use `--dry-run` only when you mean to send nothing… and verify with
  `fm offers` afterwards.
- Once a bid is pending, "Make An Offer" disappears from Actions; Transfer → "Withdraw Transfer
  Offer" appears (duplicate bids are impossible by accident).
- The confirmation text after Make Offer varies; `fm buy` checks the Withdraw entry instead.
- `fm offers` (Recruitment → Transfer Activity) is the source of truth for bids in progress and
  the potential budget impact.

## Incoming offers: valuation shown as one amount
A listed player's offer page shows **one amount** under Transfer Value (his asking price), not a
range: Thiago (listed) showed "£63M". `readOffer` treats it as `[v, v]` (`valueSingle: true`).
Lowballs (guaranteed < `lowball_reject_below` × v_low) are rejected **before** the big-player
escalation: rejecting never loses a player (Everton £1K for Thiago, 2026-06-25).

## Asking price is sticky (2026-06-25, Kevin Schade)
Once a player has had an asking price, the game keeps it: delisting ("No status set" →
Confirm) and listing again shows the old price, and the Asking Price presets offer only amounts
(£1K … £300M), never "Unspecified". The profile header keeps showing that stored price (not the
value range) even while he is not listed, so `fm sell` without `--price` would take it for his
value: **pass `--price` when re-pricing a player who was listed before.** "Unspecified" is
probably only available to players never listed (not yet verified).

## Loan approaches for our players (`loan-offer`)
Message "<Club> make loan approach for <Player>": Fee, Duration, Playing/Unused Monthly Fee,
salary percentages and Agreed Playing Time as text; Accept / Reject / View Offer. `readLoan`
parses them. **Obligation to buy = a sale** (user rule): summed and decided by `decideLoan`
(needs a price-book entry for the range; otherwise it stops with the numbers). Plain loans and
options-to-buy stop for a decision with the parsed numbers. Not yet seen live: an obligation
clause (the parser looks for a line mentioning "obligat…" with an amount; check it the first time).

## Buying: replies we know (fm buy, 2026-07-13, Ribeiro)
- Counter ("have negotiated the offer" / "responded to the latest offer"): demand written into the
  form; Accept Demands if within max, else raise / one final offer at max.
- Accepted ("prepared to accept" / "is acceptable … Finalize the offer"): Make Offer — never above
  max (on-screen total incl. pre-filled extras).
- **Flat no ("the offer … is unacceptable"): walk away.** No raising or retrying (user rule).
- Pre-filled screens after an earlier negotiation keep old instalments/add-ons: extras = total − fee,
  measured on every screen; the stale GM line does not mean a new reply while Suggest Terms shows.
