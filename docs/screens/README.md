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
| Player Actions menu | profile → `Actions` menu → hover submenus | `actionPath([...])`, `fm player` peeks `Transfer` | verified 2026-10 |
| Set transfer status / asking price | profile → Actions → Transfer → Set Transfer Status | `fm sell` | verified 2026-10 |
| Make offer / negotiation | profile → Actions → Make An Offer (top level, or under Transfer) | `fm buy` | verified 2026-10 |
| Contract renewal (DoF) | profile → Actions → Contract → DoF To Negotiate Contract → dialog "DOF to negotiate contract?" Yes | `fm renew` | verified 2026-10 |
| Transfer activity (our bids) | Recruitment → Transfer Activity | `fm offers` | verified 2026-10 |
| Calendar → Go On Vacation | date button → Portal → Calendar → Go On Vacation | `fm holiday` | verified 2026-10 |
| League table | Portal → Stages | none (read with `fm screen`) | verified 2026-10 (route only) |
| Squad list | todo | none | todo |
| Finances | todo | none | todo |
| Scouting / shortlist | todo | none | todo |
| Board expectations ("Response Required") | Continue slot | none: keep defaults, Confirm (`tasks/admin/README.md`) | verified 2026-10 |
| Squad registration | Continue slot | none: use recommended | seen 2026-10 |
| Press conference | Portal → Messages → announcing message → its **Attend Press Conference** (not the Continue slot) → Press Room → Start Press Conference → answers → Leave Press Conference (Continue slot) | `fm press`, `fm run` | verified 2026-06-17 |
| Inbox message list | Portal → Messages; items are `NewsItemButton`s labelled "<sender> <time> <subject>" (can appear twice: `fm click` refuses duplicates) | none | verified 2026-06-17 |

## Routine NeedAction screens (autopilot handlers)
See `tasks/admin/README.md`, `tasks/transfers/README.md`, `tasks/contracts/README.md`. Each
handler's match is a stable button label; screens with no handler stop `fm run` with
`needs-analyst`.

## Dialogs answered automatically
`KNOWN_DIALOGS` in `ui/overlays.mjs`. Unknown dialogs stop: read with `fm overlays`.
