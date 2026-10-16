#!/usr/bin/env python3
"""Our first team's wage bands, for judging a contract demand (JSON on stdout).

First team = the top N earners (default 25). The contract screen's "Avg." mixes in youth and
reserves (Brentford, July 2026: squad median £7K, first-team median £51K), so it understates
what a first-team wage is.

Usage: python3 analysis/wage_bands.py [--csv local/exports/<save>.csv] [--top 25]
"""
import argparse
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import squad_report as sr  # noqa: E402


def bands(rows, club, top=25):
    wages = sorted((int(float(r['wage'] or 0)) for r in rows if r['contract_club'] == club), reverse=True)
    first = wages[:top]
    q = st.quantiles(first, n=4)
    return dict(club=club, players=len(wages), first_team=len(first), median=int(st.median(first)),
                p25=int(q[0]), p75=int(q[2]), max=first[0], squad_median=int(st.median(wages)))


def peer_band(rows, club, name, within=4, min_peers=3):
    """What we pay players of his level (user, 2033-08-05: Ylla CA 161 agreed £180K while Stringfellow,
    CA 162, earns £140K): the median wage of OUR players within `within` CA of him (widened until
    min_peers). Loanees out count: we still pay them."""
    def ca(r):
        s = str(r.get('ca') or '')
        return int(s) if s.isdigit() else None
    him = next((r for r in rows if r['name'] == name and ca(r) is not None and r['contract_club'] != club), None) \
        or next((r for r in rows if r['name'] == name and ca(r) is not None), None)
    if not him:
        return None
    ours = [r for r in rows if r['contract_club'] == club and ca(r) is not None and float(r['wage'] or 0) > 0]
    w = within
    while True:
        peers = [r for r in ours if abs(ca(r) - ca(him)) <= w and r['name'] != name]
        if len(peers) >= min_peers or w >= 20:
            break
        w += 2
    wages = sorted(int(float(r['wage'])) for r in peers)
    return dict(name=name, ca=ca(him), within=w, peers=[[r['name'], ca(r), int(float(r['wage']))] for r in peers],
                peer_median=int(st.median(wages)) if wages else None)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    ap.add_argument('--save', default='latest')
    ap.add_argument('--club', default=sr.CLUB_CONFIG['club'])
    ap.add_argument('--top', type=int, default=25)
    ap.add_argument('--player', help='peer band for this player (by CA) instead of the first-team bands')
    ap.add_argument('--within', type=int, default=4)
    a = ap.parse_args()
    rows = sr.load(a.csv or sr.export_save(a.save))
    print(json.dumps(peer_band(rows, a.club, a.player, a.within) if a.player else bands(rows, a.club, a.top)))


if __name__ == '__main__':
    main()
