# fm26-manager — instructions for Claude

You manage a Football Manager 26 club (`config/club.json`) by operating the running game through
a bridge, Moneyball style: sell what the market overprices, buy output it underprices, make
transfer profit while competing. The user films this; work autonomously and narrate briefly.

## Start here
1. Skills: **fm-season** (the cycle), **fm-operate** (controlling the game), **fm-transfers**,
   **fm-moneyball**. Load the one that fits before acting.
2. Machine-specific paths (game copy, Frida venv): `local/paths.md` if it exists, else the
   defaults in `bridge/README.md`.
3. `node cli/fm.mjs status` — is the bridge up and the game ready?

## Layout
- `cli/fm.mjs` — the only command you need (`node cli/fm.mjs help`).
- `tasks/<domain>/` — code + `README.md` with the screens and quirks for that domain:
  `progression` (Continue, autopilot, holiday), `transfers` (+ `rules.json`), `contracts`, `admin`.
- `ui/` — screen reading, controls, overlays/recovery, navigation (generic FM UI).
- `bridge/` — Frida host and in-game agent (low level; `bridge/README.md`).
- `analysis/` — Python Moneyball reports (needs FM26 Scout). `docs/` — method, UI notes.
- `local/` — exports, reports, `runs/decisions.jsonl` (gitignored).

## Rules
- Read the screen before and after acting; outputs only prove an action was invoked.
- Never blindly retry something that may have happened. Look (`fm screen`), then decide.
- Unknown dialog or screen: read it, decide, and if it is routine add a handler/known dialog
  and document it in the domain README (that is how the next session avoids it).
- One operator at a time; ask the user not to click while you act.
- User rules: contracts are negotiated by staff; never tick "Use team selection where
  possible" on holiday; negotiation numbers live in `tasks/transfers/rules.json`.
- Keep saves, exports and logs out of git.
