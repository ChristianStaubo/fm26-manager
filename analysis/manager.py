#!/usr/bin/env python3
"""Manager data module: squad plan, scouting shortlist and XI, as compact JSON.

Implements playbook/PLAYBOOK.md sections 2 (squad shape), 5 (buying) and 7 (selection) with the
numbers in playbook/policy.json. Facts and a recommendation with its reason; the manager decides.

Usage:
    python3 analysis/manager.py squad [--csv EXPORT] [--date YYYY-MM-DD]
    python3 analysis/manager.py scout [--csv EXPORT] [--positions LW,AM] [--budget 50e6] [--per 6]
    python3 analysis/manager.py xi    [--csv EXPORT]
"""
import argparse
import datetime as dt
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import squad_report as sr  # noqa: E402
import wage_bands  # noqa: E402

ROOT = sr.ROOT
POLICY = json.loads((ROOT / 'playbook' / 'policy.json').read_text())
CLUB, LEAGUE = sr.CLUB_CONFIG['club'], sr.CLUB_CONFIG.get('league', 'Premier League')

# Tactic slot → the positions that make a player a specialist there (FM rating 20 = natural).
SLOT_POSITIONS = {'GK': ['GK'], 'LB': ['DL', 'WBL'], 'RB': ['DR', 'WBR'], 'LCB': ['DC'], 'RCB': ['DC'],
                  'LDM': ['DM'], 'RDM': ['DM'], 'LW': ['AML', 'ML'], 'RW': ['AMR', 'MR'], 'AM': ['AMC'], 'ST': ['ST']}
# Slots that share one position group (two CBs, two DMs).
GROUP = {'LCB': 'CB', 'RCB': 'CB', 'LDM': 'DM', 'RDM': 'DM'}


def rating(p, pos):
    return sr.num(p, f'pos_{pos}')


def fits(p, slot, natural=True):
    best = max(rating(p, x) for x in SLOT_POSITIONS[slot])
    return best >= 20 if natural else best >= 15


def load(csv=None):
    rows = sr.load(csv or sr.export_save('latest'))
    tactic = json.loads((ROOT / 'config' / 'tactic.json').read_text())
    sr.apply_tactic(tactic)
    return rows, tactic


class Standing:
    """Output standing of a player in a role, ranked within his own league (cached per league)."""
    def __init__(self, rows):
        self.rows, self.cache = rows, {}

    def __call__(self, p, role):
        lg = p['competition']
        if not lg:
            return None
        key = (role, lg)
        if key not in self.cache:
            self.cache[key] = sr.ranked(self.rows, role, lg)
        pool, res = self.cache[key]
        r = res.get(p['key'])
        if not r:
            return {'minutes': int(p['mins']), 'ranked': False}
        o, _, _, attr_avg, orank, _ = r
        return {'output': round(o, 1), 'rank': f'{orank}/{len(pool)}', 'pct': round(100 * (1 - (orank - 1) / len(pool))),
                'league': lg, 'ranked': True}


def years_left(p, today):
    try:
        return round((dt.date.fromisoformat(p['contract_expires'][:10]) - today).days / 365.25, 1)
    except (ValueError, TypeError):
        return None


def today_of(rows):
    """The save's 'now': the latest join date at our club (exports carry no game date)."""
    dates = [p['joined_club'][:10] for p in rows if p['contract_club'] == CLUB and p.get('joined_club')]
    return dt.date.fromisoformat(max(dates)) if dates else dt.date.today()


def squad(rows, tactic, date=None):
    today = date or today_of(rows)
    standing = Standing(rows)
    ours = [p for p in rows if p['contract_club'] == CLUB]
    bands = wage_bands.bands(rows, CLUB)
    pol_sq, pol_sell = POLICY['squad'], POLICY['selling']
    slot_role = {s['slot']: s['role'] for s in tactic['slots']}
    # Starters come from the XI selection (tactic.json only supplies the shape; its names go stale).
    starters = {x['slot']: x['player'] for x in xi(rows, tactic, today)['xi']}
    groups = {}
    for slot in slot_role:
        groups.setdefault(GROUP.get(slot, slot), []).append(slot)
    out = {'club': CLUB, 'date': today.isoformat(), 'first_team_wage_median': bands['median'], 'positions': [], 'needs': [],
           'sell_candidates': [], 'youth': []}
    used_as_specialist = set()
    for grp, slots in groups.items():
        role = slot_role[slots[0]]
        senior = [p for p in ours if int(p['age'] or 0) >= pol_sq['youth_age_under'] and not p['on_loan_at']]
        spec = [p for p in senior if any(fits(p, s) for s in slots)]
        cover = [p for p in senior if p not in spec and any(fits(p, s, natural=False) for s in slots)]
        def card(p):
            s = standing(p, role)
            return {'name': p['name'], 'age': int(p['age']), 'value': int(p['value']), 'wage': int(p['wage'] or 0),
                    'years_left': years_left(p, today), 'joined': (p.get('joined_club') or '')[:10],
                    'minutes': int(p['mins']), 'starter': p['name'] in [starters[x] for x in slots], 'standing': s}
        spec_cards = sorted((card(p) for p in spec), key=lambda c: -((c['standing'] or {}).get('pct') or 0))
        need_spec = pol_sq['per_position'] * len(slots)
        entry = {'position': grp, 'role': role, 'slots': slots, 'specialists': spec_cards,
                 'cover': [p['name'] for p in cover], 'have': len(spec), 'want': need_spec}
        out['positions'].append(entry)
        used_as_specialist.update(p['name'] for p in spec)
        # Needs: short of specialists, or a starter clearly underperforming (bottom third of his league pool).
        # Short when there are too few specialists AND too few options counting versatile cover.
        if len(spec) < need_spec and len(spec) + len(cover) < pol_sq['options_per_position'] * len(slots):
            out['needs'].append({'position': grp, 'role': role, 'kind': 'depth',
                                 'why': f'{len(spec)} specialist(s) + {len(cover)} cover, want {need_spec} specialists'})
        for c in spec_cards:
            pct = (c['standing'] or {}).get('pct')
            if c['starter'] and pct is not None and pct < 34:
                out['needs'].append({'position': grp, 'role': role, 'kind': 'upgrade',
                                     'why': f"starter {c['name']} ranks {c['standing']['rank']} in his league (bottom third)"})
        # Surplus: three or more specialists per slot → the weakest/costliest is a sell candidate.
        if len(spec) >= pol_sq['options_per_position'] * len(slots) + 0 and len(spec) > need_spec:
            extra = sorted(spec_cards, key=lambda c: ((c['standing'] or {}).get('pct') or 0, -c['wage']))[0]
            if not extra['starter']:
                out['sell_candidates'].append({**extra, 'position': grp, 'why': f'surplus: {len(spec)} specialists at {grp}'})
    # Players 30+ on big wages (sellable at the bottom of their range) and expensive non-performers.
    for p in ours:
        age, wage = int(p['age'] or 0), int(p['wage'] or 0)
        if p['on_loan_at']:
            continue
        if pol_sell.get('age_30_plus_sell_at_v_low') and age >= 30 and wage >= bands['median']:
            out['sell_candidates'].append({'name': p['name'], 'age': age, 'wage': wage, 'value': int(p['value']),
                                           'why': f'30+ on £{wage // 1000}K/wk (≥ first-team median): value only falls'})
        elif wage >= bands['median'] and int(p['mins']) < 900 and age >= pol_sq['youth_age_under'] and p['name'] not in starters.values():
            out['sell_candidates'].append({'name': p['name'], 'age': age, 'wage': wage, 'value': int(p['value']),
                                           'why': f"£{wage // 1000}K/wk but {int(p['mins'])} league minutes: costing us"})
    # Dedupe sell candidates by name (keep the first reason).
    seen, uniq = set(), []
    for c in out['sell_candidates']:
        if c['name'] not in seen:
            seen.add(c['name']); uniq.append(c)
    out['sell_candidates'] = uniq
    for p in ours:
        if int(p['age'] or 99) < pol_sq['youth_age_under']:
            pa = int(p['pa'] or 0)
            out['youth'].append({'name': p['name'], 'age': int(p['age']), 'pa': pa, 'on_loan_at': p['on_loan_at'] or None,
                                 'advice': 'keep' if pa >= pol_sq['youth_keep_pa'] else 'loan or sell'})
    out['youth'].sort(key=lambda y: -y['pa'])
    out['hierarchy'] = load_hierarchy()
    return out


def load_hierarchy():
    """Squad hierarchy from `fm dynamics` (Influential and above limit sales), if read for this save."""
    f = ROOT / 'local' / 'runs' / 'dynamics.json'
    return json.loads(f.read_text()) if f.exists() else {'note': 'not read yet: run fm dynamics'}


def scout(rows, tactic, positions=None, budget=None, per=6, date=None):
    plan = squad(rows, tactic, date)
    bands = wage_bands.bands(rows, CLUB)
    wage_cap = bands['median'] * POLICY['contracts']['max_salary_vs_first_team_median']
    min_attr = POLICY['buying']['min_attr_pct_starter']
    wanted = [n for n in plan['needs'] if not positions or n['position'] in positions]
    if positions:
        for pos in positions:
            if not any(n['position'] == pos for n in wanted):
                ent = next(e for e in plan['positions'] if e['position'] == pos)
                wanted.append({'position': pos, 'role': ent['role'], 'kind': 'requested', 'why': 'asked for'})
    out = {'budget': budget, 'wage_cap': round(wage_cap), 'targets': []}
    for need in wanted:
        ent = next(e for e in plan['positions'] if e['position'] == need['position'])
        starter = next((c for c in ent['specialists'] if c['starter']), None)
        starter_pct = ((starter or {}).get('standing') or {}).get('pct')
        to_start = need['kind'] in ('upgrade', 'requested') or not ent['specialists']
        cands = sr.market_candidates(rows, need['role'], LEAGUE, CLUB, max_value=budget or float('inf'), max_wage=wage_cap,
                                     min_output=None, min_minutes=900)
        picks = []
        for c in cands:
            p = c['p']
            if not any(rating(p, x) >= 20 for x in SLOT_POSITIONS[ent['slots'][0]]):
                continue  # natural in this position (side matters for wingers and full-backs)
            if to_start and c['attr_pct'] < min_attr:
                continue
            pct = round(100 * (1 - (c['rank'] - 1) / c['pool']))
            picks.append({'name': p['name'], 'club': p['club'], 'league': c['league'], 'age': int(p['age']),
                          'output': round(c['output'], 1), 'rank': f"{c['rank']}/{c['pool']}", 'league_pct': pct,
                          'attr_pct_vs_our_league': round(c['attr_pct']), 'value': int(p['value']), 'wage': int(p['wage'] or 0),
                          'contract_until': (p['contract_expires'] or '')[:4]})
            if len(picks) >= per:
                break
        out['targets'].append({'position': need['position'], 'need': need, 'to_start': to_start,
                               'current_starter': starter and {'name': starter['name'], 'standing': starter['standing']},
                               'candidates': picks,
                               'note': f'starters must reach the {min_attr}th attribute percentile vs {LEAGUE}' if to_start else 'depth: no attribute floor'})
    return out


def xi(rows, tactic, date=None):
    """Best output per slot; players who joined this season start (they were bought to play)."""
    today = date or today_of(rows)
    standing = Standing(rows)
    ours = [p for p in rows if p['contract_club'] == CLUB and not p['on_loan_at'] and int(p['age'] or 0) >= 17]
    season_start = dt.date(today.year if today.month >= 7 else today.year - 1, 6, 1)
    picked, out = set(), []
    for s in tactic['slots']:
        slot, role = s['slot'], s['role']
        options = []
        for p in ours:
            if p['name'] in picked or not fits(p, slot, natural=False):
                continue
            st_ = standing(p, role) or {}
            natural = fits(p, slot)
            new = (p.get('joined_club') or '')[:10] >= season_start.isoformat()
            # Ability (CA) anchors the pick; this season's output moves it (±15 at the extremes); no
            # output record costs a little. Natural position and being a new signing count.
            ca = int(p['ca'] or 0)
            form = (st_['pct'] - 50) * 0.3 if st_.get('ranked') else -5
            score = ca + form + (10 if natural else -15) + (8 if new else 0)
            options.append((score, p, st_, natural, new))
        if not options:
            out.append({'slot': slot, 'player': None, 'why': 'nobody fits'}); continue
        options.sort(key=lambda o: -o[0])
        score, p, st_, natural, new = options[0]
        picked.add(p['name'])
        out.append({'slot': slot, 'player': p['name'], 'natural': natural, 'new_signing': new, 'standing': st_,
                    'alternatives': [o[1]['name'] for o in options[1:3]]})
    return {'tactic': tactic['name'], 'xi': out}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('cmd', choices=['squad', 'scout', 'xi'])
    ap.add_argument('--csv')
    ap.add_argument('--date')
    ap.add_argument('--positions', help='comma-separated positions for scout (e.g. RW,AM)')
    ap.add_argument('--budget', type=float)
    ap.add_argument('--per', type=int, default=6)
    a = ap.parse_args()
    rows, tactic = load(a.csv)
    date = dt.date.fromisoformat(a.date) if a.date else None
    if a.cmd == 'squad':
        r = squad(rows, tactic, date)
    elif a.cmd == 'scout':
        r = scout(rows, tactic, a.positions.split(',') if a.positions else None, a.budget, a.per, date)
    else:
        r = xi(rows, tactic, date)
    print(json.dumps(r, indent=1, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
