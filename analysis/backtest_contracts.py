"""Contract backtest (notes/loop-engineering.md): what does the final year cost, and does renewing
win it back? From our save's end-of-season snapshots (claude-3-endseason-*.csv), by player key:

  discount   value in the season a contract enters its final year vs the season before
             (same player, same club, contract unchanged)
  recovery   final-year players at t who were renewed by t+1 (expiry moved later): value t+1 / value t
             vs those not renewed who stayed (ran down) or moved
Only players worth £1M+ at the earlier snapshot. Medians (FM values move in big steps).

  python3 analysis/backtest_contracts.py
"""
import json, statistics as st
from pathlib import Path
import squad_report as sr

EXPORTS = Path(__file__).resolve().parent.parent / 'local' / 'exports'


def season_end(stem):           # 'claude-3-endseason-2028-29' -> 2029 (the June that season ends)
    return int(stem.rsplit('-', 1)[0][-4:]) + 1


def load(path):
    return {p['key']: {'name': p['name'], 'age': int(p['age'] or 0), 'value': int(p['value'] or 0), 'club': p['contract_club'],
                       'expires': (p['contract_expires'] or '')[:4]} for p in sr.load(str(path)) if p['contract_club']}


snaps = sorted(EXPORTS.glob('claude-3-endseason-*.csv'))
data = [(season_end(s.stem), load(s)) for s in snaps]
out = {'snapshots': [s.stem for s in snaps], 'pairs': []}
for (y0, a), (y1, b) in zip(data, data[1:]):
    # Discount: at y1 the contract expires in y1+1 (final year next season) ... use: a has 2y left, b has 1y left.
    disc = [b[k]['value'] / a[k]['value'] for k in a if k in b and a[k]['value'] >= 1e6 and b[k]['value'] < sr.NOT_FOR_SALE
            and a[k]['club'] == b[k]['club'] and a[k]['expires'] == b[k]['expires'] == str(y1 + 1)]
    ctrl = [b[k]['value'] / a[k]['value'] for k in a if k in b and a[k]['value'] >= 1e6 and b[k]['value'] < sr.NOT_FOR_SALE
            and a[k]['club'] == b[k]['club'] and a[k]['expires'] == b[k]['expires'] and a[k]['expires'] >= str(y1 + 3)]
    # Recovery: final year at a (expires y0+1), renewed by b (same club, expires later).
    fy = [k for k in a if a[k]['expires'] == str(y0 + 1) and a[k]['value'] >= 1e6]
    renewed = [b[k]['value'] / a[k]['value'] for k in fy if k in b and b[k]['club'] == a[k]['club'] and b[k]['expires'] > a[k]['expires'] and b[k]['value'] < sr.NOT_FOR_SALE]
    out['pairs'].append({
        'pair': f'{y0} -> {y1}',
        'entering_final_year': {'n': len(disc), 'median_value_change': round(st.median(disc), 2) if disc else None},
        'control_3plus_years_left': {'n': len(ctrl), 'median_value_change': round(st.median(ctrl), 2) if ctrl else None},
        'final_year_renewed_next_season': {'n': len(renewed), 'median_value_change': round(st.median(renewed), 2) if renewed else None},
    })
print(json.dumps(out, indent=1))
