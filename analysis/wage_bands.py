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


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    ap.add_argument('--save', default='latest')
    ap.add_argument('--club', default=sr.CLUB_CONFIG['club'])
    ap.add_argument('--top', type=int, default=25)
    a = ap.parse_args()
    rows = sr.load(a.csv or sr.export_save(a.save))
    print(json.dumps(bands(rows, a.club, a.top)))


if __name__ == '__main__':
    main()
