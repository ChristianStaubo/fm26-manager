"""The wonderkid portfolio (january checkpoint, playbook §5): players aged <= max_age with potential
>= min_pa and value <= max_value, not ours, by potential. Homegrown kids are flagged (registration
places, policy squad.homegrown_min). Numbers: policy.json → wonderkids.
"""
import argparse, json
import manager as m


def scan(rows, top=None):
    pol = m.POLICY['wonderkids']
    t = m.today_of(rows)
    val = lambda p: float(p['value'] or 0) if float(p['value'] or 0) < 1e9 else None
    kids = [p for p in rows if str(p['age'] or '').isdigit() and int(p['age']) <= pol['max_age'] and m.intval(p, 'pa') >= pol['min_pa']
            and val(p) is not None and val(p) <= pol['max_value'] and p['club'] and not p['club'].startswith(('club#', m.CLUB)) and p['contract_club'] != m.CLUB]
    kids.sort(key=lambda p: (-m.intval(p, 'pa'), val(p)))
    card = lambda p: {'name': p['name'], 'age': int(p['age']), 'positions': p['positions'], 'nation': p.get('nation'),
                      'club': p['contract_club'] or p['club'], 'ca': m.intval(p, 'ca'), 'pa': m.intval(p, 'pa'), 'value': int(val(p)),
                      'contract_until': p.get('contract_expires') or None, 'homegrown': m.homegrown(p, t)}
    return {'date': t.isoformat(), 'rule': {k: v for k, v in pol.items() if not k.startswith('_')}, 'players': [card(p) for p in kids[:top or pol['top']]]}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--top', type=int); ap.add_argument('--csv')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    print(json.dumps(scan(rows, a.top), default=str))
