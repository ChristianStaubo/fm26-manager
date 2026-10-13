# fm26-manager — instructions for Claude

You manage a Football Manager 26 club (`config/club.json`) Moneyball style: buy players the market
undervalues, sell what it overvalues, and leave the team better every window. The user films this;
work autonomously and narrate briefly.

## Start here
1. **`playbook/PLAYBOOK.md`**: how this manager runs a club (the user's rules). Read it first.
   The numbers are in `playbook/policy.json`.
2. Skills: **fm-manager** (decisions: windows, transfers, XI, the season) and **fm-operate**
   (controlling the game). Load the one that fits before acting.
3. Machine-specific paths (game copy, Frida venv): `local/paths.md`, else `game/bridge/README.md`.
4. `node cli/fm.mjs doctor`: are the game, bridge, save and screen ready? (`--fix` starts the bridge.)

## First run on someone's own save
`config/` ships with our experiment's club (Brentford). If the user's club or save differs, set it up
before anything else (details: `config/README.md`):
1. Ask for their club and save, or find the newest `.fm` in the FM26 `games` folder.
2. Export it with FM26 Scout (`python3 ../fm26-scout/fm26_export.py "<save>"`) and take the club
   and league names exactly as the CSV writes them (`club`, `competition` columns).
3. Write `config/club.json` (`club`, `league`, `save_pattern`) and `config/tactic.json` (their
   formation's slots, roles and current starters; ask, or read Match Day → Match Squad).
4. Run `node cli/fm.mjs squad --fresh` and check the squad it prints is theirs.
5. Walk them through `playbook/PLAYBOOK.md`: these are our rules, and they may want their own.
   If their formation isn't a 4-2-3-1, `fm window` needs its `SLOTS` edited.

## Layout
- `playbook/`: the principles (`PLAYBOOK.md`) and every number (`policy.json`). Rules live only here.
- `capabilities/<name>/`: one module per decision. Each has a small public API and a README
  (what it decides, its inputs and outputs, and which playbook section it implements):
  `squad` (needs, sell candidates), `scout` (targets), `value` (what a player is worth to us),
  `buy` (negotiating), `sell` (bids, loans, listing), `contracts`, `xi` (who plays),
  `season` (Continue, autopilot, holiday, the cycle). Shared: `data.mjs` (export + analysis,
  notebook), `log.mjs`.
- `game/`: the operator, which only reads screens and acts; it never decides.
  `bridge/` (Frida), `ui/` (screen reading, controls, overlays), `screens/` (handlers that read a
  screen, call a capability, and click).
- `cli/fm.mjs`: the only command you need (`node cli/fm.mjs help`).
- `analysis/`: Python data layer (save export via FM26 Scout, output ranks, market). `docs/`: method,
  screen map, UI notes.
- `local/`: exports, reports, runs, notebook (gitignored). `notes/`: private notes (gitignored).

## Self-improving loop (player → fixer)
A cheap **player** (`.claude/agents/fm-player.md`, Sonnet) plays one segment and stops with
`fm stuck "<…>"` when the tools fall short. The **fixer** (main session) then:
1. `fm friction` → read `local/runs/friction/<id>.json` (+ look at the live game: the player has stopped).
2. Fix the owning layer:
   - a missing screen handler → `game/screens/`
   - a wrong decision → its capability, or `playbook/` if the rule itself is wrong
   - an unknown route → `docs/screens/README.md`
   - a known dialog → `KNOWN_DIALOGS` (`game/ui/overlays.mjs`)
3. Leave a guard: `fm friction fixture <id> <name>` + a test replaying it.
4. `pnpm test`, commit (small, straight to main), `fm friction resolve <id> "<fix, commit>"`.
5. Spawn the next player segment.

## Rules
- Read the screen before and after acting; outputs only prove an action was invoked.
- Never blindly retry something that may have happened. Look (`fm screen`), then decide.
- Unknown dialog or screen: read it and decide. If it is routine, add a handler/known dialog and
  document it in that folder's README.
- One operator at a time; ask the user not to click while you act.
- Debugging in the live game: one probe, then fix in code. Ask before repeating actions on a real deal.
- Keep saves, exports and logs out of git.
