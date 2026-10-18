#!/usr/bin/env python3
"""The sell (listing) decision table (user, 2033-09-01): who we list for sale or for loan in the summer
window, and at what price (JSON on stdout).

From the depth chart (depth.py) and the player's age and wage:
  sell   surplus (no starter/backup/third role anywhere), 22+         → price: surplus row of the table
  sell   30+ backup or third, wage above the first-team median, the position meets the depth standard
         without him (Truffert)                                         → backup/third senior price
  sell   30+ starter (cash in at peak; the buy table replaces him)    → starter senior price
  sell   a lucky scoring season: 26+, goals >= xG + overperformer_goals_over_xg (Gray, 25 from 17.05 xG,
         2036): his value peaks now, finishing regresses                → his role's price
  loan   prospects (<= 21, or <= 23 with PA >= 160) outside the depth chart, PA >= 130: develop, resell
  sell   a prospect over the portfolio limit (wonderkids.portfolio_max, PA >= portfolio_min_pa): the
         weakest go (user, 2026-10-18); or one paid like a first-teamer (> buying.table.backup_max_wage:
         no loan club pays it; Schmitt, 23, £89.5K/wk in the U21s)
  let-go young players with PA < 130, and surplus worth < £1M: NOT listed (the U21s need players); a bid
         at the surplus price is accepted, the contract runs out (user, 2033-09-01)
  (every 30+ starter may be listed in one window: the user, 2033-09-01)
  keep   everyone else
The executor never lists a player whose listing would upset him (FM's "might become upset" popup:
Highly Influential): it waits for bids instead.

Usage: python3 analysis/sell_table.py [--leaving "Name,Name"]
"""
import argparse
import json

import manager as m
import depth
import squad_report as sr
import wage_bands

S = m.POLICY['selling']
T = S['sell_by_role_age']
P = {'max_age': 21, 'older_max_age': 23, 'older_min_pa': 160, 'min_pa': 130, 'list_min_value': 1e6, **S.get('prospects', {})}
MAX_KID_WAGE = m.POLICY.get('buying', {}).get('table', {}).get('backup_max_wage', 80000)


def band(age, position=None):
    # Keepers age later (user, 2034-07-03: 33 is a keeper's 30).
    senior = T.get('senior_from_age_by_position', {}).get(position, T['senior_from_age'])
    return 'rising' if age <= S['sell_rising']['max_age'] else 'senior' if age >= senior else 'prime'


def table(rows, tactic, leaving=()):
    leaving = set(leaving)
    rows = [r for r in rows if r['name'] not in leaving]
    median = wage_bands.bands(rows, m.CLUB)['median']
    ours = m.our_squad(rows)   # loanees back within 60 days too: each gets loan again / promote / sell
    out = []
    for p in ours:
        age, value, wage = m.intval(p, 'age'), float(p['value'] or 0), float(p['wage'] or 0)
        d = depth.role(rows, tactic, p['name'])
        role, ok = d['role'], d['depth_ok_without']
        b = band(age, d.get('position'))
        price = lambda r: round(value * T[r][b] / 50000) * 50000
        pa = m.intval(p, 'pa')
        prospect = age <= P['max_age'] or (age <= P['older_max_age'] and pa >= P['older_min_pa'])
        gx = sr.num(p, 'goals_minus_xg')
        if gx >= S.get('overperformer_goals_over_xg', 99) and age >= S.get('overperformer_min_age', 99):
            action, why, ask = 'sell', f"lucky season: {sr.num(p, 'goals'):.0f} goals from {sr.num(p, 'xg'):.1f} xG; his value peaks now", price(role)
        elif role == 'surplus' and prospect and pa >= P['min_pa'] and wage > MAX_KID_WAGE:
            action, why, ask = 'sell', f'prospect on £{int(wage / 1000)}K/wk (> £{int(MAX_KID_WAGE / 1000)}K): no loan club pays it', price('surplus')
        elif role == 'surplus' and prospect and pa >= P['min_pa']:
            action, why, ask = 'loan', 'prospect outside the depth chart: develop on loan', None
        elif role == 'surplus' and (prospect or value < P['list_min_value']):
            # Not listed (user, 2033-09-01): a bid is accepted, the contract runs out; the U21s need players.
            action, why, ask = 'let-go', (f'young, PA {pa} < {P["min_pa"]}' if prospect else f'surplus worth < £{P["list_min_value"] / 1e6:.0f}M') + ': not listed; accept a bid, don\'t renew', price('surplus')
        elif role == 'surplus':
            action, why, ask = 'sell', 'surplus: no starter/backup/third role', price('surplus')
        elif role in ('backup', 'third') and b == 'senior' and wage > median and ok:
            action, why, ask = 'sell', f'30+ {role} on £{int(wage / 1000)}K/wk (> median £{int(median / 1000)}K), depth holds without him', price(role)
        elif role == 'starter' and b == 'senior':
            action, why, ask = 'sell', '30+ starter: cash in at peak; the buy table replaces him', price('starter')
        else:
            continue
        out.append({'name': p['name'], 'age': age, 'ca': m.intval(p, 'ca'), 'pa': m.intval(p, 'pa'), 'position': d.get('position'),
                    'role': role, 'value': int(value), 'wage': int(wage), 'action': action, 'ask': ask, 'why': why, 'surplus_ask': price('surplus'),
                    **({'on_loan_at': p['on_loan_at'], 'back': (p.get('loan_ends') or '')[:10]} if p.get('on_loan_at') else {})})
    # The portfolio limit (user, 2026-10-18): over wonderkids.portfolio_max prospects at PA >= portfolio_min_pa,
    # the weakest (lowest PA, then oldest) are sold rather than loaned again; bought ones only fill room.
    W = m.POLICY.get('wonderkids', {})
    top = sorted((x for x in out if x['action'] == 'loan' and x['pa'] >= W.get('portfolio_min_pa', 170)), key=lambda x: (-x['pa'], x['age']))
    for x in top[W.get('portfolio_max', 6):]:
        x.update(action='sell', ask=x['surplus_ask'], why=f"portfolio over the limit ({len(top)} > {W.get('portfolio_max', 6)} prospects at PA {W.get('portfolio_min_pa', 170)}+): the weakest goes")
    for x in out:
        x.pop('surplus_ask', None)
    order = {'sell': 0, 'loan': 1, 'let-go': 2}
    return sorted(out, key=lambda x: (order[x['action']], -(x['ask'] or 0)))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    ap.add_argument('--leaving', default='')
    a = ap.parse_args()
    rows, tactic = m.load(a.csv)
    print(json.dumps(table(rows, tactic, [x.strip() for x in a.leaving.split(',') if x.strip()]), default=str))
