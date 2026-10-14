# How we build autonomous agents (the workflow)

A reference for any agent picking this up cold, in this repo or another domain (the hotel
booking-link and discount agents use the same loop). The FM26 manager is the worked example.
Goal: the agent does the job **by itself**, and earns that autonomy one capability at a time.

## 1. Aim at the outcome, with a scoreboard
- State the goal as an outcome, not a task ("run the club and make money", not "buy a CB").
- Turn it into numbers before building: one **objective** plus **constraints that stop gaming it**.
  FM: objective = net transfer profit, cumulative (not per window, so big spending that pays back
  is fine); constraints = wages within a range of the budget, squad quality holds, never relegated.
  Vague goals ("make money") don't work; a scoreboard does.

## 2. The loop: player → judge → fixer
- **Player:** a cheaper model does the work through a CLI of tools, one segment at a time. It
  stops early and cleanly when the tools fall short (a friction report: goal, what it tried, what
  happened). Clean early stops beat clever workarounds.
- **Judge (outside, deterministic):** checks the state after every action and at every stop. Never
  let the actor grade itself. Every check is something a human once caught by eye. Classes:
  `fail` = a defect the tools must fix (files friction), `decide` = the human's call (an approval
  stop, no friction), `warn` = worth a look. FM: `fm audit`.
- **Fixer:** a stronger model reads the friction and the live state, fixes the **owning layer**
  (screen handler, decision rule, route map, known dialog), leaves a **test that replays the
  failure**, commits, resumes the player. The human is only paged when the fixer can't proceed.

## 2b. The loop over the loop: a supervisor instead of the human
Novel situations (a work permit rejected, a press conference, a promise screen) used to go to the
human. The **supervisor** (the stronger model, also the fixer) now decides them: within the
playbook and scoreboard, preferring reversible choices, writing its reasoning, logging each call as
a `supervisor-decision`. The human is paged only for money beyond their approvals and big
irreversible moves with no precedent. The human reviews supervisor decisions later
(`review-agreed` / `review-overturned`): agreement promotes that kind of call; an overturn becomes
a rule + test, exactly like a correction. The human moves from *in* the loop to *grading* it.

## 3. Autonomy is earned, by rule
- Every capability is `approve` or `auto` (FM: `policy.json` → `autonomy`). Start new or risky
  capabilities (money, irreversible actions) on `approve`.
- **Intervention ledger:** every human decision is logged: approved unchanged, approved changed,
  rejected, or a correction the agent never proposed. Interventions per window is the metric.
- **Promote by rule:** N proposals in a row approved unchanged, and every correction guarded by a
  test → eligible for `auto`. **Demote by rule:** an `auto` capability corrected without a guard.
- Approvals are specific: one item, one action, one limit (buy up to £X, sell from £Y). The tools
  refuse anything outside them. A **hold** list keeps the agent off deals the human is deciding.

## 4. Discover rules, don't guess them
Bad strict rules are worse than loose ones: write rules from observed failures, not imagination.
When the human corrects the agent, find the **principle** under the call, then test it on data:
1. The human's gut: "re-signing for slightly higher wages is fine, we can always resell."
2. The principle: a contracted player is a sellable asset; a final-year one is losing value.
3. A deterministic test: renew when value protected ≥ 1.5× the renewal's cost.
4. **Backtest on history, out of sample** (fit on earlier periods, judge on the latest). It
   corrected us: the final year costs −31% to −51% of value, and renewing stops the slide but does
   not restore the old value, so the test uses the current value and a holding-period cost.
5. Encode (policy number + pure function + test), and log it as a dated hypothesis to compare with
   what actually happens.
Other examples from FM: "young + strong attributes + cheap for them" doubled the 1-year +50% value
rate out of sample (43% vs 24%); "players who just signed won't talk" became a filter.

## 5. Safety rails for irreversible actions
- **Preview before commit:** show the exact payload before the irreversible click and let the
  human check. A preview caught a contract offer that would have sent £490/wk instead of £70K.
- **Read before and after acting;** outputs only prove an action was invoked. Never retry blindly.
- **One probe, then fix in code.** Exploring an unmapped screen by trial and error is how bad
  offers happen. Better: a **mapping session**: the human does the action once while the agent
  reads the screen after each step; that becomes the tool.
- Wait for the counterpart's reply to **change** before reading it (a stale line read as an answer
  sent a second offer over an accepted one).

## 6. Depth: the field's real instruments
- Use raw data and real methods (exports, backtests), not summaries.
- Hard, specific goals beat "do your best".
- A red team before a proposal reaches the human: argue against each move (wages × years, release
  clauses, sell-ons, the price vs comparable players).

## 7. How the human helps
- Write the scoreboard once.
- Say "rule:" when correcting: it becomes a test the same day.
- Let it run unsupervised on a copy (sandbox) first.
- Do mapping sessions for unmapped actions instead of explaining them.

## Where this lives in the FM repo
- Playbook and numbers: `playbook/PLAYBOOK.md`, `playbook/policy.json` (`scoreboard`, `autonomy`,
  `autonomy_promotion`, `contracts.renewal`).
- Judge: `capabilities/audit/`; ledger: `capabilities/interventions.mjs` (`fm autonomy`);
  approvals/holds: `capabilities/approvals.mjs`; plan: `capabilities/plan/`.
- Backtests: `analysis/backtest_resale.py`, `analysis/backtest_contracts.py`.
- Loop roles: `CLAUDE.md` (player → fixer), `.claude/agents/fm-player.md`.
- Running notes and open hypotheses: `notes/loop-engineering.md` (local, not committed).
