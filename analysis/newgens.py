"""The new youth class (1 May checkpoint, playbook §1b): players aged <= 16 who joined a club since
mid-February, by potential. Signable now = home nations at named clubs (foreign under-18s would not
join, 2031-05-28); the rest are a watch list for when they turn 18. Numbers: policy.json → newgens.
"""
import argparse, json
import manager as m


def scan(rows, top=15):
    pol = m.POLICY['newgens']
    t = m.today_of(rows)
    since = f"{t.year}-{pol['joined_since_mmdd']}"
    pa = lambda p: int(p['pa']) if str(p.get('pa') or '').lstrip('-').isdigit() else -1
    new = [p for p in rows if p['age'] and int(p['age']) <= pol['max_age'] and (p.get('joined_club') or '') >= since
           and p['club'] and not p['club'].startswith('club#')]
    card = lambda p: {'name': p['name'], 'age': int(p['age']), 'positions': p['positions'], 'nation': p.get('nation'),
                      'club': p['club'], 'ca': p.get('ca'), 'pa': p.get('pa'), 'value': int(float(p['value'] or 0)) if float(p['value'] or 0) < 1e9 else None,
                      'joined': (p.get('joined_club') or '')[:10]}
    ours = sorted((p for p in new if p['club'].startswith(m.CLUB)), key=lambda p: -pa(p))
    others = [p for p in new if not p['club'].startswith(m.CLUB) and pa(p) >= pol['min_pa']]
    signable = sorted((p for p in others if p.get('nation') in pol['signable_nations']), key=lambda p: -pa(p))
    watch = sorted((p for p in others if p.get('nation') not in pol['signable_nations']), key=lambda p: -pa(p))
    return {'date': t.isoformat(), 'class_size': len(new), 'ours': [card(p) for p in ours[:8]],
            'signable_now': [card(p) for p in signable[:top]], 'watch_until_18': [card(p) for p in watch[:top]]}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--top', type=int, default=15); ap.add_argument('--csv')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    print(json.dumps(scan(rows, a.top), default=str))
