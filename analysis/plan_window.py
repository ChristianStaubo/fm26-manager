#!/usr/bin/env python3
"""Evidence for transfer-window planning: where the XI needs strengthening, who
could be sold to fund it, and market targets that beat our starters within
budget. Prints JSON for the fm-moneyball skill. Method: docs/analysis/.

Usage:
    python3 analysis/plan_window.py --date 2026-06-22 --wage-room 40500
    python3 analysis/plan_window.py --date ... --wage-room ... --budget 41570000 --save "path/to/save.fm"

--wage-room is "Salary available" on Club > Finances (not in the save).
--budget defaults to the transfer budget remaining in the save.
"""
import argparse
import csv
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluate_offer as eo  # noqa: E402
import squad_report as sr  # noqa: E402

ASKING_MARKUP = 1.3      # clubs usually ask more than the displayed transfer value
WAGE_MARKUP = 1.25       # a moving player usually wants a raise
MAX_AGE = 29


def slot_needs(rows, tactic, club, today, cache):
    """Each XI slot: starter's output standing, cover, and a priority for strengthening."""
    ours = [p for p in rows if p['contract_club'] == club]
    by_name = {eo.plain(p['name']): p for p in ours}
    starters = {eo.plain(s['player']) for s in tactic['slots']}
    out = []
    for s in tactic['slots']:
        role, p = s['role'], by_name.get(eo.plain(s['player']))
        me = eo.role_standing(rows, p, role, cache) if p else None
        cover = []
        for q in ours:
            if eo.plain(q['name']) in starters or not sr.can_play(q, role) or int(q['age'] or 0) < 18:
                continue
            stq = eo.role_standing(rows, q, role, cache)
            if stq:
                cover.append(dict(name=q['name'], pct=stq['pct'], rank=f"{stq['rank']} {stq['league']}"))
        cover.sort(key=lambda c: -c['pct'])
        pct = me['pct'] if me else 0
        y = eo.years_left(p, today) if p else None
        flags = []
        if pct < 33:
            flags.append('weak starter')
        if p and int(p['age']) >= 33:
            flags.append(f"starter is {p['age']}")
        if y is not None and y < 1:
            flags.append('starter contract expires within a year')
        if not cover or cover[0]['pct'] < 33:
            flags.append('no good cover')
        priority = (100 - pct) + 15 * any(f.startswith('starter is') for f in flags) \
            + 15 * ('starter contract expires within a year' in flags) + 10 * ('no good cover' in flags)
        out.append(dict(slot=s['slot'], role=role, starter=s['player'],
                        starter_output=me['output'] if me else None, starter_pct=pct,
                        starter_rank=f"{me['rank']} {me['league']}" if me else 'unknown',
                        starter_age=int(p['age']) if p else None, starter_contract=p['contract_expires'] if p else None,
                        cover=cover[:3], flags=flags, priority=round(priority)))
    return sorted(out, key=lambda n: -n['priority'])


def sale_candidates(rows, tactic, club, today, cache):
    """Players whose sale could fund signings: value above output, sell-high signals, surplus, ageing."""
    starters = {eo.plain(s['player']) for s in tactic['slots']}
    out = []
    for p in rows:
        if p['contract_club'] != club or int(p['value']) < 3e6 or int(p['value']) >= sr.NOT_FOR_SALE:
            continue
        stand = {r: eo.role_standing(rows, p, r, cache) for r in sr.ROLES if sr.can_play(p, r)}
        stand = {r: v for r, v in stand.items() if v}
        best = max(stand.items(), key=lambda kv: kv[1]['pct']) if stand else None
        pct = best[1]['pct'] if best else None
        value, age = int(p['value']), int(p['age'])
        reasons = []
        if pct is not None and pct < 40 and value >= 15e6 and best[1]['ranked']:
            reasons.append(f'value £{value / 1e6:.0f}M but output only {pct}th percentile')
        if sr.num(p, 'goals') - sr.num(p, 'xg') >= 3:
            reasons.append(f"{sr.num(p, 'goals'):.0f} goals from {sr.num(p, 'xg'):.1f} xG: overperformance")
        if p['mins'] < sr.MIN_MINUTES and value >= 15e6 and age >= 22 and not p['on_loan_at']:
            reasons.append(f"£{value / 1e6:.0f}M of value for {p['mins']} minutes")
        if age >= 30 and value >= 5e6:
            reasons.append(f'age {age}: value only falls from here')
        if not reasons:
            continue
        out.append(dict(name=p['name'], age=age, value=value, wage_pw=int(p['wage'] or 0),
                        contract_expires=p['contract_expires'], starter=eo.plain(p['name']) in starters,
                        best_role=best[0] if best else None, output_pct=pct,
                        rank=f"{best[1]['rank']} {best[1]['league']}" if best else None,
                        on_loan_at=p['on_loan_at'] or None, reasons=reasons))
    return sorted(out, key=lambda c: (c['starter'], -c['value']))


def targets(rows, need, league, club, budget, wage_room):
    """Market players who would beat the starter in this slot, within budget and wage room."""
    max_fee = budget / ASKING_MARKUP
    max_wage = wage_room / WAGE_MARKUP
    min_output = need['starter_output'] if need['starter_output'] is not None else None
    cands = sr.market_candidates(rows, need['role'], league, club, max_value=max_fee, max_wage=max_wage,
                                 max_age=MAX_AGE, min_output=min_output)
    out = []
    for c in cands[:5]:
        p = c['p']
        out.append(dict(name=p['name'], club=p['club'], league=c['league'], age=int(p['age']),
                        positions=p['positions'], output=round(c['output'], 3), rank=f"{c['rank']}/{c['pool']}",
                        attr_pct_vs_our_league=round(c['attr_pct']), value=int(p['value']),
                        wage_pw=int(p['wage'] or 0), contract_expires=p['contract_expires'],
                        max_bid=round(int(p['value']) * ASKING_MARKUP, -5),
                        max_wage_pw=round(int(p['wage'] or 0) * WAGE_MARKUP, -2),
                        nation=p['nation']))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--date', required=True, help='in-game date, YYYY-MM-DD')
    ap.add_argument('--wage-room', type=float, required=True, help='salary available per week, £')
    ap.add_argument('--budget', type=float, help='transfer budget, £ (default: remaining budget in the save)')
    src = ap.add_mutually_exclusive_group()
    src.add_argument('--save', default='latest')
    src.add_argument('--csv')
    ap.add_argument('--club', default=eo.CLUB)
    ap.add_argument('--tactic', default=str(sr.ROOT / 'config' / 'tactic.json'))
    a = ap.parse_args()

    today = dt.date.fromisoformat(a.date)
    csv_path = a.csv or sr.export_save(a.save)
    tactic = json.loads(Path(a.tactic).read_text(encoding='utf-8'))
    sr.apply_tactic(tactic)
    rows = sr.load(csv_path)
    clubs_csv = Path(csv_path).with_name(Path(csv_path).stem + '_clubs.csv')
    fin = next((r for r in csv.DictReader(open(clubs_csv, encoding='utf-8')) if r['club'] == a.club), {}) \
        if clubs_csv.exists() else {}
    budget = a.budget if a.budget is not None else float(fin.get('transfer_remaining') or 0)
    league = sr.st.mode([p['competition'] for p in rows if p['club'] == a.club and p['competition']])

    cache = {}
    needs = slot_needs(rows, tactic, a.club, today, cache)
    sales = sale_candidates(rows, tactic, a.club, today, cache)
    for n in needs:
        n['targets'] = targets(rows, n, league, a.club, budget, a.wage_room) if n['priority'] >= 60 else []
    window_days = eo.days_to_window_close(today)
    notes = []
    if today.month in (1, 2):
        notes.append('January window: prices are inflated and clubs are reluctant to sell; buy only for clear needs')
    if window_days <= 14:
        notes.append(f'window closes in {window_days} days: prefer deals that can complete quickly')
    print(json.dumps(dict(
        date=a.date, days_to_window_close=window_days, notes=notes,
        budget=dict(transfer=budget, wage_room_pw=a.wage_room,
                    transfer_budget_total=float(fin.get('transfer_budget') or 0),
                    wage_budget_pw=float(fin.get('wage_budget_pw') or 0)),
        pricing_assumptions=dict(asking_markup=ASKING_MARKUP, wage_markup=WAGE_MARKUP, max_age=MAX_AGE),
        needs=needs, sale_candidates=sales,
    ), indent=2, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
