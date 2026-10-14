"""Resale backtest (notes/loop-engineering.md, depth): does the lens we buy with predict value growth?

The user's summer 2030 lens: young players, strong role attributes, ideally cheap for those
attributes ("Lemaitre: elite attributes at a youth price, resale £20M+"). Test it on our own save's
end-of-season snapshots (local/exports/claude-3-endseason-*.csv): for each player at season t,
the features we would have seen, and his value one season later. Every signal is judged out of
sample: decile thresholds come from the earlier pairs, the verdict from the latest pair.

Signals (higher = we'd buy):
  attributes   role attribute fit (scorecard.attr_fit, 1-20) at his natural position
  cheap        attributes for the price: 1 / (value vs the median value of players with the same
               fit (±0.4) and age (±2) in the same position group) — the window's "x market", inverted
  youth        24 - age

Output: for each signal, mean and median one-year value growth of its top decile vs everyone,
per pair, and the hit rate (share of the top decile whose value rose 50%+).

  python3 analysis/backtest_resale.py [--max-age 24] [--min-value 1e6] [--max-value 60e6]
"""
import argparse, json, statistics as st, bisect
from pathlib import Path
import squad_report as sr, scorecard as sc

EXPORTS = Path(__file__).resolve().parent.parent / 'local' / 'exports'
GROUPS = {'GK': ({'GK'}, 'GK'), 'CB': ({'DC'}, 'CB'), 'FB': ({'DL', 'DR', 'WBL', 'WBR'}, 'WB (attacking)'),
          'DM': ({'DM', 'MC'}, 'DM'), 'AM': ({'AMC'}, 'AMC'), 'W': ({'AML', 'AMR', 'ML', 'MR'}, 'Winger'), 'ST': ({'ST'}, 'ST')}
NOT_FOR_SALE = sr.NOT_FOR_SALE


def group(p):
    for g, (pos, role) in GROUPS.items():
        if p['pos'] & pos:
            return g, role
    return None, None


def features(rows, max_age, min_value, max_value):
    out = []
    for p in rows:
        v, age = int(p['value'] or 0), int(p['age'] or 99)
        g, role = group(p)
        if not g or age > max_age or not (min_value <= v <= max_value) or v >= NOT_FOR_SALE:
            continue
        out.append({'key': p['key'], 'name': p['name'], 'age': age, 'value': v, 'group': g, 'fit': sc.attr_fit(p, role)})
    # "cheap": value vs players of the same fit and age in his group (the window's x-market).
    by_group = {}
    for f in out:
        by_group.setdefault(f['group'], []).append(f)
    for g, fs in by_group.items():
        fs.sort(key=lambda f: f['fit'])
        fits = [f['fit'] for f in fs]
        for f in fs:
            lo, hi = bisect.bisect_left(fits, f['fit'] - 0.4), bisect.bisect_right(fits, f['fit'] + 0.4)
            sim = [x['value'] for x in fs[lo:hi] if abs(x['age'] - f['age']) <= 2]
            f['cheap'] = st.median(sim) / f['value'] if len(sim) >= 6 else None
        for f in fs:
            f['youth'] = 24 - f['age']
            f['attributes'] = f['fit']
    return {f['key']: f for f in out}


def pairs(max_age, min_value, max_value):
    snaps = sorted(EXPORTS.glob('claude-3-endseason-*.csv'))
    later = {s: {p['key']: int(p['value'] or 0) for p in sr.load(str(s))} for s in snaps[1:]}
    for a, b in zip(snaps, snaps[1:]):
        feats = features(sr.load(str(a)), max_age, min_value, max_value)
        rows = []
        for k, f in feats.items():
            v1 = later[b].get(k)
            if v1 and v1 < NOT_FOR_SALE:
                rows.append({**f, 'growth': v1 / f['value']})
        yield a.stem.replace('claude-3-endseason-', ''), b.stem.replace('claude-3-endseason-', ''), rows


def decile_bar(rows, signal):
    xs = sorted(r[signal] for r in rows if r[signal] is not None)
    return xs[int(len(xs) * 0.9)] if xs else None


def judge(rows, signal, bar):
    top = [r for r in rows if r[signal] is not None and r[signal] >= bar]
    g = lambda rs: [r['growth'] for r in rs]
    return {'n_top': len(top), 'n_all': len(rows),
            'top_mean_growth': round(st.mean(g(top)), 2) if top else None, 'all_mean_growth': round(st.mean(g(rows)), 2),
            'top_median_growth': round(st.median(g(top)), 2) if top else None, 'all_median_growth': round(st.median(g(rows)), 2),
            'top_hit_50pct': round(sum(x >= 1.5 for x in g(top)) / len(top), 2) if top else None,
            'all_hit_50pct': round(sum(x >= 1.5 for x in g(rows)) / len(rows), 2)}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--max-age', type=int, default=24)
    ap.add_argument('--min-value', type=float, default=1e6)
    ap.add_argument('--max-value', type=float, default=60e6)
    a = ap.parse_args()
    data = list(pairs(a.max_age, a.min_value, a.max_value))
    train, test = data[:-1], data[-1]
    out = {'method': __doc__.split('\n\n')[1], 'pairs': [f'{x} -> {y}' for x, y, _ in data], 'test_pair': f'{test[0]} -> {test[1]}', 'signals': {}}
    for signal in ('attributes', 'cheap', 'youth'):
        bar = decile_bar([r for _, _, rows in train for r in rows], signal)   # threshold from the past only
        out['signals'][signal] = {'bar_from_train': bar,
                                  'train': {f'{x}->{y}': judge(rows, signal, bar) for x, y, rows in train},
                                  'test': judge(test[2], signal, bar)}
    # The combination we actually buy: strong attributes AND cheap for them.
    both = lambda r: r['attributes'] is not None and r['cheap'] is not None
    ab, cb = out['signals']['attributes']['bar_from_train'], out['signals']['cheap']['bar_from_train']
    for _, _, rows in data:
        for r in rows:
            r['lens'] = 1 if both(r) and r['attributes'] >= ab * 0.97 and r['cheap'] >= cb * 0.6 else 0
    out['signals']['lens (attributes AND cheap)'] = {'test': judge(test[2], 'lens', 1),
                                                     'train': {f'{x}->{y}': judge(rows, 'lens', 1) for x, y, rows in train}}
    print(json.dumps(out, indent=1))
