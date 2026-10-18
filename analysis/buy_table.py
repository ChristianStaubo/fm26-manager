#!/usr/bin/env python3
"""The buy decision table (user, 2033-09-01): which positions need a signing, and the best-value
candidates for each (JSON on stdout).

Per position, from our depth chart (depth.py; U21s count, loanees back within 60 days too):
  replace  a starter is leaving (user, 2026-10-19: like-for-like only ever buys elite players as the squad
           gets elite): CA >= the position's starters' average (the leaver included) - replace_range, or 23
           or under with PA >= the leaver's CA and CA within another replace_range; up to soft_max_fee first
           (user: "ideally not above £50M"); ranked by (CA + PA) / 2: now and the ceiling
  upgrade  CA >= our weakest starter + upgrade_by; a buy only if age <= upgrade_max_age, fee at value,
           wage within the ceiling and the season's net spend stays positive; when the surplus can't pay,
           the best one is a buy once a player at that position is sold (buy_if_sold: the displaced
           starter first; user, 2026-10-18: "if Froholdt sells, it might make sense to get this guy")
  backup   no backup within backup_within CA of min(weakest starter, squad average) (naturals or cover; not a starter
           elsewhere; one position each):
           CA >= starter - backup_within; free first, aim <= backup_aim_fee, at most backup_max_fee
January: replacements and missing backups, no upgrades (clubs ask more mid-season; user, 2033-09-01).
Summer: everything.
Every case: younger preferred; 29+ only when free; wage within the signing's ceiling (personal terms).
The season's net spend (fees in vs out) must stay positive: checked by the caller, reported here.

Usage: python3 analysis/buy_table.py [--leaving "Name,Name"]
"""
import argparse
import json
import os

import manager as m
import depth

RULES = m.POLICY.get('buying', {}).get('table', {})
R = {'replace_within': 3, 'upgrade_by': 8, 'backup_within': 25, 'backup_aim_fee': 10e6, 'backup_max_fee': 20e6,
     'old_from_age': 29, 'min_age': 18, 'top': 3, 'replace_range': 10, 'soft_max_fee': 50e6, 'backup_max_wage': 80000, 'upgrade_max_age': 25, 'squad_size': 22, 'backup_ca_spread': 10, 'wonderkid_min_pa': 175, 'wonderkid_min_age': 16, 'wonderkid_max_age': 20, 'wonderkid_max_fee': 15e6, 'wonderkids_per_window': 4, **RULES}


def candidates(rows, slot, min_ca, max_fee=None, n=R['top'], max_wage=None, best=False):
    out = []
    for p in rows:
        if p.get('on_loan_at'):   # can't be bought mid-loan (Bouaskar: "on loan with a future fee clause", 2034-01-01)
            continue
        free = p['club'] == 'Free agent'
        if p['contract_club'] == m.CLUB or (p['contract_club'] == '' and not free) or (p['club'] or '').startswith('club#'):
            continue
        age, ca, value = m.intval(p, 'age'), m.intval(p, 'ca'), float(p['value'] or 0)
        if ca < min_ca or age < R['min_age'] or depth.best_rating(p, slot) < 18 or not 0 < value < 1e9:
            continue
        old = R['old_from_age'] + (3 if slot == 'GK' else 0)   # keepers age later (user, 2034-07-03)
        if age >= old and not free:   # 29+ (32+ for keepers): only an outstanding free agent
            continue
        if max_fee is not None and value > max_fee:
            continue
        if max_wage is not None and float(p['wage'] or 0) > max_wage:
            continue
        out.append({'name': p['name'], 'club': p['contract_club'], 'age': age, 'ca': ca, 'pa': m.intval(p, 'pa'),
                    'value': int(value), 'wage': int(float(p['wage'] or 0)), 'contract_until': (p.get('contract_expires') or '')[:10], 'free_agent': free})
    # Replacements: the cheapest that clears the bar (younger breaks ties within £1M). Backups (best=True):
    # the highest CA within the fee limit, cheaper on ties (Hellstern 138 for £1.3M over Norda 121 for £0.4M).
    if best and out:
        # Backups: the cheapest within backup_ca_spread of the best affordable CA (user, 2033-09-01:
        # Bouaskar 142 for £1.9M over Pizarro 148 for £5.7M).
        top = max(c['ca'] for c in out)
        out = [c for c in out if c['ca'] >= top - R['backup_ca_spread']]
        out.sort(key=lambda c: (c['value'], -c['ca'], c['age']))
    else:
        out.sort(key=lambda c: (round(c['value'] / 1e6), c['age'], -c['ca']))
    return out[:n]


def replacements(rows, slot, leaver_ca, pos_avg, n=8):
    """Candidates to replace a departing starter (user, 2026-10-19: "take the average CA we have of this
    position and have a range... a younger player who has a lower CA but super high potential also makes
    sense"). Loanees back at their club within 60 days count (they can be bought then)."""
    today, rng, cap = m.today_of(rows), R['replace_range'], R['soft_max_fee']
    bar, young_bar = pos_avg - rng, pos_avg - 2 * rng
    out = []
    for p in rows:
        if p.get('on_loan_at') and not m.back_by(p, today):
            continue
        free = p['club'] == 'Free agent'
        if p['contract_club'] == m.CLUB or (p['contract_club'] == '' and not free) or (p['club'] or '').startswith('club#'):
            continue
        age, ca, pa, value = m.intval(p, 'age'), m.intval(p, 'ca'), m.intval(p, 'pa'), float(p['value'] or 0)
        if age < R['min_age'] or depth.best_rating(p, slot) < 18 or not 0 < value < 1e9 or (age >= R['old_from_age'] + (3 if slot == 'GK' else 0) and not free):
            continue
        young = age <= 23 and pa >= leaver_ca and ca >= young_bar
        if ca < bar and not young:
            continue
        out.append({'name': p['name'], 'club': p['contract_club'], 'age': age, 'ca': ca, 'pa': pa, 'value': int(value), 'wage': int(float(p['wage'] or 0)),
                    'contract_until': (p.get('contract_expires') or '')[:10], 'free_agent': free, 'over_cap': value > cap,
                    'why': f'young: PA {pa} >= {leaver_ca}' if ca < bar else f'CA {ca} >= {bar}', **({'back_from_loan': p['on_loan_at']} if p.get('on_loan_at') else {})})
    out.sort(key=lambda c: (c['over_cap'], -(c['ca'] + c['pa']) / 2, c['value']))
    return out[:n]


BRITISH_IRISH = {'England', 'Wales', 'Scotland', 'Northern Ireland', 'Republic of Ireland'}


def wonderkids(rows):
    """Summer only (user, 2034-07-03: "a good use of our funds"): prospects with PA >= wonderkid_min_pa,
    aged wonderkid_min_age-wonderkid_max_age (18+ unless British/Irish: foreign under-18s can't join), at
    most wonderkid_max_fee, wage <= backup_max_wage; the best PA first, cheaper on ties; up to
    wonderkids_per_window. They go on the loan list when they join unless they'd start."""
    out = []
    for p in rows:
        if p['contract_club'] in (m.CLUB, '') or (p['club'] or '').startswith('club#') or p.get('on_loan_at'):
            continue
        age, pa, value = m.intval(p, 'age'), m.intval(p, 'pa'), float(p['value'] or 0)
        # Bought (with a fee) only at buy_min_pa: a couple of good ones (user, 2026-10-18). A free one at
        # wonderkid_min_pa is always a buy (free_agents.py).
        if pa < max(R['wonderkid_min_pa'], m.POLICY.get('wonderkids', {}).get('buy_min_pa', 0)) or not R['wonderkid_min_age'] <= age <= R['wonderkid_max_age']:
            continue
        if age < 18 and p.get('nation') not in BRITISH_IRISH:
            continue
        if not 0 < value <= R['wonderkid_max_fee'] or float(p['wage'] or 0) > R['backup_max_wage']:
            continue
        out.append({'name': p['name'], 'club': p['contract_club'], 'age': age, 'ca': m.intval(p, 'ca'), 'pa': pa, 'positions': p.get('positions', ''),
                    'nation': p.get('nation'), 'value': int(value), 'wage': int(float(p['wage'] or 0))})
    out.sort(key=lambda c: (-c['pa'], c['value']))
    return out[:R['wonderkids_per_window']]


def table(rows, tactic, leaving=(), season_surplus=0, window='summer', departed=(), selling=()):
    """departed: starters at the last buy checkpoint ({name, position, ca}); one no longer ours is
    replaced like one leaving now (user, 2035-01-01: Stringfellow left on deadline day and January
    listed no striker). selling: sales we plan but haven't made (the sell table's, a promise price:
    Miceli at £81M, 2036-06): needs are planned without them, and a starter's replacement is bought only
    once he is sold (the need carries if_sold)."""
    selling = set(selling) - set(leaving)
    leaving = set(leaving) | selling
    left, planned_at = {}, {}
    for pos, v in depth.chart(rows, tactic).items():
        left[pos] = [x for x in v['players'][:v['slots']] if x['name'] in leaving]
        planned_at[pos] = [x['name'] for x in v['players'] if x['name'] in selling]
    ours_now = {p['name'] for p in rows if p['contract_club'] == m.CLUB}
    for x in departed:
        if x['name'] not in ours_now and x['position'] in left:
            left[x['position']].append(x)
    rows_now = [r for r in rows if r['name'] not in leaving]
    chart = depth.chart(rows_now, tactic)
    _, assigned = depth.roles(rows_now, tactic)
    slot_of = {}
    for s in tactic['slots']:
        slot_of.setdefault(m.GROUP.get(s['slot'], s['slot']), s['slot'])
    # Starters everywhere first: a player who starts somewhere can't be another position's backup, and
    # each player backs up one position only. Cover players (rated 15-17) count as backup when close
    # enough (user, 2033-09-01: Nomoko covers LW).
    bands = m.wage_bands.bands(rows, m.CLUB)
    wage_cap = bands['median'] * m.POLICY['contracts']['max_salary_vs_first_team_median']   # the hard wage cap
    # The squad's level (user, 2033-09-01: a great starter shouldn't raise the backup bar; Carroll 128 is
    # fine behind Brown 154): the mean CA of our top `squad_size` players.
    squad_avg, backup_level = m.squad_level(rows)   # the squad's level before the sales we plan (2036-06: 149, not 141)
    starters_all = {x['name'] for v in chart.values() for x in v['players'][:v['slots']]}
    used = set()
    out = []
    for pos, v in chart.items():
        n, players, slot = v['slots'], v['players'], slot_of[pos]
        starters = players[:n]
        # A departed starter is replaced already if someone now starts at his level (bought since).
        left[pos] = [x for x in left.get(pos, []) if x['name'] in leaving or min((s['ca'] for s in starters), default=0) < x['ca'] - R['replace_within']]
        weakest = min((x['ca'] for x in starters), default=0)
        bar = min(weakest, squad_avg) - R['backup_within']
        found = []
        for _ in range(depth.backups(n)):   # three CBs → two backups (user, 2034-01-01)
            b = next((x for x in players[n:] if x['name'] not in starters_all and x['name'] not in used and x['ca'] >= bar and not x.get('develop')), None)
            if b:
                used.add(b['name']); found.append(b)
        missing = depth.backups(n) - len(found)
        # Who could be sold to pay for an upgrade here: the starter it displaces, then the rest of the
        # position (not starting elsewhere).
        # Planned sales there come first (Froholdt for Senhaji); prospects going on loan are not sellers.
        sellers = planned_at.get(pos, []) + [x['name'] for x in sorted(starters, key=lambda x: x['ca'])[:1]] + [x['name'] for x in players[n:] if x['name'] not in starters_all and not x.get('develop')]
        row = {'position': pos, 'weakest': weakest, '_sellers': sellers, 'starters': [f"{x['name']} {x['ca']}" for x in starters],
               'backup': ', '.join(f"{b['name']} {b['ca']}{'' if b['natural'] else ' (cover)'}" for b in found) or None, 'needs': []}
        for x in left.get(pos, []):
            # The starters before he left: the leavers plus the best of those still here (not the backup who moved up).
            kept = sorted(starters, key=lambda s: -s['ca'])[:max(0, n - len(left[pos]))]
            pos_avg = round(sum([s['ca'] for s in kept] + [y['ca'] for y in left[pos]]) / max(1, len(kept) + len(left[pos])))
            rb = pos_avg - R['replace_range']
            row['needs'].append({'kind': 'replace', 'for': x['name'], 'min_ca': rb, 'position_avg': pos_avg, 'candidates': replacements(rows_now, slot, x['ca'], pos_avg),
                                 **({'if_sold': x['name']} if x['name'] in selling else {})})
        if len(starters) < n or any(not x['natural'] for x in starters):
            row['needs'].append({'kind': 'starter', 'min_ca': weakest, 'candidates': candidates(rows_now, slot, weakest)})
        for _ in range(missing):   # summer, and January too: a missing backup is a hole (user, 2033-09-01)
            cheap = candidates(rows_now, slot, bar, R['backup_aim_fee'], max_wage=R['backup_max_wage'], best=True)
            row['needs'].append({'kind': 'backup', 'min_ca': bar, 'candidates': cheap or candidates(rows_now, slot, bar, R['backup_max_fee'], max_wage=R['backup_max_wage'], best=True),
                                 'within_aim': bool(cheap)})
        # Upgrades: an option; a buy only when young, at value and within the wage ceiling (the season's
        # net spend staying positive is checked by the caller). User, 2033-09-01.
        up = candidates(rows_now, slot, weakest + R['upgrade_by'], max_wage=wage_cap, n=8)   # more than the cheapest 3: Boem (CA 184) was cut at £91.6M
        if up:
            for c in up:
                c['buy'] = c['age'] <= R['upgrade_max_age'] and window != 'january'
            row['upgrade_option'] = {'min_ca': weakest + R['upgrade_by'], 'candidates': up}
        out.append(row)
    # The season must stay net positive: needs (replace/starter/backup) are paid first from the surplus,
    # then upgrades greedily by CA gained per £ while the surplus lasts (user, 2033-09-01).
    left_money = season_surplus - sum((n['candidates'][0]['value'] if n['candidates'] else 0) for r in out for n in r['needs'] if not n.get('if_sold'))
    ups = sorted(((r, c) for r in out for c in (r.get('upgrade_option') or {}).get('candidates', []) if c['buy']),
                 key=lambda rc: -(rc[1]['ca'] - rc[0]['weakest']) / max(rc[1]['value'], 1))
    taken = set()
    for r, c in ups:
        c['buy'] = r['position'] not in taken and c['value'] <= left_money
        if c['buy']:
            left_money -= c['value']; taken.add(r['position'])
    # Funded upgrades (user, 2026-10-18): profit is per season, and an upgrade comes with a sale at its
    # position. Summer only; the best CA gain per £ that one sale there (plus what's left) pays for.
    value_of = {p['name']: float(p['value'] or 0) for p in rows if p['contract_club'] == m.CLUB}
    for r in out:
        opt = r.get('upgrade_option')
        if window != 'summer' or not opt or r['position'] in taken:
            continue
        fundable = []
        for c in opt['candidates']:
            by = [x for x in r['_sellers'] if c['age'] <= R['upgrade_max_age'] and max(left_money, 0) + value_of.get(x, 0) >= c['value']]
            if by:
                fundable.append((c, by))
        if fundable:
            c, by = max(fundable, key=lambda cb: (cb[0]['ca'] - r['weakest']) / max(cb[0]['value'], 1))
            c['buy_if_sold'] = by[:3]
    for r in out:
        r.pop('weakest', None); r.pop('_sellers', None)
    # The portfolio (user, 2034-09; 2026-10-18: "if we accumulate six new wonderkids every season and only
    # sell one, that sucks"): at most portfolio_max prospects (<= 23, PA >= portfolio_min_pa, outside the
    # depth chart, on loan or not) at once; buys only fill the room promotions and sales leave.
    W = m.POLICY.get('wonderkids', {})
    held_list = sorted((p for p in rows_now if p['contract_club'] == m.CLUB and m.intval(p, 'age') <= 23 and m.intval(p, 'pa') >= W.get('portfolio_min_pa', R['wonderkid_min_pa'])
                        and assigned.get(p['name'], (None, 'surplus'))[1] == 'surplus'), key=lambda p: (m.intval(p, 'pa'), m.intval(p, 'ca'), -m.intval(p, 'age')))
    held = len(held_list)
    room = max(0, W.get('portfolio_max', 6) - held)
    # A full portfolio still takes a clearly better prospect (user, 2026-10-19: Pepper, PA 186, with Collins,
    # 22, CA 119/PA 172, holding a place): he replaces the weakest, whom the sell table then sells (over the limit).
    # On arrival (user, 2034-09): one at our backup level joins the squad; the rest go on the loan list
    # (fm approve buy … --note "wonderkid": the autopilot loan-lists him when he signs).
    kids, weakest = [], iter(held_list)
    for c in wonderkids(rows_now):
        # A developing prospect plays on loan unless he'd start (user, 2026-10-19): Pepper, CA 118/PA 186, is loaned.
        c = {**c, 'on_arrival': 'loan' if m.developing(c['age'], c['ca'], c['pa']) or c['ca'] < backup_level else 'squad'}
        if len(kids) < room:
            kids.append(c)
        elif (w := next(weakest, None)) and c['pa'] >= m.intval(w, 'pa') + W.get('swap_min_pa_gain', 5):
            kids.append({**c, 'replaces': w['name']})
    return {'wonderkids': kids if window == 'summer' else [], 'portfolio': {'held': held, 'room': room, 'weakest': [p['name'] for p in held_list[:2]]}, 'window': window, 'squad_avg': squad_avg, 'season_surplus': season_surplus, 'after_buys': left_money, 'positions': out}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--csv')
    ap.add_argument('--leaving', default='')
    ap.add_argument('--selling', default='', help='planned sales ("Name,Name"): needs without them; a starter\'s replacement only once he is sold')
    ap.add_argument('--window', choices=['summer', 'january'], default='summer', help='january: replacements and missing backups, no upgrades (user, 2033-09-01)')
    ap.add_argument('--record', action='store_true', help='replace starters who left since the last record (local/runs/starters.json), then record today\'s')
    ap.add_argument('--surplus', type=float, help="this season's net transfer surplus (fees out - in); default: from the ledger")
    a = ap.parse_args()
    rows, tactic = m.load(a.csv)
    if a.surplus is None:
        try:
            led = json.load(open(m.ROOT / 'local' / 'runs' / 'ledger.json'))
            season = max(led.get('seasons', {}))
            a.surplus = led['seasons'][season]['out'] - led['seasons'][season]['in']
        except Exception:
            a.surplus = 0
    rec = m.ROOT / 'local' / 'runs' / 'starters.json'
    departed = []
    if a.record:
        try:
            departed = json.load(open(rec))['starters']
        except Exception:
            pass
    out = table(rows, tactic, [x.strip() for x in a.leaving.split(',') if x.strip()], a.surplus, a.window, departed,
                [x.strip() for x in a.selling.split(',') if x.strip()])
    if a.record:
        chart = depth.chart(rows, tactic)
        rec.write_text(json.dumps({'date': os.environ.get('FM_GAME_DATE'), 'starters': [
            {'name': x['name'], 'position': pos, 'ca': x['ca']} for pos, v in chart.items() for x in v['players'][:v['slots']]]}, indent=1))
    print(json.dumps(out, default=str))
