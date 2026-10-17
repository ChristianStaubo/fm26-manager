#!/usr/bin/env python3
"""Our depth chart by CA for our formation, and one player's role in it (JSON on stdout).

The user's depth standard (2033-08-17): per position one starter (per slot), one natural backup, and a
third player who can cover. U21 players count; players out on loan don't. Naturals (rated 18+ there)
rank first for starter/backup; cover players (15-17) only count towards the third.

role: starter | backup | third | surplus, at his most important position; depth_ok_without: does the
position still meet the standard if he leaves? (If not, selling him needs a replacement: price him as
a starter.)

Usage: python3 analysis/depth.py --player "Adrien Truffert"   (or no --player: the whole chart)
"""
import argparse
import json

import manager as m

ROLES = ['starter', 'backup', 'third', 'surplus']


def best_rating(p, slot):
    return max(m.rating(p, x) for x in m.SLOT_POSITIONS[slot])


def chart(rows, tactic):
    ours = [p for p in rows if p['contract_club'] == m.CLUB and not p.get('on_loan_at') and m.intval(p, 'age') >= 16]
    positions = {}
    for s in tactic['slots']:
        if s['slot'] in m.SLOT_POSITIONS:
            positions.setdefault(m.GROUP.get(s['slot'], s['slot']), []).append(s['slot'])
    out = {}
    for pos, slots in positions.items():
        slot = slots[0]
        able = [p for p in ours if best_rating(p, slot) >= 15]
        ranked = sorted(able, key=lambda p: (best_rating(p, slot) < 18, -m.intval(p, 'ca')))
        out[pos] = {'slots': len(slots), 'players': [
            {'name': p['name'], 'ca': m.intval(p, 'ca'), 'pa': m.intval(p, 'pa'), 'age': m.intval(p, 'age'), 'natural': best_rating(p, slot) >= 18} for p in ranked]}
    return out


def depth_ok(players, slots):
    """Starters for every slot + a natural backup + a third who can cover."""
    return len(players) >= slots + 2 and players[slots]['natural']


def role(rows, tactic, name):
    best = None
    for pos, v in chart(rows, tactic).items():
        names = [x['name'] for x in v['players']]
        if name not in names:
            continue
        i, n = names.index(name), v['slots']
        r = 'starter' if i < n else 'backup' if i == n else 'third' if i == n + 1 else 'surplus'
        rest = [x for x in v['players'] if x['name'] != name]
        me = v['players'][i]
        cand = {'name': name, 'age': me['age'], 'ca': me['ca'], 'pa': me.get('pa'), 'position': pos, 'role': r, 'rank': i + 1, 'slots': n,
                'depth_ok_without': depth_ok(rest, n), 'position_players': names[:n + 3]}
        if best is None or ROLES.index(r) < ROLES.index(best['role']):
            best = cand
    return best or {'name': name, 'position': None, 'role': 'surplus', 'depth_ok_without': True}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    ap.add_argument('--player')
    a = ap.parse_args()
    rows, tactic = m.load(a.csv)
    print(json.dumps(role(rows, tactic, a.player) if a.player else chart(rows, tactic), default=str))
