# buy: negotiate a signing (playbook §5)
**Interface:** `fm buy "<name>" --club "<club>" [--open N] [--max N] [--dry-run]`.
**How:**
- opens at 0.9× the bottom of his range and walks away above the max (1.1× the top by default)
- the max is compared on the total, incl. add-ons and pre-filled extras from an earlier negotiation
- a flat "the offer is unacceptable" means walk away
- personal terms are handled by staff, or by `contracts/personal-terms.mjs` within the wage cap
**Never:** chooses targets (that's `scout` plus the manager), and never finalizes above max.
## When the club accepts our bid
NeedAction "Response Required" with "Enter Contract Negotiations" / "Walk Away". Enter, then
the agent screens: "Finalize Promises" → "Negotiate Contract" → (adjust wage with ±) →
"Suggest Terms"/"Finalize Deal" → "Exit Talks". Later "Confirm Transfer" is delegated to the GM
by the autopilot. Keep wages inside the plan; watch "Salary Available".

## Known quirks (see docs/ui-notes.md)
- Fee boxes ignore typed numbers on some screens: tools use presets + ± (never type fees).
- Asking prices land on the step grid (£1M steps at £60M).
- Search may show only Messages at first — handled by retyping.
- Two "Accept Payoff" buttons: the negotiation panel's (`--name StandardButton`) accepts the
  negotiated amount.
- Big counters on lowball bids lose the buyer; the rules reject lowballs instead.
