# How the FM26 manager works (snapshot, in-game August 2033)

The concrete system behind [agent-workflow.md](agent-workflow.md) (the general method). Written for a
reader auditing it: what runs where, how decisions are made, how the loops work, and where it is weak.

## 1. The goal
Prove an agent can run a club on its own and make money: **transfer profit** first (buy young and
cheap, develop, sell high), **club balance** second, while staying in the **top four to seven** so
European football keeps the revenue coming. Target: £1B balance or transfer profit.
Scoreboard: `fm results` / `fm audit` (net transfer profit, balance, squad value, wages, position).

Season 2032/33, the first one played almost entirely by the agent: 3rd, 75 pts (was 9th, 55), balance
£66M → £126M, first-team value £705M → £784M. Notable sales: Ortega £73.75M (paid £61M), Kislyak
~£55M (final-year value £19M, renewed first), Germany, Gallardo (£56M; paid £22.5M).

## 2. Layers (separation of concerns)
| Layer | Where | Does | Never does |
|---|---|---|---|
| Rules | `playbook/PLAYBOOK.md`, `playbook/policy.json` | The user's rules in words, every number in one place | Code |
| Decisions | `capabilities/<name>/` (sell, buy, contracts, deals, squad, value, season, …) | Pure functions where possible: input facts → decision | Click anything (except a few capabilities that still drive screens, e.g. `buy`, `contracts/personal-terms`) |
| Operator | `game/ui` (read screen, click, overlays), `game/screens` (handlers) | Reads a screen, asks a capability, clicks | Decide |
| Bridge | `game/bridge` (Frida into the game) | UI tree, clicks, the Continue loop | Know about football |
| Data | `analysis/*.py` (save export via FM26 Scout) | CA/PA, values, wages, peers, free agents, newgens | Touch the game |
| CLI | `cli/fm.mjs` | The only entry point for agents and humans | Logic of its own |
| Memory | `local/` (logs, deals, price book, notebook), `notes/` | State between runs | Get committed |

## 3. How decisions are made (four mechanisms)
1. **State machines** for things that unfold over days and can go wrong silently.
   - Deals (`capabilities/deals/`): offer → negotiating → fee-agreed → contract → work-permit →
     confirmation → completed | collapsed, observed daily from Transfer Activity. It stops on a
     stuck, vanished or unknown move, and rewinds when a save is reloaded.
   - Reply classifier (`deals/replies.mjs`): every club or agent line → one explicit state, so a new
     reply becomes a test, not a timeout.
2. **Decision matrices** (pure, tested, numbers in policy) for valuation calls.
   - Selling: need (core 1.5x / depth 1.2x / surplus 1.0x) x rising (≤ 23: 1.1x), floors (what we
     paid, our minimum when we'd keep him), grossed up for sell-ons we owe; listed players by the
     price book. Never a plain reject: counter at our price.
   - Final-year contracts: release / run down / sell / renew (renewal test, wage ceiling).
   - Loans: youth rule, loan list, plain-loan rule (outside our XI, ≥ 80% of wages covered incl. fee).
   - Buying: open at 0.85x value, release clause as the ceiling, no sell-ons, wage ceiling per
     player (our peers by CA x 1.15, his current wage x 2.5).
3. **Screen handlers** (24 in the autopilot) for recurring game screens: match each screen
   by its content, run the matrix, click. Unknown screen → stop, never guess.
4. **LLM judgement** only where no rule exists yet: the player model (Sonnet) inside the playbook,
   and the supervisor (Opus) for novel situations. Every judgement call either becomes a rule +
   test, or is logged as a `supervisor-decision` for the user to review.

The direction of travel: 4 → 3 → 2 → 1. A situation is handled by judgement once, then by a rule,
and, if it unfolds over time, by a state machine. Contract talks went from "let the model negotiate"
to a fixed procedure (promise lowering, demand probe, split offers, ceilings).

## 4. The loops
**Time loop.** `fm cycle` advances to the next checkpoint (`playbook/cycle.json`: january 01-02,
newgen 05-01, season_end 05-28, summer 07-02) and runs every step in code, writing one report.
Inside a transfer window the autopilot (`fm run`) presses Continue and handles every screen, with a
one-day holiday on match days. Outside windows the game holidays and the assistant manager plays
the matches. Watchdogs stop a stall; a lock stops two operators.

**Improvement loop** (player → judge → fixer).
- Player: a run stops cleanly with a reason and a friction report.
- Judge: `fm audit` checks the state against everything a human once caught.
- Fixer: the stronger model finds the owning layer and fixes it, adds a test that replays the
  failure (saved screens in `test/screens/`), commits, and resumes.

237 commits, 165 tests. Today's stops are mostly new screens or new edge cases, not repeats.

**Human role.** From doing → approving (`fm approve`) → delegating windows → reviewing and
calibrating (e.g. reloading a save to redo three signings under new wage rules). User corrections
become rules (policy + playbook), tests, and memory.

## 5. Known weak spots (for the audit)
- **Imperative negotiations.** Buying and personal terms are loops in code, not state machines.
  Calibration showed the gaps: agents anchor wages on our squad average; offers that are too low
  get a flat rejection and the release clause is paid anyway.
- **Unmapped screens.** Removing a contract promise, raising or removing a release clause,
  removing a player's sell-on in personal terms, picking a save in the load dialog.
- **Local state vs game state.** Deals and the decision log drift when a save is reloaded; deals
  now rewind, but the log keeps both timelines.
- **Staff acting on their own.** The General Manager signed Zack Taylor free; the setting is unknown.
- **Retries.** Retries and target resolution still have special cases (an "act owns retries" refactor
  is pending). The admin handlers could become a declarative table.
- **policy.json** holds rules and their history ("_" notes) in one growing file.
- **The cheap player model** was under-used this season; most segments ran in the main session.
