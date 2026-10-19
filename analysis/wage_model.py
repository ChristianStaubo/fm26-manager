#!/usr/bin/env python3
"""What we offer a signing per week (user, 2038-05-30, Holbem: CA 151, a backup, was heading for £145-150K
and "Important Player"; the user's read: £60-85K, Squad Player at most).

    market  = the median wage in our league of players within `within` CA of him (widened until min_peers):
              the going rate for his ability. Our own squad isn't the reference: a backup we got cheaply
              (£20K) would drag every later offer down, and league wages move with inflation.
    target  = market x role_factor[role]   (starter 1.0, backup 0.6, third / prospect 0.4)
    floor   = his current wage x floor_x   (he has to want to come)
    offer   = max(target, floor), at most role_cap[role] (none for a starter: the first-team cap applies)
    walk    = offer x walk_away_x: a demand above it is not negotiated
    promise = the playing time that matches the role (a backup is a Squad Player, never Important Player)

The role is where he would land in our depth chart if he joined (depth.roles), unless --role is given.

Usage: python3 analysis/wage_model.py --player "<name>" [--role starter|backup|third|prospect]
"""
import argparse
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import manager as m  # noqa: E402

DEFAULTS = {'within': 4, 'min_peers': 10, 'floor_x': 1.1, 'walk_away_x': 1.3,
            'role_factor': {'starter': 1.0, 'backup': 0.6, 'third': 0.4, 'prospect': 0.4},
            'role_cap': {'starter': None, 'backup': 90000, 'third': 60000, 'prospect': 60000},
            'promise': {'starter': 'Regular Starter', 'backup': 'Squad Player', 'third': 'Impact Sub', 'prospect': 'Squad Player'}}
W = {**DEFAULTS, **m.POLICY.get('contracts', {}).get('wage_model', {})}


def market_rate(wages_by_ca, ca, within=W['within'], min_peers=W['min_peers']):
    """Median league wage of players within `within` CA of `ca` (widened by 2 until min_peers). (wage, within, n)."""
    w = within
    while True:
        peers = [wage for c, wage in wages_by_ca if abs(c - ca) <= w]
        if len(peers) >= min_peers or w >= 20:
            return (int(st.median(peers)) if peers else None), w, len(peers)
        w += 2


def offer(market, role, current=None, w=W):
    """The pure model: market rate, role and current wage in, our offer out."""
    role = role if role in w['role_factor'] else 'third'
    target = int(market * w['role_factor'][role]) if market else None
    floor = int(current * w['floor_x']) if current else None
    best = max(x for x in (target, floor, 0) if x is not None)
    cap = w['role_cap'].get(role)
    out = min(best, cap) if cap else best
    return {'role': role, 'market': market, 'target': target, 'floor': floor, 'cap': cap, 'offer': out or None,
            'walk_away_above': int(out * w['walk_away_x']) if out else None, 'promise': w['promise'][role],
            **({'note': 'his current wage x floor_x is above the role cap: he may not come'} if cap and floor and floor > cap else {})}


def role_if_joined(rows, him, tactic):
    """Where he'd land in our depth chart if he joined; a developing prospect outside the XI is a prospect."""
    import depth
    joined = {**him, 'contract_club': m.CLUB, 'club': m.CLUB, 'on_loan_at': ''}
    _, roles = depth.roles([r for r in rows if r is not him] + [joined], tactic)
    role = roles.get(him['name'], (None, 'surplus'))[1]
    if role != 'starter' and m.developing(m.intval(him, 'age'), m.intval(him, 'ca'), m.intval(him, 'pa')):
        return 'prospect'
    return role if role in ('starter', 'backup', 'third') else 'third'


def model(rows, tactic, name, role=None):
    cands = [r for r in rows if r['name'] == name and str(r.get('ca') or '').isdigit() and not (r.get('club') or '').startswith('club#')]
    if not cands:
        return None
    him = max(cands, key=lambda r: (r['contract_club'] != m.CLUB, m.intval(r, 'ca')))
    league = [(m.intval(r, 'ca'), float(r['wage'])) for r in rows
              if r.get('competition') == m.LEAGUE and float(r['wage'] or 0) > 0 and str(r.get('ca') or '').isdigit() and r is not him]
    rate, within, n = market_rate(league, m.intval(him, 'ca'))
    current = float(him['wage'] or 0) or None
    out = offer(rate, role or role_if_joined(rows, him, tactic), current)
    return {'player': name, 'ca': m.intval(him, 'ca'), 'age': m.intval(him, 'age'), 'current': int(current or 0),
            'league': m.LEAGUE, 'market_within': within, 'market_n': n, **out}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--player', required=True)
    ap.add_argument('--role', choices=['starter', 'backup', 'third', 'prospect'])
    a = ap.parse_args()
    rows, tactic = m.load()
    print(json.dumps(model(rows, tactic, a.player, a.role)))


if __name__ == '__main__':
    main()
