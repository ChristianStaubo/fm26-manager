# fm26-manager

Let Claude Code manage your Football Manager 26 club, **Moneyball style**.

In this project we've given Claude the ability to access the FM 26 UI efficiently, as well as rules and instructions to operate a club efficiently. You can just git clone this project, @claude to it and tell them to play and make you money.

I had Claude running a save by itself for 10 seasons, and making this much in club revenue without winning the league once (might be the first time that's ever happend in FM):

<p align="center">
  <img width="1475" height="799" alt="Pasted Graphic 1" src="https://github.com/user-attachments/assets/74dd5ed9-89f0-4ceb-91b2-348eee5ff95d" />
</p>

---

For the feedback loop for how we built this, I wrote an [X article here](https://x.com/ChristianStaubo/status/2110156797252448376) describing it, although the project grew over time, as I learnt new techniques, some concepts from robotics on diagnosing processes, after writing the article.

In terms of the loop, it was basically this:

<p align="center">
  <img width="1120" height="1093" alt="image" src="https://github.com/user-attachments/assets/a719df5c-6107-4fea-b839-34c6ebc98f3b" />
</p>

---

This is built only for **macOS**, but there are instructions for Claude to set this up for you in Windows. We have 2 modes for this:

- **A moneyball mode**
- **A simpler "CA/PA" mode.** Here Claude makes decisions on who to buy and sell, based on information which isn't available to you when you play the game yourself. So it can feel a bit like cheating

Below are some instructions for your agent to read so it can set everything up and you don't need to look at any code:

---

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

## Notes
- Single-player only. Use at your own risk; this injects code into a copy of the game.
- Not affiliated with Sports Interactive or SEGA. No game files, saves or player database are
  included (test fixtures hold a few recorded screens).
- Comments and `policy.json` notes cite the case that taught each rule: player names from our saves,
  dates (in-game, or the day a rule was set), and "(user, …)" for rules I set.
- Every action is verified against the live UI; refusals are retried, uncertain actions never are.
- Decisions and actions are logged to `local/runs/decisions.jsonl` (gitignored with saves/exports).

[FM26 Scout]: https://github.com/ChristianStaubo/fm26-scout
