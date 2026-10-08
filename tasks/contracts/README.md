# Contracts

The user's rule: **staff negotiate player contracts.** We only start renewals.

`fm renew "<name>" --club <club>` → profile → Actions → Contract → **DoF To Negotiate Contract**.
A dialog "DOF to negotiate contract?" (negotiating without talking to the agent first) is
answered Yes automatically (`KNOWN_DIALOGS`); ticking "Do not show this message again" in the
game removes it. Afterwards the Contract submenu shows "Change Contract Offer" / "Withdraw
Contract Offer" — that is how `renew` verifies it worked.

Check expiring contracts at the start of every window (export column `contract_expires`):
anything expiring on 30 June must be renewed before then or the player leaves for free.

Alternative (manual, not automated): Actions → "Discuss New Contract With Agent" opens an agent
chat with reply options; "End Chat" closes it.

## Personal terms for signings (`personal-terms.mjs`, autopilot)
When a club accepts our fee, the General Manager/DoF negotiates the contract. If he finds the
demands unacceptable he hands it back: "Handle <player> contract negotiations" → Enter Contract
Negotiations / Walk Away. The handler: Enter → Finalize Promises → Negotiate Contract → Reset (the
agent's demands) → Salary at 85% (then 95%, 100%) → lower the Agent Fee only if "Suggest Terms" is
disabled (agent fee above the allowed maximum) → Suggest Terms → Finalize Deal → Exit Talks.
Keeps all bonuses and clauses (agents are firm on those). Stops for a decision when the demand
exceeds 2× the squad's average salary (`rules.json` → `contracts`).

## Personal terms handed back to us (2026-07-16, Camara)
- Wage cap: **first-team median × 1.3** (top 25 earners, `analysis/wage_bands.py`; £51.5K → £66.9K
  in July 2026). The contract screen's "Avg." mixes in youth/reserves (squad median £7K) and made a
  normal £36–44.5K first-team demand look like 2× average (user, 2026-10-08). Above the cap: stop
  for a decision with the form left open.
- Entering talks lands in different places: promises, a "Negotiate Contract" step, **the contract
  form directly**, or Recruitment → Transfer Activity with the deal's **"Contract £…" link**
  (Cancel/Withdraw Offer are disabled there). The handler waits for any of them.
- Verified live: Camara's agent was "satisfied" at £38.5K p/w → Finalize Deal → Exit Talks.
- "Cancel Negotiations" asks for confirmation in a dialog of the same name; its **Cancel keeps the
  talks alive**.
