#!/usr/bin/env python3
"""How players are judged: the mode (user, 2026-10-20).

    ability    FM's hidden current and potential ability (CA / PA). What this project ran on until now.
    moneyball  Only what a manager can see in FM: attributes, match stats, value, age, contract. CA and PA
               are never read: the export the agent sees has no such columns (analysis/quality.py strips
               them), and a player's level and ceiling are estimated from visible data instead.

Every decision table compares two numbers per player on the same 0-200 scale: his **level** (now) and his
**ceiling** (what he can become). They live in each row's 'ca' / 'pa' fields, so the tables, thresholds
and rules are the same in both modes; only what fills those two fields changes:

    ability    level = CA, ceiling = PA
    moneyball  level and ceiling estimated by estimate() (calibrated against a full export by
               calibrate_quality.py, a developer tool the agent never runs)

The mode: env FM_MODE (fm --mode X sets it for one command), else config/club.json "mode", else ability.
"""
import functools
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODES = ('ability', 'moneyball')


@functools.cache
def mode():
    m = os.environ.get('FM_MODE') or json.loads((ROOT / 'config' / 'club.json').read_text()).get('mode') or 'ability'
    if m not in MODES:
        raise SystemExit(f'Unknown mode "{m}": use one of {", ".join(MODES)} (config/club.json "mode" or --mode)')
    return m


CALIBRATION = ROOT / 'playbook' / 'quality_calibration.json'
HIDDEN = ('ca', 'pa', 'growth')   # columns a manager can't see (growth = PA - CA)


def features(rows):
    """Visible inputs per player key: attributes, output against his league, league strength, age, value.
    Needs no hidden column."""
    import math
    import statistics as stt
    import squad_report as sr
    import manager as m
    gk_attrs = sr.ROLES['GK'][2]
    strength = m.league_strength(rows)
    # Output percentile in his league, his best role among his positions (players with enough minutes).
    # Ranked within each league's own rows (ranking against all rows rescanned ~47k rows per league x role).
    by_league = {}
    for p in rows:
        if p.get('competition'):
            by_league.setdefault(p['competition'], []).append(p)
    out_pct, cache = {}, {}
    for p in rows:
        if not p.get('competition') or p['mins'] < sr.MIN_MINUTES:
            continue
        best = None
        for role, (pos, _, _) in sr.ROLES.items():
            if not (p['pos'] & pos) or (role == 'GK') != ('GK' in p['pos']):
                continue
            key = (role, p['competition'])
            if key not in cache:
                cache[key] = sr.ranked(by_league[p['competition']], role, p['competition'])[1]
            r = cache[key].get(p['key'])
            if r:
                pct = 100 * (1 - (r[4] - 1) / max(1, len(cache[key])))
                best = pct if best is None else max(best, pct)
        if best is not None:
            out_pct[p['key']] = best
    out = {}
    for p in rows:
        gk = 'GK' in p['pos'] and sr.num(p, 'pos_GK') >= 15
        roles = [r for r, (pos, _, _) in sr.ROLES.items() if p['pos'] & pos and (r == 'GK') == gk]
        role_attr = max((stt.mean(sr.num(p, a) for a in sr.ROLES[r][2]) for r in roles), default=None)
        age = m.intval(p, 'age', None)
        out[p['key']] = {'gk': gk, 'attr_all': m.attr_all(p), 'gk_attr': stt.mean(sr.num(p, a) for a in gk_attrs),
                         'role_attr': role_attr if role_attr is not None else m.attr_all(p),
                         'out_pct': out_pct.get(p['key']), 'strength': strength.get(p.get('competition'), None),
                         'age': age, 'log_value': math.log1p(max(0.0, float(p.get('value') or 0)))}
    return out


def _dot(c, xs):
    return sum(a * b for a, b in zip(c, xs))


def _map(x, table):
    """Piecewise-linear lookup in a quantile table [[estimate, ca_or_pa], ...] (sorted by estimate): the
    estimates keep their order and take CA / PA's own spread, so 'ceiling 180' is as rare as PA 180."""
    if not table:
        return x
    if x <= table[0][0]:
        return table[0][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return table[-1][1]


def estimate(f, cal):
    """(level, ceiling) on the 0-200 scale from one player's visible features and the calibration."""
    lv = cal['level']
    if f['gk']:
        level = _dot(lv['gk'], [1, f['gk_attr']])
    else:
        level = _dot(lv['outfield'], [1, f['attr_all'], f['role_attr']])
    # Moneyball: what he produces on the pitch moves his level, scaled by how strong his league is
    # (output_weight points at the 100th / 0th percentile of a league as strong as ours).
    if f['out_pct'] is not None:
        level += lv['output_weight'] * (f['out_pct'] - 50) / 50 * min(1.0, f['strength'] or 1.0)
    level = max(1, min(200, round(_map(level, lv.get('quantiles')))))
    age = f['age'] if f['age'] is not None else 25
    group = 'young' if age <= cal['ceiling'].get('young_max_age', 23) else 'older'
    ceiling = _dot(cal['ceiling'][group], [1, level, age, f['log_value'], f['log_value'] ** 2])
    ceiling = _map(ceiling, cal['ceiling'].get('quantiles', {}).get(group))
    return level, max(level, min(200, round(ceiling)))


def apply(rows):
    """Fill each row's level / ceiling for the mode. Ability: the export's CA / PA, untouched. Moneyball:
    estimated from visible data; any hidden column in the rows is removed first."""
    if mode() == 'ability':
        return rows
    for p in rows:
        for k in HIDDEN:
            p.pop(k, None)
    if not CALIBRATION.exists():
        raise SystemExit(f'moneyball mode needs {CALIBRATION.relative_to(ROOT)} (python3 analysis/calibrate_quality.py)')
    cal = json.loads(CALIBRATION.read_text())
    feats = features(rows)
    for p in rows:
        lvl, cei = estimate(feats[p['key']], cal)
        p['ca'], p['pa'] = str(lvl), str(cei)
    return rows
