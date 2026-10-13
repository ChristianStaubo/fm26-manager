# Contract screens: renewals and personal terms

How the contract screens behave. The decisions (who to renew, the wage cap, how far to move on
salary) live in `capabilities/contracts`, with the numbers in `playbook/policy.json` → `contracts`.

## Renewals: `fm renew "<name>" --club <club>`
Staff negotiate player contracts; we only start renewals. Profile → Actions → Contract →
**DoF To Negotiate Contract**. A dialog "DOF to negotiate contract?" is answered Yes automatically
(`KNOWN_DIALOGS`); ticking "Do not show this message again" in the game removes it. Afterwards the
Contract submenu shows "Change Contract Offer" / "Withdraw Contract Offer": that is how `renew`
verifies it worked.

Alternative (manual, not automated): Actions → "Discuss New Contract With Agent" opens an agent
chat with reply options; "End Chat" closes it.

## Personal terms for signings (`personal-terms.mjs`, autopilot)
When a club accepts our fee, the Director of Football negotiates the contract. If he finds the
demands unacceptable he hands it back: "Handle <player> contract negotiations" → Enter Contract
Negotiations / Walk Away. The handler: Enter → Finalize Promises → Negotiate Contract → Reset (the
agent's demands) → salary at each of `salary_factors` in turn → lower the Agent Fee only if
"Suggest Terms" is disabled (agent fee above the allowed maximum) → Suggest Terms → Finalize Deal →
Exit Talks. It keeps all bonuses and clauses (agents are firm on those).

- Entering talks lands in different places: promises, a "Negotiate Contract" step, **the contract
  form directly**, or Recruitment → Transfer Activity with the deal's **"Contract £…" link**
  (Cancel/Withdraw Offer are disabled there). The handler waits for any of them.
- "Pleased / acceptable, wants to think" is acceptance: stop raising the salary.
- "Cancel Negotiations" asks for confirmation in a dialog of the same name; its **Cancel keeps the
  talks alive**.
- The contract screen's "Avg." salary mixes in youth and reserves, so it is not used for the wage
  cap (`analysis/wage_bands.py` computes the first-team median instead).
