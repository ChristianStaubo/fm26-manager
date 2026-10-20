# fm26-manager

Let Claude Code manage your Football Manager 26 club, Moneyball style. Claude reads the game's
UI directly (no screenshots, no mouse), advances time, sells players the market overprices,
buys output it underprices, and goes on holiday between transfer windows.

```
you:    "Start the summer window: analyse the squad and run the transfers."
Claude: exports the save → Moneyball report → plan → lists players, bids, renews contracts
        → runs the window (counter-offers, agent payoffs) → holiday until 28 May → season report
```

> **Completely vibe coded.** Claude Code wrote every line of this repo; I didn't touch the code.
> It was built for one Mac, one save and one club, so expect to adapt some things to your own
> setup (your Claude can do that too). But this is everything your own agent needs to play FM26.

## The experiment
Same club (Brentford), same £30M starting balance, three runs:

| Run | Approach | Result |
|---|---|---|
| 1 | Loose rules, Claude in full control | 19th in January, sacked |
| 2 | Strict rules written up front, Claude in full control | 9th (baseline) → 14th → 14th, +£9M on transfers |
| 3 | Rules written from real failures, human in the loop | 14th (baseline) → 11th → 5th → 9th → 10th, FA Cup, balance £30M → £179.5M, +£243M on transfers |

Write-up: _[article link]_. Every rule in `playbook/` came from a failure we watched happen.

Run 3 judged players by FM's hidden current and potential ability (CA/PA) while the checkpoints and
decision tables were made to run whole seasons unsupervised. You can now pick that, or a **Moneyball
mode** that never sees CA/PA (below).

## Choose how Claude judges players
One setting in `config/club.json`:

```json
"mode": "moneyball"    // or "ability"
```

| | **moneyball** | **ability** |
|---|---|---|
| Sees | what you see in FM: attributes, match stats, market value, age, contract | FM's hidden current / potential ability (CA / PA) |
| A player's level (now) | his attributes plus what he produces, against his league's strength | CA |
| His ceiling (growth) | estimated from level, age and value | PA |
| Feels like | a real manager with a good data team | perfect scouting |

Everything else is the same: the checkpoints, the buy and sell tables, the rules in `playbook/`, the
approvals. In moneyball mode CA/PA never reach Claude: the save export it reads has no such columns,
and every report says *level* / *ceiling*. Check with `node cli/fm.mjs mode`, or try the other one on a
single command with `--mode ability` / `--mode moneyball`.

How close does Moneyball get? Fitted on 33,386 players of one save: level vs the hidden CA, 0.92 rank
correlation (typically 6 points off on a 200 scale); ceiling vs PA for players 21 and under, 0.79.
Spotting the next superstar is harder without PA, as it is in real football.
(`analysis/calibrate_quality.py` refits it; a developer tool that reads CA/PA, kept out of Claude's way.)

## What's inside
| Folder | What |
|---|---|
| `playbook/` | the manager's principles (`PLAYBOOK.md`) and every number (`policy.json`) |
| `capabilities/` | one module per decision: `squad`, `scout`, `value`, `buy`, `sell`, `contracts`, `xi`, `season` |
| `game/` | the operator: Frida `bridge/`, screen reading `ui/`, screen handlers `screens/` |
| `analysis/` | Moneyball squad/market reports from the save file (via [FM26 Scout]) |
| `cli/fm.mjs` | the command Claude uses: `node cli/fm.mjs help` |
| `.claude/skills/` | instructions Claude loads: `fm-manager` (decisions), `fm-operate` (the game) |
| `docs/` | analysis method, screen map and screen notes (`screens/`), FM26 UI notes and quirks |

## Requirements
- **macOS on Apple Silicon** and FM26 from Steam. The bridge (how Claude reads and clicks the game)
  is built for that setup only. On Windows or an Intel Mac it won't run as is, but the approach
  carries over: point your own Claude Code at `game/bridge/` and ask it to port it.
- Node.js 20+ and [pnpm](https://pnpm.io) (pinned in `package.json`), Python 3, [Claude Code](https://claude.com/claude-code)
- [FM26 Scout] next to this folder (`../fm26-scout`, or set `FM26_SCOUT_PATH`) for the analysis
- Tested with FM26 build 23583635. Game updates may need small changes in `game/bridge/agent/`.

You don't install Frida yourself: the setup script installs a pinned, hash-checked version into its
own Python environment. There are no npm packages to install either.

## Setup
```bash
git clone https://github.com/ChristianStaubo/fm26-scout      # save exporter (analysis)
git clone https://github.com/ChristianStaubo/fm26-manager    # this repo, next to it
cd fm26-manager
game/bridge/setup-macos.sh
```
1. `setup-macos.sh` makes a re-signed **copy** of the game (Frida can't attach to the Steam
   original, which stays untouched) and a Python environment with Frida in `~/fm26-debug/`.
   Details: `game/bridge/README.md`.
2. Give your terminal permission to attach: System Settings → Privacy & Security → Developer Tools.
3. Point it at your save: `config/club.json` (your club, league, save name) and
   `config/tactic.json` (your formation). See `config/README.md`, or just open `claude` here and
   say *"set this up for my save"*: `CLAUDE.md` tells it how.

## Use
```bash
open ~/fm26-debug/fm.app                 # start the copy (not Steam's), load your save
node cli/fm.mjs doctor --fix             # checks everything and starts the bridge
claude                                   # in this folder; then just ask
```
Then say *"run my save"*: Claude plays the season loop (`fm cycle`), stopping only for the buys and
sales you approve (`playbook/` §10) or when a tool falls short.
Or by hand: `node cli/fm.mjs status | screen | sell "Name" --club "Club" --dry-run | run | holiday`.
Tests: `pnpm test`.

Each summer (early July, after FM rolls the season over): `node cli/fm.mjs window` for the squad,
targets and sell list (attribute + stats scores per position), and `node cli/fm.mjs results` to log
the money and the table.

## Make it yours: the rules
Everything Claude decides follows **our** rules: how we value players, when we sell, how hard we
negotiate, who renews. They live in two files, and the code only applies them:
- `playbook/PLAYBOOK.md`: the principles, in plain English
- `playbook/policy.json`: every number (counter-offer multiples, wage cap, minutes floor, …)

They came from three runs of watching things go wrong, so they're a good start, not the truth.
Change them to manage your way. Each capability's README says which playbook section and which
`policy.json` keys it uses.

## Self-improving loop
A cheaper model (`.claude/agents/fm-player.md`) plays and stops with `fm stuck "<…>"` when a tool
falls short. The main session reads the report (`fm friction`), fixes the owning layer, adds a test
that replays the exact screen (`test/screens/`), and commits. New actions are mapped by recording
the game's UI calls while a person does them (`fm record start` / `fm record stop`).

## Notes
- Single-player only. Use at your own risk; this injects code into a copy of the game.
- Not affiliated with Sports Interactive or SEGA. No game files, saves or player database are
  included (test fixtures hold a few recorded screens).
- Comments and `policy.json` notes cite the case that taught each rule: player names from our saves,
  dates (in-game, or the day a rule was set), and "(user, …)" for rules I set.
- Every action is verified against the live UI; refusals are retried, uncertain actions never are.
- Decisions and actions are logged to `local/runs/decisions.jsonl` (gitignored with saves/exports).

[FM26 Scout]: https://github.com/ChristianStaubo/fm26-scout
