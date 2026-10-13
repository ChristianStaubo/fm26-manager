# config: which club and save this is

The files here describe **one save**. They ship with our experiment's values (Brentford, saves
named `claude-3*.fm`, a 4-2-3-1). Change them for yours; nothing else in the repo names a club.

## `club.json`
| Key | What | Example |
|---|---|---|
| `club` | your club's name **exactly as the export writes it** (the `club` column of the FM26 Scout CSV) | `"Brentford"` |
| `league` | your league, as in the export's `competition` column; players are ranked against it | `"Premier League"` |
| `save_pattern` | glob for your save in the FM26 `games` folder; the newest match is used | `"my-career*.fm"` |
| `goal` | one line for Claude on what you're trying to do | Moneyball: profit while competing |

Saves folder: `~/Library/Application Support/Sports Interactive/Football Manager 26/games/`
(override with `FM26_SAVE_DIR`).

## `tactic.json`
Your formation's slots, in the order the game lists them. Per slot: `slot` (GK, LB, CB, DM, AM,
LW, ST, …), `role` (one of `ROLES` in `analysis/squad_report.py`: GK, CB, FB (defensive),
WB (attacking), DM, CM, Winger, AMC, ST) and `player` (your current starter there, full name as in
the export). `in`/`out` are the game's in/out-of-possession roles and are for reference only.
Read it from the game: Match Day → Match Squad.

**Known limitation:** `fm window` (the summer report) has the 4-2-3-1's slots built in (`SLOTS` in
`analysis/window.py`). For another shape, edit `SLOTS` to match your `tactic.json`.
