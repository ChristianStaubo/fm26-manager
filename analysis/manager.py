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
        # No minutes-based rule: we force one XI all season, so low minutes reflect our selection,
        # not the player's quality (user, 2026-10-09).
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


# ---- Raw scouting: plain output per 90, scaled by league strength (no role weights, no attribute floor)
RAW = {  # position group: (natural positions, metric label, metric(p))
    'ST': ({'ST'}, 'xG+xA /90', lambda p: sr.num(p, 'xg_p90') + sr.num(p, 'xa_p90')),
    'W': ({'AML', 'AMR', 'ML', 'MR'}, 'xG+xA /90', lambda p: sr.num(p, 'xg_p90') + sr.num(p, 'xa_p90')),
    'AM': ({'AMC'}, 'xG+xA /90', lambda p: sr.num(p, 'xg_p90') + sr.num(p, 'xa_p90')),
    'CM': ({'MC'}, 'progressive passes /90', lambda p: sr.num(p, 'progressive_passes_p90')),
    'DM': ({'DM'}, 'possession won /90', lambda p: sr.num(p, 'poss_won_p90')),
    'FB': ({'DL', 'DR', 'WBL', 'WBR'}, 'progressive passes /90', lambda p: sr.num(p, 'progressive_passes_p90')),
    'CB': ({'DC'}, 'avg rating', lambda p: sr.num(p, 'avg_rating')),
    'GK': ({'GK'}, 'goals prevented vs xG /90', lambda p: sr.num(p, 'xgp_p90')),
}


def league_strength(rows):
    """Average ability (CA) of each league's top 200 players, relative to ours (1.0 = our league)."""
    by = {}
    for p in rows:
        if p['competition']:
            by.setdefault(p['competition'], []).append(int(p['ca'] or 0))
    avg = {k: st.mean(sorted(v, reverse=True)[:200]) for k, v in by.items() if len(v) >= 150}
    base = avg.get(LEAGUE) or max(avg.values())
    return {k: v / base for k, v in avg.items()}


def scout_raw(rows, groups=None, budget=None, per=10, min_minutes=900):
    strength = league_strength(rows)
    def adjusted(p, metric, group):
        v, f = metric(p), strength.get(p['competition'])
        if f is None:
            return None
        return round(6 + (v - 6) * f, 2) if group == 'CB' else round(v * f, 3)
    out = {'method': 'one plain stat per position, per 90, x league strength (league top-200 average CA vs ours); 900+ league minutes',
           'league_strength': {k: round(v, 2) for k, v in sorted(strength.items(), key=lambda kv: -kv[1])}, 'groups': []}
    for g, (pos, label, metric) in RAW.items():
        if groups and g not in groups:
            continue
        ours = [p for p in rows if p['contract_club'] == CLUB and p['pos'] & pos and p['mins'] >= min_minutes]
        best_ours = max(ours, key=lambda p: adjusted(p, metric, g) or -1, default=None)
        cands = []
        for p in rows:
            if (p['contract_club'] == CLUB or not (p['pos'] & pos) or p['mins'] < min_minutes or not p['competition']
                    or int(p['value']) >= sr.NOT_FOR_SALE or (budget and int(p['value']) > budget)):
                continue
            a = adjusted(p, metric, g)
            if a is None:
                continue
            cands.append((a, p))
        cands.sort(key=lambda c: -c[0])
        row = lambda a, p: {'name': p['name'], 'club': p['club'], 'league': p['competition'], 'age': int(p['age']),
                            'raw': round(metric(p), 3), 'adjusted': a, 'minutes': int(p['mins']), 'ca': int(p['ca'] or 0),
                            'pa': int(p['pa'] or 0), 'value': int(p['value']), 'wage': int(p['wage'] or 0)}
        bar = adjusted(best_ours, metric, g) if best_ours else None
        # Bargains: at least as good as our best on the stat (CB: within 0.1 rating), cheapest first.
        # …and at our level: ability no more than 10 below our best's (a plain stat alone over-rewards
        # weak leagues: Ligue 2 DMs win the ball more often than Premier League ones).
        ca_floor = max((int(p['ca'] or 0) for p in ours), default=10) - 10
        good = [(a, p) for a, p in cands if (bar is None or a >= (bar - 0.1 if g == 'CB' else bar * 0.95))
                and int(p['ca'] or 0) >= ca_floor]
        bargains = sorted(good, key=lambda c: int(c[1]['value']))
        out['groups'].append({'group': g, 'stat': label,
                              'our_best': best_ours and row(bar, best_ours),
                              'bargains': [row(a, p) for a, p in bargains[:per]],
                              'best': [row(a, p) for a, p in cands[:per]]})
    return out

# ---- Ability lens: players at our level (or young with a high ceiling), by price. Catches what the
# stat lenses can't see: players without minutes (Andrey Santos, 0 league minutes at Chelsea) and
# high-ability players whose role stats undersell them (Querfeld, CA 147, ranked 13/36 on CB volume).
EXTRA_STATS = {'CB': ['avg_rating', 'poss_won_p90', 'interceptions_p90', 'headers_won_p90'],
               'DM': ['poss_won_p90', 'interceptions_p90', 'progressive_passes_p90', 'pass_pct'],
               'CM': ['progressive_passes_p90', 'xa_p90', 'poss_won_p90', 'pass_pct'],
               'FB': ['progressive_passes_p90', 'xa_p90', 'poss_won_p90', 'crosses_cmp_p90'],
               'W': ['xg_p90', 'xa_p90', 'dribbles_p90', 'progressive_passes_p90'],
               'AM': ['xg_p90', 'xa_p90', 'progressive_passes_p90', 'dribbles_p90'],
               'ST': ['xg_p90', 'xa_p90', 'shots_p90', 'header_pct'],
               'GK': ['xgp_p90', 'save_pct', 'avg_rating']}


_EXPECTED = {}
def expected_value(rows, ca, age, pa):
    """Median market value of real-club players with similar ability (CA ±3) and age band; young
    players also matched on potential (PA ±5). The market price of that ability, to compare against."""
    band = 0 if age <= 21 else 1 if age <= 24 else 2 if age <= 27 else 3 if age <= 30 else 4
    key = (ca, band, pa // 5 if band <= 1 else None)
    if key not in _EXPECTED:
        if not _EXPECTED.get('_pool'):
            _EXPECTED['_pool'] = [(int(p['ca'] or 0), int(p['age'] or 99), int(p['pa'] or 0), int(p['value']))
                                  for p in rows if not p['club'].startswith('club#') and 0 < int(p['value']) < sr.NOT_FOR_SALE
                                  and int(p['ca'] or 0) >= 100 and p['contract_expires'][:4] >= '2028']
        def b(a): return 0 if a <= 21 else 1 if a <= 24 else 2 if a <= 27 else 3 if a <= 30 else 4
        vals = [v for c, a, pp, v in _EXPECTED['_pool'] if abs(c - ca) <= 3 and b(a) == band and (band > 1 or abs(pp - pa) <= 5)]
        _EXPECTED[key] = st.median(vals) if len(vals) >= 5 else None
    return _EXPECTED[key]


def scout_ability(rows, groups=None, budget=None, per=10, young_age=23, young_pa=150):
    out = {'method': f"ability (CA) at least our best at the position minus 5, or age <= {young_age} with potential (PA) >= {young_pa}; cheapest first; stats shown when he played 900+ league minutes",
           'groups': []}
    for g, (pos, _, _) in RAW.items():
        if groups and g not in groups:
            continue
        ours = [p for p in rows if p['contract_club'] == CLUB and p['pos'] & pos and not p['on_loan_at']]
        our_best = max(ours, key=lambda p: int(p['ca'] or 0), default=None)
        floor = int(our_best['ca'] or 0) - 5 if our_best else 0
        found = []
        for p in rows:
            if p['contract_club'] == CLUB or not (p['pos'] & pos) or int(p['value']) >= sr.NOT_FOR_SALE or (budget and int(p['value']) > budget):
                continue
            ca, pa, age = int(p['ca'] or 0), int(p['pa'] or 0), int(p['age'] or 99)
            # Real clubs only (unresolved 'club#…' ids are the women's database and unnamed clubs),
            # no veterans, and young players must already be close to our level (CA within 20).
            if p['club'].startswith('club#') or age >= 33:
                continue
            why = ('at our level' if ca >= floor else
                   'young, high ceiling' if age <= young_age and pa >= young_pa and ca >= floor - 15 else None)
            if not why:
                continue
            found.append({'name': p['name'], 'club': p['club'], 'league': p['competition'] or None, 'age': age, 'ca': ca, 'pa': pa,
                          'value': int(p['value']), 'wage': int(p['wage'] or 0), 'contract_until': (p['contract_expires'] or '')[:4],
                          'minutes': int(p['mins']), 'why': why,
                          'stats': {k: round(sr.num(p, k), 2) for k in EXTRA_STATS[g]} if p['mins'] >= 900 else 'no league stats (under 900 min)'})
        # Moneyball order: price relative to what the market charges for this ability and age.
        for c in found:
            exp = expected_value(rows, c['ca'], c['age'], c['pa'])
            c['expected_value'] = int(exp) if exp else None
            c['price_vs_market'] = round(c['value'] / exp, 2) if exp else None
        found.sort(key=lambda c: (c['price_vs_market'] is None, c['price_vs_market'] or 0))
        out['groups'].append({'group': g, 'our_best_ability': our_best and {'name': our_best['name'], 'ca': int(our_best['ca'] or 0)},
                              'candidates': found[:per]})
    return out

def scout_free(rows, groups=None, per=8, date=None):
    """Players available cheaply because of their contract or role: free agents (no club), contracts
    ending this summer (free or a token fee), and fringe/backup players at their clubs (clubs sell
    what they don't use). At our level (CA within 10 of our best at the position), under 33."""
    today = date or today_of(rows)
    season_end = dt.date(today.year if today.month <= 6 else today.year + 1, 6, 30).isoformat()
    # Their current wage is a floor for what they'll ask: over our cap is out of reach.
    wage_cap = wage_bands.bands(rows, CLUB)['median'] * POLICY['contracts']['max_salary_vs_first_team_median']
    out = {'method': f'free agents, contracts ending by {season_end}, fringe/backup at their club; CA >= our best - 10; under 33; current wage <= our cap (£{wage_cap/1e3:.0f}K); strongest first',
           'groups': []}
    for g, (pos, _, _) in RAW.items():
        if groups and g not in groups:
            continue
        ours = [p for p in rows if p['contract_club'] == CLUB and p['pos'] & pos and not p['on_loan_at']]
        floor = max((int(p['ca'] or 0) for p in ours), default=10) - 10
        found = []
        for p in rows:
            if p['contract_club'] == CLUB or not (p['pos'] & pos) or p['club'].startswith('club#') or int(p['age'] or 99) >= 33:
                continue
            if int(p['ca'] or 0) < floor or int(p['wage'] or 0) > wage_cap:
                continue
            free = not p['contract_club']
            expiring = bool(p['contract_expires']) and p['contract_expires'][:10] <= season_end
            fringe = p['squad_status'] in ('Fringe Player', 'Backup')
            if not (free or expiring or fringe):
                continue
            found.append({'name': p['name'], 'club': p['club'] or '(free agent)', 'age': int(p['age']), 'ca': int(p['ca'] or 0),
                          'pa': int(p['pa'] or 0), 'value': int(p['value']), 'wage': int(p['wage'] or 0),
                          'contract_until': (p['contract_expires'] or '')[:10] or None, 'status': p['squad_status'] or None,
                          'why': 'free agent' if free else 'contract ends this summer' if expiring else f"{p['squad_status'].lower()} at his club",
                          'minutes': int(p['mins'])})
        found.sort(key=lambda c: (-c['ca'], c['value']))
        out['groups'].append({'group': g, 'floor_ca': floor, 'candidates': found[:per]})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('cmd', choices=['squad', 'scout', 'xi'])
    ap.add_argument('--csv')
    ap.add_argument('--date')
    ap.add_argument('--positions', help='comma-separated positions for scout (e.g. RW,AM)')
    ap.add_argument('--budget', type=float)
    ap.add_argument('--per', type=int, default=6)
    ap.add_argument('--raw', action='store_true', help='scout on plain per-90 output x league strength')
    ap.add_argument('--ability', action='store_true', help='scout on ability: at our level, or young with a high ceiling')
    ap.add_argument('--free', action='store_true', help='free agents, expiring contracts, fringe/backup players at their clubs')
    a = ap.parse_args()
    rows, tactic = load(a.csv)
    date = dt.date.fromisoformat(a.date) if a.date else None
    if a.cmd == 'squad':
        r = squad(rows, tactic, date)
    elif a.cmd == 'scout' and a.free:
        r = scout_free(rows, a.positions.split(',') if a.positions else None, a.per if a.per != 6 else 8, date)
    elif a.cmd == 'scout' and a.ability:
        r = scout_ability(rows, a.positions.split(',') if a.positions else None, a.budget, a.per if a.per != 6 else 10)
    elif a.cmd == 'scout' and a.raw:
        r = scout_raw(rows, a.positions.split(',') if a.positions else None, a.budget, a.per if a.per != 6 else 10)
    elif a.cmd == 'scout':
        r = scout(rows, tactic, a.positions.split(',') if a.positions else None, a.budget, a.per, date)
    else:
        r = xi(rows, tactic, date)
    print(json.dumps(r, indent=1, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
