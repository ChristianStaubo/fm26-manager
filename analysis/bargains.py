#!/usr/bin/env python3
"""Bargains (user, 2034-08: Rosete, Esajas, Finck were the buys we wanted and no filter found them):
players priced well below what players of their quality and age usually cost (JSON on stdout).

Three lists, position-free (resale buys: one who'd start plays, the rest go on loan):
  undervalued  value <= typical / undervalued_ratio, age <= max_age, CA >= the squad's backup level;
               typical = median value of players within +-3 CA and +-1 year (enough of them)
  buried       age <= buried_max_age, PA >= buried_min_pa, CA well below (a big club's reserves: PSG)
  (wonderkids are the buy table's list)
Caps per window: at most `per_window` buys and `max_spend` in all (policy buying.bargains).

Usage: python3 analysis/bargains.py
"""
import argparse
import json
import statistics as st

import manager as m

B = {'undervalued_ratio': 2.0, 'max_age': 25, 'max_fee': 20e6, 'buried_max_age': 24, 'buried_min_pa': 185,
     'buried_max_ca': 150, 'per_window': 4, 'max_spend': 40e6, 'min_cell': 15, 'top': 8,
     **m.POLICY.get('buying', {}).get('bargains', {})}


def value(p):
    return float(p['value'] or 0)


def priced_pool(rows):
    iv = m.intval
    return [p for p in rows if 0 < value(p) < 1e9 and iv(p, 'ca') >= 100 and 16 <= iv(p, 'age') <= 34
            and not (p['club'] or '').startswith('club#')]


def typical_values(rows, pool=None):
    """typical(p): the median value of players within +-3 CA and +-1 year of age: what a player of his
    quality and age costs, whatever his own contract (an expiring player's FM value collapses: Rusnák
    £4.3M vs typical £25.2M, 2036). Shared with free_agents.py.
    Fewer than min_cell compare: the CA band widens (+-6, +-9) until enough do; at the top of the game
    only weaker players are added, so it is a floor (Alexandre Luiz, CA 178, was priced at his collapsed
    FM value, £16.7M, below a CA 147, 2036-05). None when even +-9 is too few."""
    iv, cells = m.intval, {}
    for p in (pool if pool is not None else priced_pool(rows)):
        cells.setdefault((iv(p, 'ca') // 3, iv(p, 'age')), []).append(value(p))

    def typical(p):
        for k in (1, 2, 3):
            vs = [v for dc in range(-k, k + 1) for da in (-1, 0, 1) for v in cells.get((iv(p, 'ca') // 3 + dc, iv(p, 'age') + da), [])]
            if len(vs) >= B['min_cell']:
                return st.median(vs)
        return None
    return typical


def scan(rows, squad_avg=None):
    iv = m.intval
    pool = priced_pool(rows)
    typical = typical_values(rows, pool)

    ours = sorted((iv(p, 'ca') for p in rows if p['contract_club'] == m.CLUB), reverse=True)
    squad_avg = squad_avg or (round(sum(ours[:22]) / max(1, len(ours[:22]))) if ours else 140)
    backup_level = squad_avg - 10
    card = lambda p, **x: {'name': p['name'], 'club': p['contract_club'], 'age': iv(p, 'age'), 'positions': p['positions'],
                           'ca': iv(p, 'ca'), 'pa': iv(p, 'pa'), 'value': int(value(p)), 'wage': int(float(p['wage'] or 0)),
                           'competition': p.get('competition', ''), **x}
    under, buried = [], []
    for p in pool:
        if p['contract_club'] in (m.CLUB, '') or p.get('on_loan_at'):
            continue
        age, ca, pa, v = iv(p, 'age'), iv(p, 'ca'), iv(p, 'pa'), value(p)
        if age < 18 or v > B['max_fee']:
            continue
        if age <= B['max_age'] and ca >= backup_level:
            t = typical(p)
            if t and t / v >= B['undervalued_ratio']:
                under.append(card(p, typical=int(t), ratio=round(t / v, 1)))
        if age <= B['buried_max_age'] and pa >= B['buried_min_pa'] and ca <= B['buried_max_ca']:
            buried.append(card(p))
    under.sort(key=lambda c: -c['ratio'])
    buried.sort(key=lambda c: (-c['pa'], c['value']))
    return {'squad_avg': squad_avg, 'backup_level': backup_level, 'caps': {'per_window': B['per_window'], 'max_spend': B['max_spend']},
            'undervalued': under[:B['top']], 'buried': buried[:B['top']]}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    print(json.dumps(scan(rows), default=str))
