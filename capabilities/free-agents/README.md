# free-agents: who can we get without a fee?
Implements playbook §1b and §5 (user, 2031-05-28: "free agents should be our number one thing").
Numbers: `playbook/policy.json` → `free_agents`.

**Interface:**
- `fm free [--max-age N] [--min-worth N] [--top N]`: free agents and contracts ending by the coming
  30 June, every position, ranked by **worth** (`analysis/free_agents.py`)
- runs by itself as a step of the `january` and `summer` checkpoints (`playbook/cycle.json`) and
  heads `fm plan` (`free_first`)
- acting: `fm precontract "<name>" --club <his contract club>` (January to June: joins free on 1 July),
  or `fm buy` for a player already free

**How:**
- one rule for "free": `manager.available_free` (no club and no contract, or a known contract
  ending by 30 June). A loanee counts on his **parent** club's contract (Ethan Mbappé: Lille, on loan
  at Holstein Kiel, ended June 2031, joined Monaco free; the old searches skipped all loanees)
- worth = the median value of players at his position with the same role attributes (±0.4) and age
  (±2): FM's own value of a player in his final months collapses (£0.2M), his resale doesn't
- `always_buy`: worth ≥ `always_buy_worth` (£30M). No fee, pure resale: always worth it (user)

**The judge:** `fm audit` asks about every `always_buy` player in the latest checkpoint report until
he's answered: an agent chat / pre-contract / bid in the decision log, or a recorded pass
(`fm intervene free_agents rejected --proposed "<name>" --decided "<why>"`).

**Timing matters:** by late May most of them have re-signed or agreed moves (Fortea → Bayern). The
`january` checkpoint is where they are won.

**Never:** bids or signs by itself; approvals as for any buy (playbook §10).
