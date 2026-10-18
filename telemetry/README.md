# telemetry: what happened, how long it took, and what led up to a failure

The flight recorder. It watches every layer (bridge calls, the autopilot, `fm` commands) and decides
nothing. Everything stays on this machine under `local/runs/` (gitignored), with caps.

| Piece | File | What it records | Where | Kept |
|---|---|---|---|---|
| Trace | `trace.mjs` (called by `game/bridge/client.mjs`) | one line per bridge call: command, run id, game date, op, target, ms, screen size, error | `local/runs/trace/<day>.jsonl` | 30 days, gzipped after the day |
| Black box | `game/bridge/blackbox.py` (in the bridge process) | the last 20 distinct screens (trimmed, gzipped, ~50–100 KB each) and the last 300 requests | memory only | until overwritten |
| Incidents | `incidents.mjs` (called by `cli/fm.mjs`) | when a game command errors or the autopilot/cycle/holiday stops short of its goal: the black box, the error and its stack, this run's trace | `local/runs/incidents/<id>/` | newest 50 |
| Stats | `stats.mjs` | where the time goes; game days per stop; friction by cause | computed | — |
| Retention | `retention.mjs` | gzip and delete by the limits above, once a day | — | — |

Sizes (measured 2026-10-18): a full screen read is ~6,000 elements, ~1 MB of JSON, 0.3–0.8 s (most
of it the game walking its UI tree). A trace line is ~250 bytes; status polls (holiday, every 5 s)
are traced only when the state changes. An incident is ~1–2 MB. Total: ~200 MB at most.

The run id (`FM_RUN_ID`) joins a command's journal entry (`local/runs/commands.jsonl`), its trace
lines and its incident. Tests (`NODE_TEST_CONTEXT`) and `FM_TELEMETRY=off` write nothing.

## Commands
- `fm trace [--since D] [--run ID] [--cmd C]`: time per command, split into screen reads and actions; `--raw [N]` for lines.
- `fm incidents`, `fm incident <id>`: each saved screen (summarised) and the requests after it, the error, the stack.
- `fm incident fixture <id> <n> <name>`: an incident's screen as a test fixture (`test/screens/`).
- `fm friction stats`: game days per stop per day, friction by cause, repeats (a fix that didn't hold).
- `fm friction resolve <id> "<fix>" --cause <…> [--repeat-of <id>]`: the cause is required (`cli/friction.mjs` `CAUSES`).

## Why (docs/agent-workflow.md §2)
The loop only heals if each failure can be diagnosed from what was saved, and only shows it heals
if stops are counted. Game days per stop is our "miles per disengagement": it should rise. Friction
by cause separates the long tail of new screens (expected, shrinks as handlers cover it) from
timing failures (a sign the perception method, not a missing case, is at fault).
