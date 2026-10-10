"""Results log: one row per checkpoint (window close, season end) for the experiment's scoreboard.

The money matters as much as the table (user, 2026-10-10): club balance, transfer budget, first-team
value, wage bill and age, from the save export; league position and points from the user/screen.

  python3 analysis/results.py --date YYYY-MM-DD [--label "end of 2026/27"] [--position 11] [--points 52]
Appends to local/reports/<save>-results.md and prints the row as JSON.
"""
import argparse, csv, json, statistics as st
from pathlib import Path
import manager as m

sr = m.sr
ROOT = Path(__file__).resolve().parent.parent


def snapshot(rows, clubs_csv):
    first = sorted((p for p in rows if p['contract_club'] == m.CLUB and not p['on_loan_at']), key=lambda p: -sr.num(p, 'wage'))[:25]
    club = next((r for r in csv.DictReader(open(clubs_csv)) if r['club'] == m.CLUB), {}) if clubs_csv.exists() else {}
    num = lambda k: int(float(club[k])) if club.get(k) not in (None, '') else None
    return {'first_team_value': sum(int(p['value'] or 0) for p in first),
            'wage_bill_pw': sum(int(p['wage'] or 0) for p in first),
            'avg_age': round(st.mean(int(p['age'] or 0) for p in first), 1),
            'club_balance': num('month_end_balance'), 'finances_month': club.get('month_end'),
            'income_12m': num('income_12m'), 'expenditure_12m': num('expenditure_12m')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--date', required=True); ap.add_argument('--label', default='')
    ap.add_argument('--position', type=int); ap.add_argument('--points', type=int); ap.add_argument('--csv')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    save = m.sr.CLUB_CONFIG['save_pattern'].replace('.fm', '').replace('*', '')
    snap = {'date': a.date, 'label': a.label, 'position': a.position, 'points': a.points,
            **snapshot(rows, ROOT / 'local' / 'exports' / f'{m.sr.latest_save().stem}_clubs.csv')}
    out = ROOT / 'local' / 'reports' / f'{save}-results.md'
    money = lambda v: '-' if v is None else f"£{v / 1e6:.1f}M"
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f"# {save} results\n\n| date | checkpoint | pos | pts | club balance | income-exp 12m | first-team value | wage bill/wk | avg age |\n|---|---|---|---|---|---|---|---|---|\n")
    net = None if snap['income_12m'] is None else snap['income_12m'] - snap['expenditure_12m']
    with out.open('a') as f:
        f.write(f"| {a.date} | {a.label} | {a.position or '-'} | {a.points or '-'} | {money(snap['club_balance'])} | {money(net)} | "
                f"{money(snap['first_team_value'])} | £{snap['wage_bill_pw'] // 1000}K | {snap['avg_age']} |\n")
    print(json.dumps({**snap, 'file': str(out.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
