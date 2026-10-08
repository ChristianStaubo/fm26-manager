# Admin screens

Routine NeedAction screens that need no judgment go to staff (`handlers.mjs`):

| Screen | Recognised by | Action |
|---|---|---|
| Confirm Transfer (signing agreed) | button "Delegate 'Finalizing player signings…'" | delegate to the General Manager |
| Code of conduct | "Skip Code of Conduct" + "Ask <assistant> to Pick" | assistant picks |
| "<Player> wants to discuss personal matters" (e.g. unhappy about his asking price) | text + "Decline" | Decline (morale is out of scope; "Ask <leader> to Resolve Issue" did nothing when clicked). Afterwards: "Actioned — You declined to speak to …" |

| Press conference (state `PressConference`, e.g. new-signing unveiling) | game state, not a button | `press.mjs` (`fm press`, and `fm run` on its own): open the announcing message → click its delegate button if offered (future unveilings go to staff) → the message's **Attend Press Conference** → Start → first (most positive) answer to each question → Leave |

Press conference quirks (2026-06-17, Broholm unveiling): the Continue-slot "Attend Press
Conference" does nothing when clicked; leaving the room without starting does not clear it;
delegating applies to future conferences only. If an older unveiling message sits above the
pending one, the handler opens the wrong one and stops on a timeout (no harm; open it by hand).

| Outgoing "Confirm Transfer" ("<Player> set to move on loan to <Club>"; Accept / Delay Transfer / Cancel) | those buttons + "set to move/join/leave", no Delegate-finalizing button | `confirm-outgoing`: Accept only if `decisions.jsonl` shows we accepted a deal for that player; else stop (deals agreed before this tooling, or by staff, e.g. Meghoma → Aston Villa £7M) |
| Invitations: friendly proposals (Accept/Reject Invitation), youth league entries ("U18 Division 2 invitation", Accept/Decline) | those buttons; Accept/Decline only under a title ending in "invitation" | always accept (user, 2026-10-08): `accept-invitation` |
| Board "Season expectations" (Response Required) | text "The board are ready to discuss season expectations…" + Confirm | keep the board's preselected objectives, Confirm (`season-expectations`). The Confirm button sits below the objectives; the separate "Board request meeting…" message did not block Continue (2026-06-25) |

Seen but not automated (the autopilot stops; decide, act, continue):
- **Registration** (squad registration for competitions): use the recommended registration.

Adding one: `{name, match: screen => bool, run(screen) }` in `handlers.mjs`, using a stable
button label as the match. Prefer "delegate to staff" buttons.
