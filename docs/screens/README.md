# Screen map

How to reach each FM26 screen, what is on it, and which `fm` command handles it. This is the
agent's map of the game (the "Feature Map"). Keep entries short. Every entry is either
**verified** (seen live, with a date) or **todo** (not mapped yet: a player that needs it should
`fm stuck`, and the fixer maps it).

When a fix teaches us a screen, add or update its row here in the same commit.

## Always available
| Thing | Where | Notes |
|---|---|---|
| Continue | button named `continue-button`, top right | label changes: "Continue", "Response Required", "Review Transfer Offer"… pressing it opens the pending task |
| Date | button labelled `M/D/YYYY …`, top right | clicking it opens the **Portal** |
| Global search | `fm click Search` (from Portal) | results depend on the page: search from the Portal (`openPlayer` does) |

## Screens
| Screen | Route | Handled by | Status |
|---|---|---|---|
| Portal | date button, or `fm click Portal` | `goTo('Portal')` | verified 2026-10 |
| Player profile | Portal → Search → name → result row | `fm player "<name>" --club <club>` | verified 2026-10 |
| Transfer arranged | profile header: text "Transfer arranged" then "Joining <club> on M/D/YYYY" (an agreed pre-contract or deal; Luiz, 2036-06-04). The save export can't tell it from a pending offer | `profileFacts().arranged`; `fm player` records ours in `local/runs/arranged.json`; `fm buy`/`fm precontract` stop on it | verified 2036-06-04 |
| Player Actions menu | profile → `Actions` menu → hover submenus | `actionPath([...])`, `fm player` peeks `Transfer` | verified 2026-10 |
| Set transfer status / asking price | profile → Actions → Transfer → Set Transfer Status | `fm sell` | verified 2026-10 |
| Make offer / negotiation | profile → Actions → Make An Offer (top level, or under Transfer) | `fm buy` | verified 2026-10 |
| Ask agent for availability | profile → Actions → **Ask Agent About Availability** (top level) → Quick Chat on the profile ("<agent> / <Player>'s agent / What can I do for you?", four answers from "very keen" to "on our radar"): pick the **2nd option**, then the **2nd option again** (the agent sometimes lowers his demands) → his answer gives the fee range the club will probably accept and the wage he wants. **One-time per player**: once asked, the option is gone from his Actions menu (Ortega, 2030-07-14). Do it before `fm buy`, and set `--open/--max` from the answer | `fm ask`, and `fm buy` before every bid (`capabilities/buy/ask.mjs`). Reply: "he doesn't want to join … only just signed a new contract" → no bid; "<Club> will want somewhere between £26M and £31M" → the profile's range updates to it | verified 2026-10-14 (Banks) |
| Move between squads | profile → Actions → Squad → **Move To Senior Squad** / Move To U18 Squad (also: Available For Under 21s…) | `fm move "<name>" --club <club> [--to senior\|u18]` | verified 2030-07-17 (Eyestone) |
| Payroll vs transfer budget | Recruitment → Recruitment Budgets → **Adjust Transfer and Payroll Budget** → "Budget Adjustment" dialog with a slider (payroll £/wk ↔ transfer £; £2.33M→£2.81M/wk cost £25M) | none yet (slider not mapped); contract talks stop on "Exceeds board's max allowance" | seen 2030-07-17 (user's mapping session, `local/runs/watch-contract-mapping.jsonl`) |
| Contract renewal (DoF) | profile → Actions → Contract → DoF To Negotiate Contract → dialog "DOF to negotiate contract?" Yes | `fm renew` | verified 2026-10 |
| Transfer activity (our bids) | Recruitment → Transfer Activity | `fm offers` | verified 2026-10 |
| Calendar → Go On Vacation | date button → Portal → Calendar → Go On Vacation | `fm holiday` | verified 2026-10 |
| League table | Portal → Stages | none (read with `fm screen`) | verified 2026-10 (route only) |
| Squad list | todo | none | todo |
| Finances | todo | none | todo |
| Scouting / shortlist | todo | none | todo |
| Board expectations ("Response Required") | Continue slot | none: keep defaults, Confirm (`game/screens/admin/README.md`) | verified 2026-10 |
| Squad registration (league; Champions League latter stages) | Continue slot → Respond | `squad-registration`: Ask Assistant to Pick, add depth players left out, Confirm ×2 | verified 2035-09-04 (UCL, mapped with the user) |
| Press conference | Portal → Messages → announcing message → its **Attend Press Conference** (not the Continue slot) → Press Room → Start Press Conference → answers → Leave Press Conference (Continue slot) | `fm press`, `fm run` | verified 2026-06-17 |
| Inbox message list | Portal → Messages; items are `NewsItemButton`s labelled "<sender> <time> <subject>"; an open message lists its item twice (`fm click` takes the first) | `fm click "<label>"` | verified 2026-06-25 |
| Transfer Activity deal list | Recruitment → Transfer Activity; deals are **toggles** "<Player> <Stage>" (select with a toggle, not a click); details pane on the right (value, wage, Accept/Stall/Reject Offer or Cancel Offer) | `fm offers` (list), `fm deal "<player>"` (club + stage + fee in the middle pane, e.g. "Aston Villa / Contract £7M (£13M)") | verified 2026-06-26 |

## Routine NeedAction screens (autopilot handlers)
See `game/screens/admin/README.md`, `transfers.md`, `contracts.md` and `season.md` in this folder. Each
handler's match is a stable button label; screens with no handler stop `fm run` with
`needs-analyst`.

## Dialogs answered automatically
`KNOWN_DIALOGS` in `game/ui/overlays.mjs`. Unknown dialogs stop: read with `fm overlays`.
