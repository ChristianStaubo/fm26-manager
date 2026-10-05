# Initial sporting decision guidelines

These are proposed starting policies, not implemented skills. Refine them
with the user's football guidance and evidence from this save.

## Squad planning

- Keep at least two fit, available, eligible senior goalkeepers. Three is the
  normal target: starter, reliable backup, and third option/developing keeper.
- If only two are available, do not sell one unless a suitable replacement is
  secured before departure. A shortlisted player is not a secured replacement.
- Assess goalkeepers beyond the raw player count: injuries, pending departures,
  loans, registration, quality of cover, and availability matter.
- Aim for starter and credible cover for every role in the chosen tactic.
  Account for fixture load and players who cover multiple positions; do not
  count one versatile player as independent cover for several simultaneous
  absences. A rigid two-per-position roster is not required.
- Check domestic and European registration rules in-game, including homegrown
  implications, before sales or purchases. Do not infer eligibility from names.

## Sales

Evaluate guaranteed proceeds and payment timing separately from contingent
bonuses. Include loyalty payments, wage contributions, and other selling
costs. Check the player's wage, contract length, playing time, performance,
role fit, age, and feasible replacement cost. Compare competing offers on
terms and likelihood of completion, not headline fee alone.

Preserve depth and registration. Prefer a conditional recommendation when
replacement or coverage is unresolved. Non-negotiable offers cannot be
countered in that transaction; identify other options without pretending
negotiation is available. Acceptance is not proof of a completed sale.

## Transfer negotiation playbook

Revenue is an explicit goal of the experiment: sell at profitable values,
buy below value. Staff handle player contract negotiations; we handle fees.
The numbers below live in `tasks/transfers/rules.json`, which is authoritative.
Summary: counter first at 1.20 × the top of the value range, then 1.10;
accept a reply at 1.05 × or more; at most three counters. Counter agent
payoffs at 65% of the ask and accept at 80% or less. We operate only
during transfer windows and holiday through the season.

**Reference price.** Use the in-game Transfer Value range as the anchor;
call its top `V_high`. It is a reference, not a ceiling. Compare offers on
guaranteed money (up-front plus instalments). Count appearance or success
add-ons at a discount by likelihood, and subtract selling costs (solidarity
%, loyalty payments, money still owed on the original transfer).

**Selling.**
- Never accept a first negotiable offer. Counter at 1.20 × `V_high` (or
  10% above their offer, if that is higher), with the money up front.
- If they accept our counter, done. If their reply is at least
  1.05 × `V_high`, accept; otherwise counter at 1.10 × `V_high`.
- Bids far below the range (under half of `V_low`) are rejected rather
  than countered; a large jump lost Wrexham's bid.
- Below the value range: counter at or above `V_high`, or reject if the
  player matters and the gap is wide.
- Push harder with competing interest (several clubs or offers), a long
  contract, or a key player. Take reasonable money sooner with under one year
  left, an unhappy player or a transfer request, or a fading veteran.
- Limit to about three counters per deal, then decide; note any deadline.
- Ask for a sell-on clause when selling young players.
- Non-negotiable offers: accept or reject only. Use alternative bidders or
  "Generate Market Interest" for leverage instead.

**Buying.** Set a walk-away maximum before the first bid. Open near the low
end of the value range (lower if the selling club wants to offload). Raise
in small steps and prefer instalments or appearance add-ons to up-front cash.
Stop at the maximum.

**Calibration.** Record each negotiation (offer, our counter, their reply,
outcome) in the run folder. Adjust the counter percentages once we see how the
AI responds; whether it withdraws after counters is not yet known.

## Purchases and contracts

Define the role and need first. Check enough relevant minutes, competition
strength, team context, scouting knowledge, availability, and attainable terms.
Consider loans, promotion, or keeping an existing player before buying.

Set a maximum total commitment before negotiating: guaranteed fee,
instalments, likely bonuses, wages over contract duration, signing and agent
fees, wage rises, and significant clauses. Check playing-time promises and
registration. Do not sign a nominal bargain that displaces needed spending
or creates unsustainable wage obligations.

## Tactical review

Use multiple matches and context; never change tactics because of one result.
Look at chance creation and prevention, xG where available, shot quality,
set pieces, possession/progression, personnel fit, opponent strength, injuries,
and score effects. Separate finishing variance from repeatable weaknesses.

State a hypothesis, choose one limited adjustment, and record an evaluation
period and success criteria before changing it. Avoid repeatedly tuning to
recent losses or claiming causation from descriptive stats. Preseason results
and heavily rotated lineups are weak evidence for competitive performance.

## Recommendation format

Decision; evidence date; financial impact; squad/registration impact;
alternatives/replacements; missing facts; conditions; confidence and reason.
Use `investigate` when a critical fact is unknown.
