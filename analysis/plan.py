"""The window plan (capability `plan`, playbook §2-5, §10): the same pass at the start of every window.

  1. alerts      players the squad tables leave out (no contract, league regulars in our U21)
  2. changes     who left and who arrived since the last snapshot export (local/exports/<save>-*.csv)
  3. slots       the XI and depth per slot of our shape (window.report: blended + moneyball scores)
  4. buy         a priced shopping list within --budget: starters before depth, one pick per gap
  5. sell        the window report's sell list

Proposals only: buying and selling need the user's approval (policy.json autonomy). Each buy has
fm price's numbers (open at, walk away) so the approval is one line.

  python3 analysis/plan.py --budget 200e6 [--snapshot path.csv] [--max-value N] [--csv export.csv]
"""
import argparse, json, re
from pathlib import Path
import manager as m, window as w

sr = m.sr
STARTERS = {'CB': ('LCB', 'CB', 'RCB'), 'DM': ('LDM', 'RDM')}   # slots per group in the XI
DEPTH_MAX = 15e6   # most we pay for a depth signing
LEFT_MIN = 900   # a departure worth naming: league minutes for us last season


def snapshot_path(current):
    """The newest dated export of this save other than the live one (claude-3-endseason-2029-30.csv)."""
    base = re.sub(r'[.*?].*$', '', sr.CLUB_CONFIG['save_pattern'])
    folder = Path(current).parent
    snaps = [p for p in folder.glob(f'{base}-*.csv') if not p.name.endswith('_clubs.csv') and p.resolve() != Path(current).resolve()]
    return max(snaps, key=lambda p: p.stat().st_mtime) if snaps else None


def changes(rows, prev):
    ours = lambda rs: {p['name']: p for p in rs if p['contract_club'] == m.CLUB}
    now, before = ours(rows), ours(prev)
    where = {p['name']: p['contract_club'] or p['club'] or 'free agent' for p in rows}
    nocontract = {p['name'] for p in rows if p['club'] == m.CLUB and not p['contract_club']}
    left = [{'name': n, 'age': int(p['age'] or 0), 'positions': p['positions'], 'minutes_for_us': int(float(p.get('minutes') or 0)),
             'now': f'{m.CLUB} (no contract)' if n in nocontract else where.get(n, 'not in export')} for n, p in before.items() if n not in now]
    arrived = [{'name': n, 'age': int(p['age'] or 0), 'positions': p['positions'], 'from': p.get('club') or '?'} for n, p in now.items() if n not in before]
    return {'left': sorted((x for x in left if x['minutes_for_us'] >= LEFT_MIN), key=lambda x: -x['minutes_for_us']),
            'left_fringe': len([x for x in left if x['minutes_for_us'] < LEFT_MIN]), 'arrived': arrived}


def shopping(report, rows, tactic, budget, lens='moneyball', max_age=29):
    """Per slot: how many starters we lack (solid players vs XI slots), then depth (solid vs need).
    Starters come from best/value with a real sample (moneyball score), cheapest strong first;
    depth from bench/free. Each pick is priced with fm price and must fit the remaining budget."""
    used = {s['slot'] for s in tactic['slots']}
    picks, skipped, left, taken, shortlist = [], [], budget, set(), {}
    order = sorted(report['slots'], key=lambda s: (s['solid'] - len([x for x in STARTERS.get(s['slot'], (s['slot'],)) if x in used])))
    for s in order:
        xi = len([x for x in STARTERS.get(s['slot'], (s['slot'],)) if x in used]) or 1
        # A starter must be proven: solid on a real sample (Torrente, 83 on attributes after 27
        # minutes, is depth until he plays). Depth counts every solid player.
        proven = len([c for c in s['ours'] if c['blended'] >= w.SOLID and c['moneyball'] is not None])
        starter_gap = max(0, xi - proven)
        depth_gap = max(0, s['need'] - max(s['solid'], proven + starter_gap))
        def choose(pool, why, cap=float('inf')):
            nonlocal left
            for c in pool:
                if c['name'] in taken:
                    continue
                p = m.price(rows, c['name'])
                if 'error' in p:
                    continue
                if not p['wage_ok']:   # the runaway cap (contracts.max_salary_vs_first_team_median): Pineda wanted £568K/wk
                    skipped.append({'slot': s['slot'], 'name': c['name'], 'wage': p['wage'], 'why': 'wage over our cap'})
                    continue
                if p['walk_away'] > cap:   # depth: the price, not the list it came from (Pulisic, 'free' next June, £42M)
                    continue
                if p['walk_away'] > left:
                    skipped.append({'slot': s['slot'], 'name': c['name'], 'walk_away': p['walk_away'], 'why': 'over the remaining budget'})
                    continue
                taken.add(c['name']); left -= p['walk_away']
                picks.append({'slot': s['slot'], 'role': why, 'name': c['name'], 'club': p['club'], 'age': c['age'], 'league': c['league'],
                              'attributes': c['attributes'], 'blended': c['blended'], 'moneyball': c['moneyball'], 'chabot': c['chabot'], 'minutes': c['minutes'],
                              'value': p['value'], 'open_at': p['open_at'], 'walk_away': p['walk_away'], 'wage': p['wage'], 'wage_ok': p['wage_ok'],
                              'beats_our_best_by': c['blended'] - (s['ours'][0]['blended'] if s['ours'] else 0)})
                return True
            return False
        # Every list counts (Kovář, 75/100 for £3.8M, sat in 'bench'); starters need a real sample.
        # Just-signed players are left out of the picks (they won't join for a season), shown on the shortlist.
        everyone = [c for c in {c['name']: c for c in s['best'] + s['value'] + s['bench'] + s['free'] + s.get('by_attributes', [])}.values() if c['age'] <= max_age]
        every = [c for c in everyone if not c.get('just_signed')]
        if lens == 'attributes':
            # Attributes alone (user, 2026-10-14): better and younger, a higher price is fine; resale later.
            # The bar is our best player's attributes there, so a pick is an upgrade on paper.
            bar = s.get('attr_bar', w.SOLID)
            # Attributes first (bands of 5), then cheap for them: the resale backtest (2026-10-14) found
            # strong attributes AND a low price vs the same fit and age doubles the 1-year +50% rate.
            strong = sorted((c for c in every if c['attributes'] > bar), key=lambda c: (-(c['attributes'] // 5), c.get('x_market') or 9, c['age']))
        else:
            strong = sorted((c for c in every if c['moneyball'] is not None and c['blended'] >= w.SOLID), key=lambda c: (-c['blended'], c['value']))
        # Depth is cheap: the cheapest solid option up to DEPTH_MAX (not Zaragoza at £52M as a backup).
        solid = [c for c in every if c['blended'] >= w.SOLID and c['value'] <= DEPTH_MAX]
        if starter_gap:   # the options behind the pick: the user chooses (Lemaitre 89 attrs, 0 minutes, £0.8M?)
            pool = sorted(everyone, key=lambda c: (-c['attributes'], c['age'], c['value'])) if lens == 'attributes' else strong
            bar = s.get('attr_bar', w.SOLID)
            shortlist[s['slot']] = [{**{k: c.get(k) for k in ('name', 'club', 'league', 'age', 'attributes', 'x_market', 'moneyball', 'minutes', 'value', 'wage', 'just_signed')},
                                     'beats_our_weakest_starter': c['attributes'] > bar} for c in pool[:8]]
        for _ in range(starter_gap):
            if not choose(strong, 'starter'):
                skipped.append({'slot': s['slot'], 'why': 'no starter with a full sample fits the budget: read fm window'})
        for _ in range(depth_gap):
            cheap = [c for c in s['bench'] + s['free'] if c['blended'] >= w.SOLID and c['age'] <= max_age]
            depth_key = (lambda c: (-c['attributes'], c['value'])) if lens == 'attributes' else (lambda c: (c['value'], -c['blended']))
            if not choose(sorted(cheap, key=depth_key) or sorted(solid, key=depth_key), 'depth', DEPTH_MAX):
                skipped.append({'slot': s['slot'], 'why': 'no depth option: read fm window'})
    return picks, skipped, left, shortlist


def plan(rows, tactic, budget, prev=None, max_value=60e6, lens='moneyball', max_age=29):
    report = w.report(rows, None, max_value, max_age, 8e6, tactic, young_age=max_age if lens == 'attributes' else None)
    picks, skipped, left, shortlist = shopping(report, rows, tactic, budget, lens, max_age)
    xi = {s['slot']: (s['ours'][0]['name'] if s['ours'] else None) for s in report['slots']}
    return {'date': report['date'], 'data': report['data'], 'alerts': report['alerts'],
            'changes': changes(rows, prev) if prev else 'no snapshot export to compare with',
            'slots': [{'slot': s['slot'], 'status': s['status'], 'solid': s['solid'], 'need': s['need'],
                       'ours': [f"{c['name']} {c['blended']}" for c in s['ours'][:4]]} for s in report['slots']],
            'lens': lens, 'max_age': max_age, 'buy': picks, 'shortlist': shortlist, 'not_bought': skipped,
            'budget': {'given': budget, 'walk_away_total': budget - left, 'left_at_worst': left},
            # Fringe (under LEFT_MIN minutes) is listed by name only: no evidence either way, not a sale.
            'sell': [{'name': c['name'], 'slot': c['slot'], 'blended': c['blended'], 'minutes': c['minutes'], 'value': c['value'], 'wage': c['wage'], 'why': c['why']}
                     for c in report['sell'] if c['minutes'] >= LEFT_MIN],
            'fringe': [c['name'] for c in report['sell'] if c['minutes'] < LEFT_MIN],
            'next': 'Proposals only: the user approves each buy (fm approve buy "<name>" --max <walk_away>) and sale; '
                    'alerts are acted on first (renew/release, move U21-registered regulars back).',
            'best_xi_now': xi}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--budget', type=float, required=True)
    ap.add_argument('--snapshot')
    ap.add_argument('--max-value', type=float, default=60e6)
    ap.add_argument('--csv')
    ap.add_argument('--lens', choices=['moneyball', 'attributes'], default='moneyball')
    ap.add_argument('--max-age', type=int, default=29)
    a = ap.parse_args()
    current = a.csv or sr.export_save('latest')   # export once (--fresh runs without --csv)
    rows, tactic = m.load(current)
    snap = Path(a.snapshot) if a.snapshot else snapshot_path(current)
    prev = sr.load(str(snap)) if snap else None
    out = plan(rows, tactic, a.budget, prev, a.max_value, a.lens, a.max_age)
    out['snapshot'] = str(snap.name) if snap else None
    print(json.dumps(out, indent=1, ensure_ascii=False, default=str))
