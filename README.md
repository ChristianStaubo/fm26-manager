# fm26-manager

Let Claude Code manage your Football Manager 26 club, Moneyball style. Claude reads the game's
UI directly (no screenshots, no mouse), advances time, sells players the market overprices,
buys output it underprices, and goes on holiday between transfer windows.

```
you:    "Start the summer window: analyse the squad and run the transfers."
Claude: exports the save → Moneyball report → plan → lists players, bids, renews contracts
        → runs the window (counter-offers, agent payoffs) → holiday until 28 May → season report
```

## What's inside
| Folder | What |
|---|---|
| `playbook/` | the manager's principles (`PLAYBOOK.md`) and every number (`policy.json`) |
| `capabilities/` | one module per decision: `value`, `sell`, `buy`, `contracts`, `season` |
| `game/` | the operator: Frida `bridge/`, screen reading `ui/`, screen handlers `screens/` |
| `analysis/` | Moneyball squad/market reports from the save file (via [FM26 Scout]) |
| `cli/fm.mjs` | the command Claude uses: `node cli/fm.mjs help` |
| `.claude/skills/` | instructions Claude loads: `fm-season`, `fm-operate`, `fm-transfers`, `fm-moneyball` |
| `docs/` | analysis method, decision guidelines, FM26 UI notes and quirks |

## Requirements
- macOS on Apple Silicon, FM26 (Steam), Node.js 20+, Python 3.12, [Claude Code](https://claude.com/claude-code)
- [FM26 Scout] next to this folder (`../fm26-scout`, or set `FM26_SCOUT_PATH`) for the analysis
- Tested with FM26 build 23583635. Game updates may need small changes in `game/bridge/agent/`.

## Setup
```bash
git clone https://github.com/ChristianStaubo/fm26-scout      # save exporter (analysis)
git clone https://github.com/ChristianStaubo/fm26-manager    # this repo, next to it
cd fm26-manager
```
1. `game/bridge/setup-macos.sh` — makes a re-signed **copy** of the game (Frida cannot attach to the
   original) and a Python venv with the pinned Frida. See `bridge/README.md`.
2. Edit `config/club.json` (your club, save name pattern) and `config/tactic.json` (your
   formation's slots, used by the reports).
3. Optional: tune `playbook/policy.json` (counter-offer multiples, payoff rule, …) and
   `capabilities/season/season.json` (window dates, holiday options).

## Use
```bash
open ~/fm26-debug/fm.app                 # start the copy, load your save
~/fm26-debug/venv/bin/python game/bridge/server.py > /tmp/fm26-bridge/bridge.log 2>&1 &
claude                                   # in this folder; then just ask
```
Or by hand: `node cli/fm.mjs status | screen | sell "Name" --club "Club" --dry-run | run | holiday`.

## Notes
- Single-player only. Use at your own risk; this injects code into a copy of the game.
- Every action is verified against the live UI; refusals are retried, uncertain actions never are.
- Decisions and actions are logged to `local/runs/decisions.jsonl` (gitignored with saves/exports).

[FM26 Scout]: https://github.com/ChristianStaubo/fm26-scout
