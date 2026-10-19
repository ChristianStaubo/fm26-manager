# Workflow map

Every in-game workflow: what it does, how fast it is, how we know it worked, who decides, and what is left.
Measured on claude-3.3 at 2036-06/07, 2026-10-18/19 (a throwaway save: mistakes cost nothing). The bench
(`fm bench`, local/runs/bench.jsonl) re-measures each one; this page is updated from it.

Verification has four checks per workflow (user, 2026-10-19):
- **speed**: a scripted run, timed, screen reads counted (one full read ≈ 0.35-0.55 s).
- **did it happen**: the game state read back after acting, never the command's own output (the stray
  £17.25M Pepper offer and the £0 sales were only caught this way).
- **was the decision right**: a stronger judge model gets the same facts; where it and the rule disagree,
  the guardrail is too tight or the guidance is wrong (Arnalot £123.5M, Finck's £80K line, Pepper's £30K).
- **adversarial**: the awkward inputs (non-negotiable bids, add-on heavy bids, promise prices, sell-ons,
  stale value ranges, £0 offers, rows hidden off screen, the game pulling the view to Messages).

Decision layers: **guardrail** = code, never the model's call; **guidance** = the table's advice, the model
decides in between and writes why; **user** = needs an approval.

| # | Workflow | Command | Time now | Was | Did-it-happen check | Decides | Status / known issues |
|---|---|---|---|---|---|---|---|
| 1 | Read every bid, offer and deal | `fm activity` | **15 s** (9 deals) | 7-13 s per offer (`fm answer --dry-run`) | n/a (read) | — | ✓ fixture test; scrolls both ways; re-opens the tab when pulled to Messages |
| 2 | Accept / reject / stall one offer | `fm activity accept\|reject\|stall` | **2.3 s** | ~10 s + reads | budget impact / deal stage re-read | sale price: guardrail (approval + 2% slack); in-between bids: rule today → **to judgement** | ✓ verified on Rosete, Đukić, Awudu ×2, Omondi |
| 3 | Answer an incoming bid (autopilot) | `fm run` / `fm answer` | ~8-13 s | | deal stage re-read (to add) | rule (`decideSale`): **too rigid** (Arnalot 1.3x; non-negotiable → reject) | redesign: guardrails + model judgement for bids between floor and target |
| 4 | Bid for a player | `fm buy` | dry run **25 s** (fee ~5 s) | 60-90 s; fee 15-20 s | stray-offer check after a no-deal ✓ | approval cap + slack (guardrail); opening/raises (rule) | fee typed into the box's number field, then ≤1 ± step ✓; profile/menu opened twice (next); retry form ✓; agent quote reused ✓ |
| 5 | Pre-contract a free agent | `fm precontract` | ? | | profile "Transfer arranged" ✓ | approval | arranged deals now detected; not re-timed |
| 6 | List for sale | `fm sell --min` | ~70 s | | price book + listed status | approval (min) | asking price always Unspecified (guarded); not re-timed |
| 7 | Loan-list a prospect | `fm loanlist` | ~35 s | | loan list | sell table (rule): prospects start or develop on loan | not re-timed |
| 8 | Answer a loan offer | autopilot handler | ? | | | loan table (rule) | wage share unreadable on some pages (Slatina, Omondi) |
| 9 | Withdraw our bid | `fm withdraw` | ? | | gone the next day only (no confirmation) | — | mapped from the user's clicks |
| 10 | Renew a contract | `fm renew` | 36-53 s | 49 s | agreed wage logged; contract re-read (to add) | renewal test (rule) + agent's range | agent chat first ✓ (keen → Contest → Agree); re-open when pulled to Messages ✓ |
| 11 | Confirm an outgoing transfer | autopilot handler | ? | | | our log says we agreed | "close to joining" wording ✓ |
| 12 | Advance time | `fm cycle`, `fm holiday`, `fm run` | ~15 min for 32 window days | | game date | — | cheap; windows are slow because of 1-4 |
| 13 | Checkpoint + verdicts | `fm checkpoint`, `fm verdict` | ~1 min + agent 7-12 min | | report written, 0 missing | tables suggest, model answers | settled rows auto-answered ✓; agent think time is the cost |
| 14 | Registration, press, captaincy, admin | handlers | ? | | | handlers | untested this session |
| 15 | Staff signings nobody approved | — | — | | | — | **no tool**: Fajardo, Aguilar (contract stage) can't be cancelled by us |

Global costs (104 min of window play, 2026-10-18): screen reads 39%, agent thinking 27%, fee ± clicks 10%,
stops 8%. The bridge's change counter (`uiversion`, ~15 ms) only helps waits for elements appearing or going
(`waitFor(..., {structural: true})`): FM refills the same elements in place for most updates.

## Order of work
1. Bids (4, 3): direct fee entry; the bid judgement redesign; verify every outcome.
2. Renewals (10): reads per step; verify the new contract.
3. Listing and loans (6-8): re-time; wage-share reads.
4. The rest, then hand back to the agent on a new save.
