# fm26-manager

Let Claude Code manage your Football Manager 26 club, Moneyball style. Claude reads the game's
UI directly (no screenshots, no mouse), advances time, sells players the market overprices,
buys output it underprices, and goes on holiday between transfer windows.

```
you:    "Start the summer window: analyse the squad and run the transfers."
Claude: exports the save → Moneyball report → plan → lists players, bids, renews contracts
        → runs the window (counter-offers, agent payoffs) → holiday until 28 May → season report
```

## The experiment
Same club (Brentford), same £30M starting balance, three runs:

| Run | Approach | Result |
|---|---|---|
| 1 | Loose rules, Claude in full control | 19th in January, sacked |
| 2 | Strict rules written up front, Claude in full control | 9th (baseline) → 14th → 14th, +£9M on transfers |
| 3 | Rules written from real failures, human in the loop | 14th (baseline) → 11th → 5th → 9th → 10th, FA Cup, balance £30M → £179.5M, +£243M on transfers |

Write-up: _[article link]_. Every rule in `playbook/` came from a failure we watched happen.

## What's inside
| Folder | What |
|---|---|
| `playbook/` | the manager's principles (`PLAYBOOK.md`) and every number (`policy.json`) |
| `capabilities/` | one module per decision: `squad`, `scout`, `value`, `buy`, `sell`, `contracts`, `xi`, `season` |
| `game/` | the operator: Frida `bridge/`, screen reading `ui/`, screen handlers `screens/` |
| `analysis/` | Moneyball squad/market reports from the save file (via [FM26 Scout]) |
| `cli/fm.mjs` | the command Claude uses: `node cli/fm.mjs help` |
| `.claude/skills/` | instructions Claude loads: `fm-manager` (decisions), `fm-operate` (the game) |
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
   original) and a Python venv with the pinned Frida. See `game/bridge/README.md`.
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

Each summer (early July, after FM rolls the season over): `node cli/fm.mjs window` for the squad,
targets and sell list (attribute + stats scores per position), and `node cli/fm.mjs results` to log
the money and the table.

## Self-improving loop
A cheaper model (`.claude/agents/fm-player.md`) plays and stops with `fm stuck "<…>"` when a tool
falls short. The main session reads the report (`fm friction`), fixes the owning layer, adds a test
that replays the exact screen (`test/screens/`), and commits. New actions are mapped by recording
the game's UI calls while a person does them (`fm record start` / `fm record stop`).

## Notes
- Single-player only. Use at your own risk; this injects code into a copy of the game.
- Not affiliated with Sports Interactive or SEGA. No game files or player data are included.
- Every action is verified against the live UI; refusals are retried, uncertain actions never are.
- Decisions and actions are logged to `local/runs/decisions.jsonl` (gitignored with saves/exports).

[FM26 Scout]: https://github.com/ChristianStaubo/fm26-scout
