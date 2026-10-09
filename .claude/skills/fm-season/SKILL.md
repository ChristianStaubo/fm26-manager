---
name: fm-season
description: Run the FM26 Moneyball experiment season by season — transfer window work, then holiday through the season, then a season report. Use when the user says to play/continue the season, start the experiment, or "handle everything".
---

# Season cycle

The experiment: manage `config/club.json`'s club for transfer profit while competing. You act only
in transfer windows; the rest of the season the manager is on holiday and staff run the team.
Windows and holiday settings: `capabilities/season/season.json`. Skills: **fm-operate**,
**fm-moneyball**, **fm-transfers**.

## Cycle
1. **Window opens** (start of save, ~mid-June, 1 January):
   - Save → `fm-moneyball` analysis → plan → show the user the plan (once per window) →
   - execute: `fm renew` (expiring contracts), `fm sell` (sell-high list), `fm buy` (targets).
2. **During the window**: `node cli/fm.mjs run` — handles bids for our players and payoffs;
   stops for purchases follow-ups and judgment calls. Resolve, then `fm run` again.
   Re-check the plan if a key player leaves or a target is lost.
3. **Window closes** (`fm run` returns `window-closed`):
   `node cli/fm.mjs holiday --season` — back on 28 May (season over, stats complete). It re-starts
   the holiday whenever FM ends it early for a manager decision (the assistant settles those).
   Summer window: holiday ends 28 May → step 4 → step 1. January window: holiday
   `--until` 1 January, then a short window cycle, then holiday again to 28 May.
4. **Season report** (28 May): league position (Portal → Stages), transfer profit from
   `local/runs/decisions.jsonl` + the finances in the squad report, best/worst signings,
   what to change in policy.json. Show it to the user.

## Rules from the user
- Unfamiliar one-off manager decisions (captaincy, friendlies, …) outside transfers: go on holiday;
  the assistant settles them (`fm holiday --season`, or `--days 1` mid-window).
- Holiday: tick "Use team selection where possible" (user, 2026-10-09: our signings must play; watch injuries, revert if they pile up).
- Contracts are negotiated by staff (DoF); we never haggle wages unless a bid requires it.
- Selling style and numbers: `playbook/policy.json`; revenue is a stated goal.
- Ask the user before big irreversible moves not in the agreed plan (e.g. selling a key starter).
