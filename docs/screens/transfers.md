# Transfer screens: selling, buying, offers, loans

How the transfer screens behave and how the `fm` commands drive them. The decisions (what to
accept, counter, bid) live in `capabilities/sell` and `capabilities/buy`, with every number in
`playbook/policy.json`. Every decision is logged to `local/runs/decisions.jsonl`.

## Selling a player: `fm sell "<name>" --club <club> [--price N] [--deter] [--dry-run]`
Profile → Actions → Transfer → **Set Transfer Status** (card dialog) → status dropdown
"Transfer listed" → **Asking Price** box → Confirm. The fee is set with `setFee(mode: 'atMost')`,
so the result is the largest reachable value ≤ the target (£1M steps at ~£60M: £64.8M → £64M).
The other tab, "Loan Status", is not used.

The player's live value range is only visible before he is listed, so `fm sell` reads it first,
records our minimum and target in the price book (`capabilities/value`), then lists him with the
asking price **Unspecified**.

## Buying: `fm buy "<name>" --club <club> [--open N] [--max N] [--dry-run]`
One sitting, with **Suggest Terms** (recorded from a person's clicks, 2026-10-04). Do NOT use
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
   - "the offer … is unacceptable" → flat no: walk away.
3. Make Offer → "An offer has been made for …" → **Exit Talks**. (**Accept Demands** on a club
   counter submits the offer directly: "An offer has been made" → Exit Talks, no Make Offer.) The
   club confirms later (NeedAction): "Enter Contract Negotiations" (personal terms, see
   `contracts.md`).

Costs on screen: "Current Transfer Budget Cost:" (up front) and "Future & Potential Total Cost
with Additional Fees:" (with add-ons). Screens pre-filled by an earlier negotiation keep the old
instalments/add-ons: extras = total − fee, measured on every screen. A stale GM line does not mean
a new reply while Suggest Terms shows.

## Replies to our bids (autopilot `bid-response`)
"<Club> respond to <Player> offer" — "<Club> want £X for <Player>" — Accept / Withdraw / View
Offer. View Offer opens the negotiation screen already in the countered state (Accept Demands /
Make Offer / Withdraw Offer, plus Transfer Value).

## Incoming offers (autopilot)
NeedAction "Review Transfer Offer": message with Accept / Reject / View Offer. The handler opens
View Offer, reads Negotiable (a **dropdown** labelled "Negotiable", not a text), fee, guaranteed
total ("Fee:"), Transfer Value, contract expiry, and the coach report (key player?), decides with
`decideSale`, then Accept Offer / Reject Offer, or counters in one sitting, as when buying (the
user, Villa for Doak, 2031-06-17):
1. Set the up-front Fee → **Suggest Terms** (NOT Negotiate Offer: that sends a counter the club
   answers days later, and the deal sits at "Negotiated").
2. The GM line answers on the spot: "<club> feel the negotiation for <player> is acceptable." with
   **Accept Offer** / Reject Offer → Accept Offer → the deal moves to "Contract £40M (£52M)".
   Other answers aren't mapped yet: the handler logs them and stops.
Answer one now (no Continue): `fm answer "<player>" [--club C]`. Rounds: `fm negotiations`.

A listed player's offer page shows **one amount** under Transfer Value (his asking price), not a
range. `readOffer` treats it as `[v, v]` (`valueSingle: true`).

## Agent payoff (autopilot)
"<Player> demands compensation for <Club> deal": Accept Payoff / Negotiate / Reject Payoff →
Negotiate → Compensation box (presets + ±; **typed values become £0 here**) → Suggest Terms →
"I believe a payoff of £X is suitable" → Accept Payoff (**the StandardButton one**). Selling a
player can trigger a payoff demand a day later.

## Loan approaches for our players (`loan-offer`, `loan-offer-page`)
Message "<Club> make loan approach for <Player>": Fee, Duration, Playing/Unused Monthly Fee,
salary percentages and Agreed Playing Time as text; Accept / Reject / View Offer. `readLoan`
parses them. View Offer opens a page with "Loan-to-buy Fees", "Mandatory Future Fee" and "Overall
Cost if deal becomes permanent (Including Monthly Contributions)". A mandatory future fee makes it
a sale (`decideLoan`); option-only loans stop for a decision.

## Quirks
- Name search sometimes shows only Messages at first: retype (handled).
- The status dropdown may already show "Transfer listed" (re-listing just changes the price).
- **Asking prices are sticky.** Once a player has had one, delisting and listing again shows the
  old price, the presets never offer "Unspecified", and the profile header keeps showing it
  while he is not listed. Pass `--price` when re-pricing a player who was listed before.
- A listed player's profile header shows his asking price (one amount) where the value range
  was; the dialog's status tells them apart.
- Some players have no "Set Transfer Status" entry: Transfer → **Transfer Status** submenu with
  the entries greyed out = status locked. `fm sell` reports `locked: true`.
- Transfer → **Transfer Offer Options** sets automatic offer handling per player. Not used.
- **An offer screen left open counts as an offer**: leaving Make An Offer without pressing Make
  Offer still registered a bid at the pre-filled fee. Never abandon an offer screen; verify with
  `fm offers` afterwards.
- Once a bid is pending, "Make An Offer" disappears from Actions and Transfer → "Withdraw
  Transfer Offer" appears, so duplicate bids are impossible by accident. `fm buy` checks that
  entry instead of the varying confirmation text.
- `fm offers` (Recruitment → Transfer Activity) is the source of truth for bids in progress and
  the budget impact.
- Fee boxes ignore typed numbers on some screens: the tools use presets + ± (see `../ui-notes.md`).
