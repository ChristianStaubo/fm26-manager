# Admin screens

Routine NeedAction screens that need no judgment go to staff (`handlers.mjs`):

| Screen | Recognised by | Action |
|---|---|---|
| Confirm Transfer (signing agreed) | button "Delegate 'Finalizing player signings…'" | delegate to the General Manager |
| Code of conduct | "Skip Code of Conduct" + "Ask <assistant> to Pick" | assistant picks |
| "<Player> wants to discuss personal matters" (e.g. unhappy about his asking price) | text + "Decline" | Decline (morale is out of scope; "Ask <leader> to Resolve Issue" did nothing when clicked). Afterwards: "Actioned — You declined to speak to …" |

Seen but not automated (the autopilot stops; decide, act, continue):
- **Board season expectations** ("Response Required", objectives with options, Confirm): keep the
  board's defaults unless the user wants a different ambition; press Confirm.
- **Registration** (squad registration for competitions): use the recommended registration.

Adding one: `{name, match: screen => bool, run(screen) }` in `handlers.mjs`, using a stable
button label as the match. Prefer "delegate to staff" buttons.
