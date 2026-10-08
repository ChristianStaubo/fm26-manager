---
name: fm-transfers
description: Sell, buy and renew players in FM26 — transfer-list with an asking price, bid for targets, answer bids for our players, agent payoffs, DoF contract renewals. Use for any transfer action or when the autopilot stops on a transfer screen.
---

# Transfers

Read first: `tasks/transfers/README.md` (flows, screens, quirks) and `tasks/transfers/rules.json`
(the numbers). Operating basics: skill **fm-operate**. Every action is logged to
`local/runs/decisions.jsonl`.

## Commands
```bash
node cli/fm.mjs sell "Kevin Schade" --club Brentford                 # list, asking Unspecified; records our minimum
node cli/fm.mjs prices                                               # price book: listed players, minimum, target
node cli/fm.mjs sell "Thiago" --club Brentford --price 63m           # re-price a player listed before (sticky price)
node cli/fm.mjs buy "Marius Broholm" --club "LOSC Lille" --max 17m   # negotiate now (Suggest Terms) up to £17M
node cli/fm.mjs offers                                               # bids in progress + budget impact
node cli/fm.mjs deal "Jayden Meghoma"                               # one deal: other club, stage, fee, actions
node cli/fm.mjs renew "Rico Henry" --club Brentford                  # Director of Football negotiates
```
Add `--dry-run` to fill everything in and cancel — do this the first time on a new screen.
Clubs are as shown in the game ("LOSC Lille", "Sheffield United").

## Decisions
- **Listing** (`fm sell`): reads his live value range, prices him with the analysis (our
  **minimum** and **target**), records both in the price book and lists him with asking price
  **Unspecified** (user rule). It refuses with "Keep <name>" when our minimum is above the top of
  his value (worth more to us than the market pays) and on depth blockers; `--min N` / `--force`
  override after you have decided. Players listed before keep their old asking price: `--price`.
- **Bids for price-book players** are decided in `fm run` against our minimum: accept at or
  above it, counter towards the target (max 3), reject below it once counters are spent. No stop.
- **Other bids** follow rules.json (counter 1.2 ×, accept ≥ 1.05 ×, reject lowballs, max 3
  counters). They stop for you on key players, valuations ≥ £20M, unreadable offers. Then decide with skill **fm-moneyball** (importance, depth, replacement):
  - accept/reject: `fm click "Accept Offer"` / `fm click "Reject Offer"` on the offer detail page
    (open it with `fm click "View Offer"` from the message);
  - counter: set the up-front fee, then `fm click "Negotiate Offer"`. Use the fee helper from
    code: `import {setFee} from './ui/index.mjs'; await setFee('Fee', 58e6)`.
- **Agent payoffs**: always settle (70% counter, accept up to the ask) — automatic.
- **Buying**: always your decision (rules.json `escalate.any_purchase`). Set a walk-away maximum
  first (fee value incl. half of add-ons; check wages and budget with `fm offers`). `fm buy … --max`
  negotiates in one sitting with Suggest Terms: it opens at 0.9 × the value floor, raises 10% per
  round, accepts the club's demand if it fits, and withdraws if not. Outcome: `agreed`,
  `accepted-demands` or `walked-away`.
- **Contracts**: staff negotiate. Start renewals with `fm renew`; players expiring on 30 June
  must be renewed before then.

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
