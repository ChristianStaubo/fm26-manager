#!/usr/bin/env python3
"""Our depth chart by CA for our formation, and one player's role in it (JSON on stdout).

The user's depth standard (2033-08-17, 2034-01-01): per position one starter per slot, max(1, slots - 1)
natural backups (three CBs → two backups), and a third player who can cover. U21 players count; players out on loan don't. Naturals (rated 18+ there)
rank first for starter/backup; cover players (15-17) only count towards the third. Loanees back within
manager.RETURN_WITHIN_DAYS count (manager.our_squad): Awudu, E. Đukić and Slatina were left out on 2036-06-04.

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
    ours = m.our_squad(rows)
    positions = {}
    for s in tactic['slots']:
        if s['slot'] in m.SLOT_POSITIONS:
            positions.setdefault(m.GROUP.get(s['slot'], s['slot']), []).append(s['slot'])
    out = {}
    for pos, slots in positions.items():
        slot = slots[0]
        # The user's calls (config/tactic.json "plays"): he is a natural there whatever FM rates him.
        # ...and only there: he can cover elsewhere but starts where the user plays him (2038-01-01: Luiz, a
        # natural LB, plays DM; the chart kept him at LB where he was "most needed").
        plays = tactic.get('plays', {})
        rate = lambda p: 20 if plays.get(p['name']) == pos else min(best_rating(p, slot), 17) if p['name'] in plays else best_rating(p, slot)
        able = [p for p in ours if rate(p) >= 15]
        ranked = sorted(able, key=lambda p: (rate(p) < 18, -m.intval(p, 'ca')))
        out[pos] = {'slots': len(slots), 'players': [
            {'name': p['name'], 'ca': m.intval(p, 'ca'), 'pa': m.intval(p, 'pa'), 'age': m.intval(p, 'age'), 'natural': rate(p) >= 18,
             **({'develop': True} if m.developing(m.intval(p, 'age'), m.intval(p, 'ca'), m.intval(p, 'pa')) else {})} for p in ranked]}
    return unique_starters(out)


def unique_starters(c):
    """A player starts in one slot only (2035-05-28: Harry Gray was the starter at both LW and ST, so ST
    looked covered with Taylor 123 behind). Best players first; one natural at several positions takes
    the one where he is most needed (the biggest drop to the next natural there). Each position's list
    then puts its own starters first and players starting elsewhere last."""
    open_slots = {pos: v['slots'] for pos, v in c.items()}
    start = {}
    for x in sorted({x['name']: x for v in c.values() for x in v['players'] if x['natural']}.values(), key=lambda x: -x['ca']):
        def drop(pos):
            nxt = next((y['ca'] for y in c[pos]['players'] if y['natural'] and y['name'] != x['name'] and y['name'] not in start), 0)
            return x['ca'] - nxt
        options = [pos for pos, v in c.items() if open_slots[pos] and any(y['name'] == x['name'] and y['natural'] for y in v['players'])]
        if options:
            pos = max(options, key=drop)
            start[x['name']] = pos; open_slots[pos] -= 1
    for pos, v in c.items():
        v['players'] = sorted(v['players'], key=lambda y: (start.get(y['name'], pos) != pos, start.get(y['name']) != pos))
        for y in v['players']:
            if start.get(y['name']) not in (None, pos):
                y['starts_at'] = start[y['name']]
    return c


def depth_ok(players, slots):
    """Starters for every slot + max(1, slots - 1) natural backups + a third who can cover. Developing
    prospects only count as starters (manager.developing)."""
    b = max(1, slots - 1)
    players = players[:slots] + [x for x in players[slots:] if not x.get('develop')]
    return len(players) >= slots + b + 1 and all(x['natural'] for x in players[slots:slots + b])


def roles(rows, tactic):
    """Everyone's role, assigned across all positions at once (user, 2034-01-01: Burton and McAidoo came
    out as surplus): starters first; then backups and thirds from players who don't start elsewhere,
    each used once. A position with several starters has several backups (user, 2034-01-01: three CBs
    → two backups): backups = max(1, slots - 1), then one third who can cover. A developing prospect is a
    starter or nothing (user, 2026-10-19: not on our bench; the sell table loans him)."""
    c = chart(rows, tactic)
    out, used = {}, set()
    for pos, v in c.items():
        for x in v['players'][:v['slots']]:
            if x['name'] not in out:
                out[x['name']] = (pos, 'starter')
    starters = set(out)
    for depth_role in ('backup', 'third'):
        for pos, v in c.items():
            for _ in range(backups(v['slots']) if depth_role == 'backup' else 1):
                x = next((x for x in v['players'][v['slots']:] if x['name'] not in starters and x['name'] not in used
                          and (x['natural'] or depth_role == 'third') and not x.get('develop')), None)
                if x:
                    used.add(x['name'])
                    out.setdefault(x['name'], (pos, depth_role))
    return c, out


def backups(slots):
    return max(1, slots - 1)


def role(rows, tactic, name):
    c, assigned = roles(rows, tactic)
    pos, r = assigned.get(name, (None, 'surplus'))
    me = next((x for v in c.values() for x in v['players'] if x['name'] == name), None)
    if pos is None and me is None:
        return {'name': name, 'position': None, 'role': 'surplus', 'depth_ok_without': True}
    if pos is None:   # surplus: his best position is where he ranks highest
        pos = min((k for k, v in c.items() if any(x['name'] == name for x in v['players'])),
                  key=lambda k: [x['name'] for x in c[k]['players']].index(name))
    v = c[pos]
    rest = [x for x in v['players'] if x['name'] != name]
    return {'name': name, 'age': me['age'], 'ca': me['ca'], 'pa': me.get('pa'), 'position': pos, 'role': r,
            'slots': v['slots'], 'depth_ok_without': depth_ok(rest, v['slots']),
            'position_players': [x['name'] for x in v['players'][:v['slots'] + 3]]}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    ap.add_argument('--player')
    ap.add_argument('--roles', action='store_true', help='everyone with a depth role: {name: [position, role]}')
    a = ap.parse_args()
    rows, tactic = m.load(a.csv)
    print(json.dumps(roles(rows, tactic)[1] if a.roles else role(rows, tactic, a.player) if a.player else chart(rows, tactic), default=str))
