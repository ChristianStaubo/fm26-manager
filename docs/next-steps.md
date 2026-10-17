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

## Audit items still to address
See the audit's top 10; summarised in the conversation of 2026-10-17.
