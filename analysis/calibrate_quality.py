#!/usr/bin/env python3
"""Calibrate moneyball mode's level / ceiling against a full export (DEVELOPER TOOL: it reads CA / PA, so the
agent never runs it). Fits, on one save's players:

    level   = a + b x mean(all attributes) + c x best role's attributes   (outfield; keepers: their GK attributes)
              + output_weight x (output percentile in his league - 50) / 50, scaled by league strength
    ceiling = a + b x level + c x age + d x log(1 + value) + e x log(1 + value)^2   (<= 23 and older apart)

and writes playbook/quality_calibration.json with the fit's quality (rank correlation with CA / PA, median
error, how many PA 180+ youngsters the ceiling's top 50 finds). The coefficients are FM's scale, not one
save's: refit when FM changes, not per save.

Usage: python3 analysis/calibrate_quality.py [--csv FULL_EXPORT] [--output-weight 4] [--dry-run]
"""
import argparse
import json
import math
import os
import statistics as st
import sys
from pathlib import Path

os.environ['FM_MODE'] = 'ability'   # the full export, with CA / PA: this tool's whole point
sys.path.insert(0, str(Path(__file__).resolve().parent))
import manager as m  # noqa: E402
import quality as q  # noqa: E402
import squad_report as sr  # noqa: E402


def ols(X, y):
    """Least squares by the normal equations (no numpy here)."""
    n = len(X[0])
    A = [[sum(r[i] * r[j] for r in X) for j in range(n)] + [sum(r[i] * v for r, v in zip(X, y))] for i in range(n)]
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(A[r][i]))
        A[i], A[piv] = A[piv], A[i]
        for r in range(n):
            if r != i:
                f = A[r][i] / A[i][i]
                A[r] = [a - f * b for a, b in zip(A[r], A[i])]
    return [round(A[i][n] / A[i][i], 5) for i in range(n)]


def quantile_table(est, true, points=200):
    """[[estimate, value], ...] at matching quantiles of the two distributions (the top end densely)."""
    e, t = sorted(est), sorted(true)
    qs = sorted({i / points for i in range(points + 1)} | {1 - 0.5 ** k for k in range(1, 14)})
    pick = lambda xs, qq: xs[min(len(xs) - 1, int(qq * (len(xs) - 1)))]
    return [[round(pick(e, qq), 3), pick(t, qq)] for qq in qs]


def spearman(a, b):
    def rank(xs):
        order = sorted(range(len(xs)), key=lambda i: xs[i])
        r = [0] * len(xs)
        for k, i in enumerate(order):
            r[i] = k
        return r
    ra, rb, mid = rank(a), rank(b), (len(a) - 1) / 2
    num = sum((x - mid) * (y - mid) for x, y in zip(ra, rb))
    return round(num / math.sqrt(sum((x - mid) ** 2 for x in ra) * sum((y - mid) ** 2 for y in rb)), 3)


def calibrate(rows, output_weight=4.0, young_max_age=23):
    iv = lambda p, k: m.intval(p, k, None)
    rows = [p for p in rows if not (p.get('club') or '').startswith('club#') and (iv(p, 'ca') or 0) >= 40 and iv(p, 'age')]
    f = q.features(rows)
    out = [p for p in rows if not f[p['key']]['gk']]
    gks = [p for p in rows if f[p['key']]['gk']]
    cal = {'level': {'outfield': ols([[1, f[p['key']]['attr_all'], f[p['key']]['role_attr']] for p in out], [iv(p, 'ca') for p in out]),
                     'gk': ols([[1, f[p['key']]['gk_attr']] for p in gks], [iv(p, 'ca') for p in gks]),
                     'output_weight': output_weight},
           'ceiling': {'young_max_age': young_max_age, 'young': [0, 1, 0, 0, 0], 'older': [0, 1, 0, 0, 0]}}
    # Stretch the estimates to CA's spread (rank-preserving): regression pulls the best and worst to the middle.
    raw = [q.estimate(f[p['key']], cal)[0] for p in rows]
    cal['level']['quantiles'] = quantile_table(raw, [iv(p, 'ca') for p in rows])
    level = {p['key']: q.estimate(f[p['key']], cal)[0] for p in rows}
    for group, sel in (('young', lambda p: iv(p, 'age') <= young_max_age), ('older', lambda p: iv(p, 'age') > young_max_age)):
        ps = [p for p in rows if sel(p)]
        X = [[1, level[p['key']], iv(p, 'age'), f[p['key']]['log_value'], f[p['key']]['log_value'] ** 2] for p in ps]
        cal['ceiling'][group] = c = ols(X, [iv(p, 'pa') for p in ps])
        cal['ceiling'].setdefault('quantiles', {})[group] = quantile_table([q._dot(c, x) for x in X], [iv(p, 'pa') for p in ps])
    est = {p['key']: q.estimate(f[p['key']], cal) for p in rows}
    young = [p for p in rows if iv(p, 'age') <= 21]
    top = sorted(young, key=lambda p: -est[p['key']][1])[:50]
    cal['fit'] = {
        'players': len(rows),
        'level_vs_ca': {'spearman': spearman([est[p['key']][0] for p in rows], [iv(p, 'ca') for p in rows]),
                        'median_abs_error': st.median(abs(est[p['key']][0] - iv(p, 'ca')) for p in rows)},
        'ceiling_vs_pa_age_21_or_under': {'spearman': spearman([est[p['key']][1] for p in young], [iv(p, 'pa') for p in young]),
                                          'median_abs_error': st.median(abs(est[p['key']][1] - iv(p, 'pa')) for p in young)},
        'pa_180_found_in_top_50_ceiling': f"{sum(iv(p, 'pa') >= 180 for p in top)} of {sum(iv(p, 'pa') >= 180 for p in young)}",
        'age_21_or_under_over_180': {'pa': sum(iv(p, 'pa') >= 180 for p in young), 'ceiling': sum(est[p['key']][1] >= 180 for p in young),
                                     'both': sum(iv(p, 'pa') >= 180 and est[p['key']][1] >= 180 for p in young)},
        'level_at_top': {'ca_180_plus': sum(iv(p, 'ca') >= 180 for p in rows), 'level_180_plus': sum(est[p['key']][0] >= 180 for p in rows)},
    }
    return cal


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv', help='a FULL export (with CA / PA); default: the latest save, exported in full')
    ap.add_argument('--output-weight', type=float, default=4.0, help='level points for a top / bottom output percentile')
    ap.add_argument('--dry-run', action='store_true', help='print the fit, write nothing')
    a = ap.parse_args()
    rows = sr.load(a.csv or sr.export_save('latest', full=True))
    cal = calibrate(rows, a.output_weight)
    cal['_about'] = 'Moneyball mode coefficients (analysis/quality.py), fitted by analysis/calibrate_quality.py on a full export.'
    if not a.dry_run:
        q.CALIBRATION.write_text(json.dumps(cal, indent=1) + '\n')
    print(json.dumps(cal['fit'], indent=1))


if __name__ == '__main__':
    main()
