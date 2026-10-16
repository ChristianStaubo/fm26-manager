"""Final-year contracts (playbook §6, user 2032-07-02): every one of our players whose contract ends by
the next 30 June, or has ended, with the facts the decision matrix needs (capabilities/contracts/
final-year.mjs): does he start, his role score, and the cheapest market player at least as good in
that role (aged <= replacement_max_age, at most replace_value_ratio x his value): if one exists he is
replaceable. Numbers: policy.json -> contracts.final_year.
"""
import argparse, json
import datetime as dt
import manager as m
import squad_report as sr

GROUPS = {'GK': ({'GK'}, 'GK'), 'CB': ({'DC'}, 'CB'), 'FB': ({'DL', 'DR', 'WBL', 'WBR'}, 'WB (attacking)'),
          'DM': ({'DM', 'MC'}, ('DM', 'CM')), 'W': ({'AML', 'AMR', 'ML', 'MR'}, 'Winger'), 'AM': ({'AMC'}, 'AMC'), 'ST': ({'ST'}, 'ST')}


def score(p, role):
    """Role attributes; a slot with two roles (our central pair: DM / box-to-box CM) takes the better."""
    return max(m.attr(p, r) for r in role) if isinstance(role, tuple) else m.attr(p, role)


def group_of(p):
    ps = set((p['positions'] or '').replace('/', ' ').split())
    best = None
    for g, (pos, role) in GROUPS.items():
        if ps & pos:
            a = score(p, role)
            if best is None or a > best[2]:
                best = (g, role, a)
    return best


def scan(rows, tactic, date=None):
    pol = m.POLICY['contracts'].get('final_year', {})
    today = date or m.today_of(rows)
    end = dt.date(today.year + (1 if today.month >= 7 else 0), 6, 30)
    xi = {x['player'] for x in m.xi(rows, tactic, today)['xi']}
    ours = [p for p in rows if p['contract_club'] == m.CLUB and str(p['age'] or '').isdigit() and int(p['age']) >= 21]
    market = [p for p in rows if p['contract_club'] != m.CLUB and p['club'] and not p['club'].startswith('club#')
              and str(p['age'] or '').isdigit() and 21 <= int(p['age']) <= pol.get('replacement_max_age', 25)
              and pol.get('replacement_min_value', 1e6) <= float(p['value'] or 0) < 1e9]
    cav = lambda x: int(x['ca']) if str(x.get('ca') or '').isdigit() else -1
    stars = {x['name'] for x in sorted(ours, key=lambda x: -cav(x))[:pol.get('stars_top', 3)]}
    out = []
    for p in ours:
        exp = (p.get('contract_expires') or '')[:10]
        if exp and exp > end.isoformat():
            continue
        g = group_of(p)
        value, card = int(float(p['value'] or 0)), None
        if g:
            pos, role = GROUPS[g[0]]
            # Quality is FM's CA (position-weighted over every attribute; user, 2032-07-02: our role
            # average flattered Marco Company, CA 139 vs Kislyak's 145). The role score only checks fit.
            ca, my = lambda x: int(x['ca']) if str(x.get('ca') or '').isdigit() else -1, None
            my = ca(p)
            cands = [q for q in market if set((q['positions'] or '').replace('/', ' ').split()) & pos
                     and ca(q) >= my - pol.get('similar_ca', 3) and score(q, role) >= g[2] - pol.get('fit_within', 1.0)
                     and float(q['value']) <= pol.get('replace_value_ratio', 0.75) * max(value, 1)]
            if cands:
                pa = lambda x: int(x['pa']) if str(x.get('pa') or '').isdigit() else -1
                q = max(cands, key=lambda q: (ca(q), pa(q) if int(q['age']) <= 23 else 0, -float(q['value'])))
                card = {'name': q['name'], 'club': q['contract_club'] or q['club'], 'age': int(q['age']), 'value': int(float(q['value'])),
                        'ca': ca(q), 'pa': pa(q), 'role_score': round(score(q, role), 2)}
        out.append({'name': p['name'], 'age': int(p['age']), 'positions': p['positions'], 'value': value,
                    'wage': int(float(p['wage'] or 0)), 'minutes': int(p['mins'] or 0), 'contract_until': exp or None,
                    'no_contract': not exp or exp < today.isoformat(), 'starts': p['name'] in xi, 'star': p['name'] in stars,
                    'role': ('/'.join(g[1]) if isinstance(g[1], tuple) else g[1]) if g else None, 'ca': int(p['ca']) if str(p.get('ca') or '').isdigit() else None, 'pa': int(p['pa']) if str(p.get('pa') or '').isdigit() else None, 'role_score': round(g[2], 2) if g else None, 'replacement': card})
    return {'date': today.isoformat(), 'final_year_by': end.isoformat(), 'players': sorted(out, key=lambda x: -x['value'])}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    tactic = json.load(open(m.ROOT / 'config' / 'tactic.json')) if hasattr(m, 'ROOT') else json.load(open('../config/tactic.json'))
    print(json.dumps(scan(rows, tactic), default=str))
