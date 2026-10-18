# Next steps (agreed 2033-09-01 / 2026-10-17, from the audit in docs/audit-2033-08.md)

## Revisit (discussed, not built yet)
1. **One standard for every flow.** Each situation is a decision table (one decision from inputs), a
   state machine (a process over days or rounds) or a screen handler (recognise, extract facts, ask,
   click; never decide). Review every flow against it: is the decision table or state machine solid
   where we need one? First done to the standard: the sell matrix by depth role x age (d02a748).
2. **Rules by area.** `playbook/README.md` as the index; `playbook/<area>/rules.md` (the why) +
   `policy.json` (numbers and tables only) for selling, buying, contracts, loans, squad, season;
   dated history in `playbook/CHANGES.md`; a check that flags policy keys no code reads.
3. **Memory in the repo.** The user's rules move into the playbook areas, the working method into
   `docs/agent-workflow.md` / `CLAUDE.md`, this save's context into `saves/<save>/notes.md`; private
   Claude memory shrinks to a pointer. Anyone cloning the repo gets the same behaviour.
4. **The loan decision table** (listed x youth / senior non-starter / first-team; never stops for
   the user), built in `playbook/loans/` as the first area done fully to the standard.
5. **Haiku as the default player.** Two segments so far: clean stops on real gaps.

6. **Direct game calls (mapping session, needs the live game to itself, 1-2 h).** Find the object behind
   a menu entry and the method that runs it, and FM's screen navigator (what Back/Forward call); wrap
   them as bridge tools (`menu.invoke(path)`, `nav.open('player', id)`), with clicking as the fallback.
   Then time routine jobs (open a profile, list a player, read Transfer Activity) before and after.
   Why: today we poll full UI snapshots and guess menu structure by position, which causes the
   retries and resets.
   **Status 2026-10-18: the first direct call works and is used.** Tools: `fm explore classes|methods|fields|find|capture`
   (`game/bridge/agent/70-explore.js`) and `fm record start --classes <any game class>`. A profile is panel
   `PlayerReport` (PanelID 2208093440) bound to `Player` = `FM.UI.PersonReference` (+ `Team`); Back re-opens
   a `PanelHistoryNode` with `PanelHistoryManager.OpenPanel`. `75-direct.js` `openPerson(index)` opens a copy
   of the latest profile node with our person in it. A/B (`telemetry/bench.mjs`, local/runs/benchmarks):
   UI 7.6 s median (14 screen reads, 3 clicks, typing) vs direct 1.15 s (1 call, 2 reads), 6/6 each.
   `openPlayer` goes direct when it knows the index (`game/ui/person-index.mjs`, learned on every UI open)
   and falls back to the search. Lessons: build game objects the way the game does (a `PersonReference`
   from `Int32` lacked the session id pair and faulted inside FM; one copied from the game's own is
   identical); resolve abstract methods on the concrete class (runtime_invoke doesn't dispatch); never
   `exceptions: 'propagate'` (FM crashed). Next candidates, by the trace: reading Transfer Activity, the
   Actions menu paths, fee entry (`setFee` steps +/- with 3 full reads per step).

7. **The Moneyball variant (after a season runs unsupervised on CA/PA; user, 2026-10-18).** The same
   checkpoints, tables and state machines, but the manager cannot see CA or PA: quality from match stats
   in the context of our tactic (role stats vs the league, minutes-shrunk: `analysis/squad_report.py`)
   plus role attributes; growth from age, attributes and minutes. Needs: a switch (`policy.json`
   `evaluation.lens: ca_pa | moneyball`) that every table reads, CA/PA hidden from the exports in that
   mode, and a backtest of both lenses on our past signings (who would each have bought, and the profit).

## Audit items still to address
See the audit's top 10; summarised in the conversation of 2026-10-17.
