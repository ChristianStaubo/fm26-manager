# Progression: Continue loop, autopilot, holiday

## Continue (`continue.mjs`, `fm continue [N]`)
The bridge calls the game's own `ContinueManagerModule.ContinueGame` (it needs one real Continue
press per game launch to learn the timer argument: `fm click Continue`). The loop presses
Continue up to N times and returns when:
- `required-action` — the game shows "Review Transfer Offer", "Response Required", "Confirm
  Transfer", … (state `NeedAction`); the current task has been opened on screen;
- `handoff` — a state with no automation (matches, press conferences, team talks…);
- `step-limit` / `time-limit` / `error` (never retry an error blindly; look first).

States: `CanContinue`, `NeedAction`, `Processing`/`Waiting`/`Saving`/`NewsAggregator`/`OnHoliday`
(busy), `Match`, `PressConference`, `TeamTalk`, … (handoff).

## Autopilot (`autopilot.mjs`, `fm run [--until YYYY-MM-DD]`)
Continue loop + handlers for routine NeedAction screens:
`tasks/transfers/incoming.mjs` (offers for our players, agent payoffs) and
`tasks/admin/handlers.mjs` (delegate signing finalization, code of conduct). Without `--until`
it stops when the current transfer window closes, or the coming one if it has not opened yet:
deals agreed before 16 June complete on the window's first day and still need handling (`season.json`). Exit 2 + `screen` summary = needs you.

## Holiday (`holiday.mjs`, `fm holiday [--until YYYY-MM-DD]`)
Outside transfer windows the manager goes on holiday. Route: **date button (top right) →
Portal → Calendar → Go On Vacation** (it is not in the FM menu). Dialog:
- Return: "Return from vacation after: N day(s)" (radio + number field). Default return:
  `season.json` `holiday.return_on` (28 May: season over, stats complete, before the window).
- Transfer offers radio: "Only accept offers matching asking price".
- Tick "Only sell transfer listed players" and "Use current match tactics".
- **"Use team selection where possible" is TICKED since 2026-10-09** (user: our signings must play). Before, it was never ticked: it stops the assistant rotating tired
  players and causes injuries (user rule).
The first vacation of a save returned a few days later than planned (1 June vs 28 May): check
the return date shown in the dialog. Whether holiday stops for incoming offers is not yet known.

## Holiday as the dismiss button (user, 2026-10-08)
FM ends a vacation early when something needs the manager (e.g. choosing the captain, 2026-08-02:
after one day). **Going on holiday again lets the assistant settle it** (captain picked
automatically). `fm holiday --season [--until YYYY-MM-DD]` does this for a whole stretch: holiday
to the return date (default `season.json` holiday.return_on), and whenever a leg ends early it logs
`holiday-leg` (dates + the screen that ended it) and goes again. It stops at the return date, on an
unknown dialog, or after two legs without progress. Use it outside transfer windows, and as the
fallback for one-off manager decisions (captaincy, pre-season friendlies, …) instead of building a
handler for each.
The game can also ignore Continue for a while right after a holiday leg ("waiting"); it resolves
on its own.
