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
import os
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


# ---- Visible ability: FM's CA/PA are hidden from a real manager, so the manager never sees or uses
# them (user, 2026-10-09). Ability = the average of the role's key attributes (1-20), as seen on a
# player's profile. Lens groups → the role whose attributes count.
GROUP_ROLE = {'GK': 'GK', 'CB': 'CB', 'FB': 'FB (defensive)', 'DM': 'DM', 'CM': 'CM', 'W': 'Winger', 'AM': 'AMC', 'ST': 'ST'}
ALL_ATTRS = sorted({a for _, _, attrs in sr.ROLES.values() for a in attrs})


def attr(p, role):
    """Average of the role's key attributes (1-20)."""
    return round(st.mean(sr.num(p, a) for a in sr.ROLES[role][2]), 2)


def attr_all(p):
    return st.mean(sr.num(p, a) for a in ALL_ATTRS)


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
    """The save's 'now'. Exports carry no game date: fm passes the live one (FM_GAME_DATE); without
    it, fall back to the latest join date at our club (can be months old)."""
    if os.environ.get('FM_GAME_DATE'):
        return dt.date.fromisoformat(os.environ['FM_GAME_DATE'])
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
                 'cover': [p['name'] for p in cover], 'specialists_have': len(spec),
                 'specialists_target': need_spec, 'note': f"{len(slots)} slot(s) x {pol_sq['per_position']} per slot; versatile cover counts towards {pol_sq['options_per_position']} options per slot"}
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
        # Sell high on a lucky finishing season (loanees too: Correia, 13 goals from 5.9 xG at Ajax).
        gx = sr.num(p, 'goals_minus_xg')
        if gx >= pol_sell.get('overperformer_goals_over_xg', 99) and age >= pol_sell.get('overperformer_min_age', 0):
            out['sell_candidates'].append({'name': p['name'], 'age': age, 'wage': wage, 'value': int(p['value']),
                                           'why': f"overperformer: {sr.num(p, 'goals'):.0f} goals from {sr.num(p, 'xg'):.1f} xG; finishing regresses, value peaks now"})
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
    # Contracts ending this season are 'let go' decisions (renew or not), not sales.
    end = str(today.year)
    out['expiring'] = [c for c in uniq if any(x['name'] == c['name'] and (x['contract_expires'] or '9')[:4] <= end for x in ours)]
    out['sell_candidates'] = [c for c in uniq if c not in out['expiring']]
    first_team = sorted((attr_all(p) for p in ours if int(p['age'] or 0) >= pol_sq['youth_age_under']), reverse=True)[:22]
    bar = st.median(first_team) - pol_sq['youth_keep_attr_gap'] if first_team else 0
    for p in ours:
        if int(p['age'] or 99) < pol_sq['youth_age_under']:
            a = round(attr_all(p), 2)
            out['youth'].append({'name': p['name'], 'age': int(p['age']), 'attributes': a, 'on_loan_at': p['on_loan_at'] or None,
                                 'advice': 'keep' if a >= bar else 'loan or sell'})
    out['youth'].sort(key=lambda y: -y['attributes'])
    loan_or_sell = [y for y in out['youth'] if y['advice'] != 'keep']
    out['youth'] = {'keep': [y for y in out['youth'] if y['advice'] == 'keep'],
                    'loan_or_sell': f"{len(loan_or_sell)} others (lower potential): loan or sell when bids come"}
    out['hierarchy'] = load_hierarchy()
    tiers = {}
    for tier in ('team_leaders', 'highly_influential', 'influential'):
        for n in out['hierarchy'].get(tier, []):
            tiers.setdefault(n, tier)
    for c in out['sell_candidates'] + out['expiring']:
        c['hierarchy'] = tiers.get(c['name'], 'other' if tiers else 'unknown')
        if c['hierarchy'] in POLICY['selling']['limited_hierarchy']:
            c['why'] += ' | Highly Influential or above: counts towards the one-per-window limit'
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
            # Visible ability (role attributes) anchors the pick; this season's output moves it (±15 at the extremes); no
            # output record costs a little. Natural position and being a new signing count.
            ability = attr(p, role) * 10  # visible attributes (1-20) on a CA-like scale
            form = (st_['pct'] - 50) * 0.3 if st_.get('ranked') else -5
            score = ability + form + (10 if natural else -15) + (8 if new else 0)
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

def minutes_floor(rows):
    """Per league: the minutes a regular starter has in the export's data window (other clubs'
    players carry only ~their last 20 league games): buying.min_minutes_share x the 97th percentile (an ever-present)."""
    by = {}
    for p in rows:
        if p['competition'] and p['contract_club'] != CLUB and p['mins'] > 0:
            by.setdefault(p['competition'], []).append(p['mins'])
    share = POLICY['buying']['min_minutes_share']
    return {c: share * sorted(m)[int(0.97 * (len(m) - 1))] for c, m in by.items() if len(m) >= 20}


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


# Squad positions (fm squad) → lens groups.
LENS_GROUP = {'LW': 'W', 'RW': 'W', 'W': 'W', 'LB': 'FB', 'RB': 'FB', 'FB': 'FB', 'AM': 'AM', 'CM': 'CM', 'DM': 'DM',
              'CB': 'CB', 'ST': 'ST', 'GK': 'GK'}


def lens_groups(positions):
    return {LENS_GROUP.get(p.upper(), p.upper()) for p in positions} if positions else None


def league_strength(rows):
    """Average visible ability (all attributes) of each league's top 200 players, relative to ours."""
    by = {}
    for p in rows:
        if p['competition']:
            by.setdefault(p['competition'], []).append(attr_all(p))
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
    out = {'method': 'one plain stat per position, per 90, x league strength (league top-200 average attributes vs ours); 900+ league minutes',
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
                            'raw': round(metric(p), 3), 'adjusted': a, 'minutes': int(p['mins']), 'attributes': attr(p, GROUP_ROLE[g]),
                            'value': int(p['value']), 'wage': int(p['wage'] or 0)}
        bar = adjusted(best_ours, metric, g) if best_ours else None
        # Bargains: at least as good as our best on the stat (CB: within 0.1 rating), cheapest first.
        # …and at our level: role attributes no more than 1.0 below our best's (a plain stat alone over-rewards
        # weak leagues: Ligue 2 DMs win the ball more often than Premier League ones).
        attr_floor = max((attr(p, GROUP_ROLE[g]) for p in ours), default=0) - 1.0
        good = [(a, p) for a, p in cands if (bar is None or a >= (bar - 0.1 if g == 'CB' else bar * 0.95))
                and attr(p, GROUP_ROLE[g]) >= attr_floor]
        bargains = sorted(good, key=lambda c: int(c[1]['value']))
        out['groups'].append({'group': g, 'stat': label,
                              'our_best': best_ours and row(bar, best_ours),
                              'bargains': [row(a, p) for a, p in bargains[:per]],
                              'best': [row(a, p) for a, p in cands[:per]]})
    return out

# ---- Ability lens: players at our level (or young with a high ceiling), by price. Catches what the
# stat lenses can't see: players without minutes (Andrey Santos, 0 league minutes at Chelsea) and
# high-ability players whose role stats undersell them (Querfeld: strong attributes, ranked 13/36 on CB volume).
EXTRA_STATS = {'CB': ['avg_rating', 'poss_won_p90', 'interceptions_p90', 'headers_won_p90'],
               'DM': ['poss_won_p90', 'interceptions_p90', 'progressive_passes_p90', 'pass_pct'],
               'CM': ['progressive_passes_p90', 'xa_p90', 'poss_won_p90', 'pass_pct'],
               'FB': ['progressive_passes_p90', 'xa_p90', 'poss_won_p90', 'crosses_cmp_p90'],
               'W': ['xg_p90', 'xa_p90', 'dribbles_p90', 'progressive_passes_p90'],
               'AM': ['xg_p90', 'xa_p90', 'progressive_passes_p90', 'dribbles_p90'],
               'ST': ['xg_p90', 'xa_p90', 'shots_p90', 'header_pct'],
               'GK': ['xgp_p90', 'save_pct', 'avg_rating']}


_EXPECTED = {}
def expected_value(rows, group, a, age):
    """Median market value of real-club players at this position with similar visible ability (role
    attributes ±0.3) and age band: what the market charges for that ability. No hidden CA/PA."""
    band = 0 if age <= 21 else 1 if age <= 24 else 2 if age <= 27 else 3 if age <= 30 else 4
    key = (group, round(a, 1), band)
    if key not in _EXPECTED:
        pool_key = ('_pool', group)
        if pool_key not in _EXPECTED:
            pos = RAW[group][0]
            _EXPECTED[pool_key] = [(attr(p, GROUP_ROLE[group]), int(p['age'] or 99), int(p['value'])) for p in rows
                                   if p['pos'] & pos and not p['club'].startswith('club#') and 0 < int(p['value']) < sr.NOT_FOR_SALE
                                   and (p['contract_expires'] or '0')[:4] >= '2028']
        def b(x): return 0 if x <= 21 else 1 if x <= 24 else 2 if x <= 27 else 3 if x <= 30 else 4
        vals = [v for aa, ag, v in _EXPECTED[pool_key] if abs(aa - a) <= 0.3 and b(ag) == band]
        _EXPECTED[key] = st.median(vals) if len(vals) >= 5 else None
    return _EXPECTED[key]


def scout_ability(rows, groups=None, budget=None, per=10, young_age=21):
    """Attributes lens: role attributes at or near our best at the position, or young and already
    close; 'candidates' = most underpriced vs the market price of that ability and age,
    'best_ability' = strongest within budget. Visible attributes only (no CA/PA)."""
    year = str(today_of(rows).year)
    out = {'method': f"role attributes >= our best at the position - 0.5, or age <= {young_age} within 1.5 of it; "
                     "'candidates' = most underpriced vs the market price of that ability/age, 'best_ability' = strongest within budget; "
                     "stats when he played 900+ league minutes; expiring contracts are in the free lens", 'groups': []}
    for g, (pos, _, _) in RAW.items():
        if groups and g not in groups:
            continue
        role = GROUP_ROLE[g]
        ours = [p for p in rows if p['contract_club'] == CLUB and p['pos'] & pos and not p['on_loan_at']]
        our_best = max(ours, key=lambda p: attr(p, role), default=None)
        floor = attr(our_best, role) - 0.5 if our_best else 0
        found = []
        for p in rows:
            if (p['contract_club'] == CLUB or not (p['pos'] & pos) or int(p['value']) >= sr.NOT_FOR_SALE
                    or (budget and int(p['value']) > budget) or p['club'].startswith('club#')):
                continue
            age = int(p['age'] or 99)
            if age >= 33 or (p['contract_expires'] or '9')[:4] <= year:
                continue  # expiring contracts: see the free lens
            a = attr(p, role)
            why = 'at our level' if a >= floor else 'young, near our level' if age <= young_age and a >= floor - 1.0 else None
            if not why:
                continue
            exp = expected_value(rows, g, a, age)
            found.append({'name': p['name'], 'club': p['club'], 'league': p['competition'] or None, 'age': age, 'attributes': a,
                          'value': int(p['value']), 'wage': int(p['wage'] or 0), 'contract_until': (p['contract_expires'] or '')[:4],
                          'minutes': int(p['mins']), 'why': why, 'expected_value': int(exp) if exp else None,
                          'price_vs_market': round(int(p['value']) / exp, 2) if exp else None,
                          'stats': {k: round(sr.num(p, k), 2) for k in EXTRA_STATS[g]} if p['mins'] >= 900 else 'no league stats (under 900 min)'})
        out['groups'].append({'group': g, 'our_best': our_best and {'name': our_best['name'], 'attributes': attr(our_best, role)},
                              'candidates': sorted(found, key=lambda c: (c['price_vs_market'] is None, c['price_vs_market'] or 0))[:per],
                              'best_ability': sorted(found, key=lambda c: (-c['attributes'], c['value']))[:per]})
    return out


def scout_free(rows, groups=None, per=8, date=None):
    """Players available cheaply because of their contract or role: free agents (no club), contracts
    ending this summer (free or a token fee), and fringe/backup players at their clubs (clubs sell
    what they don't use). At our level (role attributes within 1.0 of our best), under 33, current
    wage within our cap."""
    today = date or today_of(rows)
    season_end = dt.date(today.year if today.month <= 6 else today.year + 1, 6, 30).isoformat()
    wage_cap = wage_bands.bands(rows, CLUB)['median'] * POLICY['contracts']['max_salary_vs_first_team_median']
    out = {'method': f'free agents, contracts ending by {season_end}, fringe/backup at their club; role attributes >= our best - 1.0; '
                     f'under 33; current wage <= our cap (£{wage_cap/1e3:.0f}K); strongest first', 'groups': []}
    for g, (pos, _, _) in RAW.items():
        if groups and g not in groups:
            continue
        role = GROUP_ROLE[g]
        ours = [p for p in rows if p['contract_club'] == CLUB and p['pos'] & pos and not p['on_loan_at']]
        floor = max((attr(p, role) for p in ours), default=0) - 1.0
        found = []
        for p in rows:
            if p['contract_club'] == CLUB or not (p['pos'] & pos) or p['club'].startswith('club#') or int(p['age'] or 99) >= 33:
                continue
            a = attr(p, role)
            if a < floor or int(p['wage'] or 0) > wage_cap:
                continue
            # Free agent = no club. A club with no decoded contract is an export gap (Lennon Miller,
            # Udinese, cost a £10M bid), not free agency: 3,861 such players, 0 clubless (2027-05).
            free = not p['club']
            expiring = bool(p['contract_expires']) and p['contract_expires'][:10] <= season_end
            fringe = p['squad_status'] in ('Fringe Player', 'Backup')
            if not (free or expiring or fringe):
                continue
            found.append({'name': p['name'], 'club': p['contract_club'] or (f"{p['club']} (contract not in export: check in game)" if p['club'] else '(free agent)'), 'age': int(p['age']), 'attributes': a,
                          'value': int(p['value']), 'wage': int(p['wage'] or 0),
                          'contract_until': (p['contract_expires'] or '')[:10] or None, 'status': p['squad_status'] or None,
                          'why': 'free agent' if free else 'contract ends this summer' if expiring else f"{p['squad_status'].lower()} at his club",
                          'minutes': int(p['mins']),
                          'stats': {k: round(sr.num(p, k), 2) for k in EXTRA_STATS[g]} if p['mins'] >= 900 else 'no league stats (under 900 min)'})
        found.sort(key=lambda c: (-c['attributes'], c['value']))
        out['groups'].append({'group': g, 'our_best_attributes': round(floor + 1.0, 2), 'candidates': found[:per]})
    return out


def price(rows, name):
    """Our price for any player (targets too): open at buying.open_at x his value (FM's value, mid-range), walk
    away above buying.default_max x the top; the range is his value +-10% (the game shows a scouted range)."""
    b = POLICY['buying']
    cands = [p for p in rows if p['name'].lower() == name.lower()] or [p for p in rows if name.lower() in p['name'].lower()]
    if not cands:
        return {'error': f'no player named {name}'}
    p = max(cands, key=lambda p: int(p['value']))
    v = int(p['value']); lo, hi = v * 0.9, v * 1.1
    cap = wage_bands.bands(rows, CLUB)['median'] * POLICY['contracts']['max_salary_vs_first_team_median']
    return {'name': p['name'], 'club': p['contract_club'] or (f"{p['club']} (contract not in export: check in game)" if p['club'] else '(free agent)'), 'age': int(p['age']), 'positions': p['positions'],
            'value': v, 'range_estimate': [round(lo), round(hi)], 'open_at': round(v * b['open_at']), 'walk_away': round(hi * b['default_max']),
            'wage': int(p['wage'] or 0), 'wage_cap': round(cap), 'wage_ok': int(p['wage'] or 0) <= cap,
            'contract_until': (p['contract_expires'] or '')[:10] or None, 'ours': p['contract_club'] == CLUB,
            'note': 'live range from his profile beats this estimate (fm player)'}
# ---- Best players (not Moneyball): who is simply better, then filter by price. Uses FM's current
# ability (CA) on purpose (user, 2026-10-10: a demo of Claude playing FM, find the best players).
BEST_STATS = {
    'ST': ['xg_p90', 'xa_p90', 'shots_p90', 'header_pct', 'avg_rating'],
    'W': ['xg_p90', 'xa_p90', 'dribbles_p90', 'progressive_passes_p90', 'crosses_cmp_p90', 'avg_rating'],
    'AM': ['xg_p90', 'xa_p90', 'progressive_passes_p90', 'dribbles_p90', 'pass_pct', 'avg_rating'],
    'CM': ['progressive_passes_p90', 'xa_p90', 'poss_won_p90', 'passes_cmp_p90', 'pass_pct', 'avg_rating'],
    'DM': ['poss_won_p90', 'interceptions_p90', 'tackles_won_p90', 'progressive_passes_p90', 'pass_pct', 'avg_rating'],
    'FB': ['progressive_passes_p90', 'xa_p90', 'crosses_cmp_p90', 'poss_won_p90', 'interceptions_p90', 'avg_rating'],
    'CB': ['avg_rating', 'poss_won_p90', 'interceptions_p90', 'headers_won_p90', 'header_pct', 'pass_pct'],
    'GK': ['xgp_p90', 'save_pct', 'pass_pct'],  # no avg rating: it reflects the defence (YouTuber's GK rule)
}
RATE_STATS = {'pass_pct', 'header_pct', 'save_pct'}  # percentages: not scaled by league strength


def scout_best(rows, groups=None, max_value=None, max_wage=None, max_age=None, per=12, min_minutes=None, include_loans=False):
    floor = minutes_floor(rows)
    enough = lambda p: p['mins'] >= (min_minutes or floor.get(p['competition'], 10**9))
    strength = league_strength(rows)
    def adj(p, k):
        v, f = sr.num(p, k), strength.get(p['competition'], 0)
        if k in RATE_STATS:
            return v
        return 6 + (v - 6) * f if k == 'avg_rating' else v * f
    out = {'method': 'quality = current ability (CA) + 0.5 x (average stat percentile - 50); stats per 90, league-adjusted, '
                     'percentiles vs Premier League players at the position; everyone judged on buying.min_minutes_sample+ league minutes (small samples regress); candidates are better than our weakest starter there (bar); beats_ours = stats at or above his',
           'groups': []}
    for g, (pos, _, _) in RAW.items():
        if groups and g not in groups:
            continue
        stats = BEST_STATS[g]
        peers = [p for p in rows if p['competition'] == LEAGUE and p['pos'] & pos and enough(p)]
        dist = {k: sorted(adj(p, k) for p in peers) for k in stats}
        def pct(k, v):
            d = dist[k]
            return round(100 * sum(x <= v for x in d) / len(d)) if d else 50
        def card(p):
            vals = {k: round(adj(p, k), 2) for k in stats}
            pcts = {k: pct(k, v) for k, v in vals.items()}
            score = st.mean(pcts.values())
            ca = int(p['ca'] or 0)
            return {'name': p['name'], 'club': p['contract_club'] or (f"{p['club']} (contract not in export: check in game)" if p['club'] else '(free agent)'),
                    **({'on_loan_at': p['on_loan_at'], 'loan_ends': (p['loan_ends'] or '')[:10]} if p['on_loan_at'] else {}),
                    'league': p['competition'], 'age': int(p['age'] or 0),
                    'ca': ca, 'pa': int(p['pa'] or 0), 'quality': round(ca + 0.5 * (score - 50), 1), 'stat_pct': round(score),
                    'stats': {k: f"{vals[k]} ({pcts[k]}%)" for k in stats}, '_vals': vals,
                    'value': int(p['value']), 'wage': int(p['wage'] or 0), 'contract_until': (p['contract_expires'] or '')[:4] or None,
                    'minutes': int(p['mins'])}
        ours = sorted((card(p) for p in rows if p['contract_club'] == CLUB and p['pos'] & pos and p['mins'] >= floor.get(LEAGUE, 900) and not p['on_loan_at']),
                      key=lambda c: -c['quality'])
        # The bar: our weakest starter at the position (2nd best where the shape has two: CB, DM, W, FB).
        slots = 2 if g in ('CB', 'DM', 'W', 'FB') else 1
        best_ours = ours[min(slots, len(ours)) - 1] if ours else None
        found = []
        for p in rows:
            if (p['contract_club'] == CLUB or not (p['pos'] & pos) or not enough(p) or not p['competition']
                    or p['club'].startswith('club#') or int(p['value']) >= sr.NOT_FOR_SALE):
                continue
            if (max_value and int(p['value']) > max_value) or (max_wage and int(p['wage'] or 0) > max_wage) or (max_age and int(p['age'] or 99) > max_age):
                continue
            # Loanees: 'club' is the loan club and loans often end in a permanent move there
            # (Samardzic: Atalanta's, on loan at Fulham; Kjaergaard: Salzburg's, at Palace). Skip unless asked.
            if p['on_loan_at'] and not include_loans:
                continue
            # Personality from the scout report: inconsistent players and big-match flops are skipped.
            if sr.num(p, 'Consistency') < POLICY['buying']['min_consistency'] or sr.num(p, 'Important Matches') < POLICY['buying']['min_important_matches']:
                continue
            c = card(p)
            if best_ours and c['quality'] < best_ours['quality']:
                continue  # better than our best only
            if best_ours:
                c['beats_ours'] = f"{sum(c['_vals'][k] >= best_ours['_vals'][k] for k in stats)}/{len(stats)}"
            found.append(c)
        found.sort(key=lambda c: -c['quality'])
        for c in found:
            c.pop('_vals', None)
        for c in ours:
            c.pop('_vals', None)
        out['groups'].append({'group': g, 'bar': best_ours and f"{best_ours['name']} (our #{slots} at {g})", 'ours': ours[:3],
                              'better_than_ours': len(found), 'candidates': found[:per]})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('cmd', choices=['squad', 'scout', 'xi', 'price'])
    ap.add_argument('name', nargs='?')
    ap.add_argument('--csv')
    ap.add_argument('--date')
    ap.add_argument('--positions', help='comma-separated positions for scout (e.g. RW,AM)')
    ap.add_argument('--budget', type=float)
    ap.add_argument('--per', type=int, default=6)
    ap.add_argument('--raw', action='store_true', help='scout on plain per-90 output x league strength')
    ap.add_argument('--ability', action='store_true', help='scout on ability: at our level, or young with a high ceiling')
    ap.add_argument('--free', action='store_true', help='free agents, expiring contracts, fringe/backup players at their clubs')
    ap.add_argument('--best', action='store_true', help='simply the best players (CA + stats), filter by price')
    ap.add_argument('--max-value', type=float)
    ap.add_argument('--max-wage', type=float)
    ap.add_argument('--max-age', type=int)
    ap.add_argument('--include-loans', action='store_true', help='also players currently on loan (their loan club may keep them)')
    a = ap.parse_args()
    rows, tactic = load(a.csv)
    date = dt.date.fromisoformat(a.date) if a.date else None
    if a.cmd == 'squad':
        r = squad(rows, tactic, date)
    elif a.cmd == 'scout' and a.best:
        r = scout_best(rows, lens_groups(a.positions.split(',')) if a.positions else None, a.max_value or a.budget, a.max_wage, a.max_age,
                       a.per if a.per != 6 else 12, include_loans=a.include_loans)
    elif a.cmd == 'scout' and a.free:
        r = scout_free(rows, lens_groups(a.positions.split(',')) if a.positions else None, a.per if a.per != 6 else 8, date)
    elif a.cmd == 'scout' and a.ability:
        r = scout_ability(rows, lens_groups(a.positions.split(',')) if a.positions else None, a.budget, a.per if a.per != 6 else 10)
    elif a.cmd == 'scout' and a.raw:
        r = scout_raw(rows, lens_groups(a.positions.split(',')) if a.positions else None, a.budget, a.per if a.per != 6 else 10)
    elif a.cmd == 'scout':
        r = scout(rows, tactic, a.positions.split(',') if a.positions else None, a.budget, a.per, date)
    elif a.cmd == 'price':
        r = price(rows, a.name or '')
    else:
        r = xi(rows, tactic, date)
    print(json.dumps(r, indent=1, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
