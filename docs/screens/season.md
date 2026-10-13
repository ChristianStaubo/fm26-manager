# Season screens: Continue, autopilot, holiday

How time moves in FM26 and how `capabilities/season` drives it. Window dates are in
`capabilities/season/season.json`; holiday settings are in `playbook/policy.json` → `holiday`.

## Continue (`continue.mjs`, `fm continue [N]`)
The bridge calls the game's own `ContinueManagerModule.ContinueGame`. It needs one real Continue
press per game launch to learn the timer argument: `fm click Continue`. The loop presses Continue
up to N times and returns when:
- `required-action`: the game shows "Review Transfer Offer", "Response Required", "Confirm
  Transfer", … (state `NeedAction`); the current task has been opened on screen;
- `handoff`: a state with no automation (matches, press conferences, team talks…);
- `step-limit` / `time-limit` / `error` (never retry an error blindly; look first).

States: `CanContinue`, `NeedAction`, `Processing`/`Waiting`/`Saving`/`NewsAggregator`/`OnHoliday`
(busy), `Match`, `PressConference`, `TeamTalk`, … (handoff).

## Autopilot (`autopilot.mjs`, `fm run [--until YYYY-MM-DD]`)
The Continue loop plus handlers for routine NeedAction screens: `game/screens/transfer-offers.mjs`
(offers for our players, agent payoffs) and `game/screens/admin/handlers.mjs` (delegate signing
finalization, code of conduct, …). Without `--until` it stops when the current transfer window
closes, or the coming one if it has not opened yet: deals agreed before the window opens complete
on its first day and still need handling. Exit 2 + a `screen` summary means it needs you.

## Holiday (`holiday.mjs`, `fm holiday [--until YYYY-MM-DD]`)
Outside transfer windows the manager goes on holiday. Route: **date button (top right) →
Portal → Calendar → Go On Vacation** (it is not in the FM menu). The dialog has:
- "Return from vacation after: N day(s)" (radio + number field);
- a radio for transfer offers ("Only accept offers matching asking price", …);
- checkboxes ("Only sell transfer listed players", "Use current match tactics", "Use team
  selection where possible"). Which ones are ticked comes from `policy.json`.

The first vacation of a save returned a few days later than planned: check the return date
shown in the dialog.

## Holiday as the dismiss button
FM ends a vacation early when something needs the manager (choosing the captain, pre-season
friendlies, …). **Going on holiday again lets the assistant settle it.** `fm holiday --season`
does this for a whole stretch: whenever a leg ends early it logs `holiday-leg` (dates + the screen
that ended it) and goes again. It stops at the return date, on an unknown dialog, or after two
legs without progress. The game can also ignore Continue for a while right after a holiday leg
("waiting"); it resolves on its own.
