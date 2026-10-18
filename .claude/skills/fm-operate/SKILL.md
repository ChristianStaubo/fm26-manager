---
name: fm-operate
description: Operate Football Manager 26 through the bridge — start/check the bridge, read the screen, click, recover from popups, advance time with Continue or the autopilot, and handle stops. Use before any in-game action and whenever something on screen is unexpected.
---

# Operating FM26

You control the game with the `fm` CLI (`node cli/fm.mjs …`, from the repo root). It talks to a
bridge injected into the game. You never use screenshots or the mouse: you read the UI tree.
Details: `docs/ui-notes.md` (controls, overlays, quirks). Read it when anything looks odd.

## 1. Start of a session
```bash
node cli/fm.mjs doctor          # every check with a fix hint; --fix starts the bridge
```
Where things are in the game: `docs/screens/README.md`.
- `Bridge is not running` → the game copy must be running (not Steam's): `open ~/fm26-debug/fm.app`
  (or `$FM26_GAME_COPY`). Then start the bridge in the background:
  `~/fm26-debug/venv/bin/python game/bridge/server.py > /tmp/fm26-bridge/bridge.log 2>&1 &`
  and run `status` again. Setup if missing: `bridge/README.md`.
- `available: false` / `actionReady: false` → load the save, then `node cli/fm.mjs click Continue`
  once (teaches the bridge the Continue call).

## 2. Look before you act
- `fm screen [filter]` — date, Continue button label, every button/menu/field/text in order.
- `fm overlays` — dialogs, menus, popups, search, chats on top of the page.
- `fm player "<name>" --club <club>` — open a profile; value range, contract, Actions menu.

## 3. Act
- `fm click "<label>"` (add `--name <element>` when two buttons share a label).
- Domain commands: `fm sell`, `fm buy`, `fm renew` (skill **fm-manager**), `fm holiday`.
- After every action, check the result (`fm screen`/`fm overlays`). Outputs say
  `verificationRequired: true`: an action only proves the click happened.
- `fm recover` returns to a clean page (closes menus, lists, search, chats, card dialogs;
  answers known dialogs). It refuses unknown dialogs — read them and decide.

## 4. Advance time
- `fm run` — autopilot until the transfer window closes; `fm run --until 2026-07-15` for a bounded run.
  It handles bids for our players, agent payoffs, code of conduct, signing finalization.
- `fm continue [N]` — plain Continue loop (no handlers).
Exit code 2 = it stopped for you. Read `reason`, `why`, `screen.texts`, `screen.buttons`:
| reason | do |
|---|---|
| `needs-analyst` | a decision: transfers → skill fm-manager; other screens → decide (prefer delegating to staff), act, `fm run` again |
| `unfamiliar-state` | match/press conference/team talk etc.: usually press the obvious button (e.g. delegate to assistant) and continue |
| `window-closed` / `until` | done — next step per skill fm-manager |
| `error` | read it; never blindly repeat an action that may have run |

## 5. Rules
- **One operator.** Don't run two `fm` commands at once; the user should not click while you act.
- Never retry an action whose result is uncertain; look at the screen first.
- Don't change tactics, staff or settings unless asked.
- If the user's real clicks stop working: `fm input-reset`.

## Stuck?
`fm stuck "<goal> | <what you tried> | <what happened>"` saves the screen, overlays and your
recent commands to `local/runs/friction/`. As the player: run it and stop, don't improvise.
A failed command or a stopped run already saved an incident at the moment it went wrong (its id is
in the output: `fm incident <id>`); `fm stuck` attaches the latest one, so don't poke the screen first.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Element is occluded (by …floating-element-root)` | a list/menu is open: `fm recover` |
| `Unknown dialog: …` | read it (`fm overlays`); click the right button; add it to `KNOWN_DIALOGS` (game/ui/overlays.mjs) if routine |
| `No search result for X` | check spelling/club; the helper already retries the Messages-only quirk |
| `Timed out waiting for …` | `fm screen` to see where you are, `fm recover`, try again |
| `Continue not initialised` | `fm click Continue` once |
| bridge fails with `unable to intercept function` | an old bridge is still attached: stop it, start one bridge only |
