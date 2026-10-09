#!/usr/bin/env python3
"""Evidence and pricing for an incoming transfer offer for one of our players.

Reads an offer as JSON (file or stdin), scores the player with the squad report's
method (docs/analysis/README.md), and prints JSON: his importance, depth after a
sale, the cheapest market replacement, a floor and target price, the offer's
real value, and a suggested decision. The fm-moneyball skill turns this into
the recommendation.

Usage:
    python3 analysis/evaluate_offer.py offer.json                # newest save (config/club.json)
    python3 analysis/evaluate_offer.py offer.json --save "path/to/save.fm"
    python3 analysis/evaluate_offer.py offer.json --csv local/exports/<save>.csv

Offer JSON (amounts in £; only player, date and one fee field are required):
    {"player": "Jason Steele", "buying_club": "Strasbourg", "date": "2026-06-22",
     "upfront": 1100000, "instalments": [{"amount": 300000, "months": 12}],
     "add_ons": [{"type": "appearances", "amount": 300000, "likelihood": 0.5}],
     "sell_on_pct": 0, "selling_costs": 235000, "negotiable": false,
     "deadline": "2026-06-25", "wage_room_pw": 40500, "transfer_budget": 41570000,
     "notes": "player not interested in the move but will discuss terms"}
"""
import argparse
import datetime as dt
import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import squad_report as sr  # noqa: E402

CLUB = sr.CLUB_CONFIG['club']
POLICY = json.loads((sr.ROOT / 'playbook' / 'policy.json').read_text())
# Default probability that an add-on is paid, by type.
ADD_ON_LIKELIHOOD = {'appearances': 0.5, 'goals': 0.4, 'clean_sheets': 0.4, 'promotion': 0.2,
                     'trophy': 0.1, 'international': 0.2, 'qualification': 0.3}
INSTALMENT_DISCOUNT = 0.05   # per year: money later is worth less (and can fall through)
# Price multiplier by importance: in our XI or not, and output percentile in the role.
IMPORTANCE = {'key starter': 1.3, 'starter': 1.15, 'weak starter': 1.0, 'strong rotation': 1.15,
              'rotation': 1.0, 'fringe': 0.85}
# English windows (approx.): summer closes 1 Sep, winter 2 Feb.
WINDOW_CLOSES = [(9, 1), (2, 2)]


def plain(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c)).lower()


def find_player(rows, name, club):
    want = plain(name)
    ours = [p for p in rows if p['contract_club'] == club]
    hits = [p for p in ours if want in (plain(p['name']), plain(p['full_name']))]
    hits = hits or [p for p in ours if want in plain(p['full_name'])]
    if len(hits) != 1:
        sys.exit(f'{len(hits)} players at {club} match "{name}": ' + ', '.join(p['name'] for p in hits))
    return hits[0]


def role_standing(rows, p, role, cache):
    """Output, percentile within the role pool (0-100), rank text and league for p in role."""
    key = (role, p['competition'])
    if key not in cache:
        cache[key] = sr.ranked(rows, role, p['competition'])
    pool, res = cache[key]
    if len(pool) < 8 or not p['mins']:
        return None
    if p['key'] in res:
        o, attr, _, _, orank, _ = res[p['key']]
        pct = 100 * (1 - (orank - 1) / len(pool))
        return dict(output=round(o, 3), pct=round(pct), rank=f'{orank}/{len(pool)}', league=p['competition'],
                    attr_pct=round(attr), ranked=True)
    o, attr, _, _ = sr.scores(p, role, pool)
    pct = sr.pctile(o, [v[0] for v in res.values()]) if res else 50
    return dict(output=round(o, 3), pct=round(pct), rank=f'unranked ({p["mins"]} min)', league=p['competition'],
                attr_pct=round(attr), ranked=False)


def years_left(p, today):
    if not p['contract_expires']:
        return None
    return (dt.date.fromisoformat(p['contract_expires']) - today).days / 365.25


def contract_factor(y):
    if y is None:
        return 1.0
    return 0.5 if y < 1 else 0.75 if y < 2 else 0.95 if y < 3 else 1.1


def age_factor(age):
    return 1.25 if age <= 21 else 1.15 if age <= 24 else 1.0 if age <= 28 else 0.9 if age <= 30 else 0.8 if age <= 32 else 0.65


def days_to_window_close(today):
    closes = []
    for year in (today.year, today.year + 1):
        for m, d in WINDOW_CLOSES:
            c = dt.date(year, m, d)
            if c >= today:
                closes.append((c - today).days)
    return min(closes)


def offer_value(offer):
    upfront = offer.get('upfront', 0)
    instalments = sum(i['amount'] * (1 - INSTALMENT_DISCOUNT) ** (i.get('months', 12) / 12)
                      for i in offer.get('instalments', []))
    guaranteed_face = upfront + sum(i['amount'] for i in offer.get('instalments', []))
    add_ons = sum(a['amount'] * a.get('likelihood', ADD_ON_LIKELIHOOD.get(a.get('type'), 0.3))
                  for a in offer.get('add_ons', []))
    costs = offer.get('selling_costs', 0)
    return dict(guaranteed_face=guaranteed_face, guaranteed_value=round(upfront + instalments),
                expected_add_ons=round(add_ons), add_ons_max=sum(a['amount'] for a in offer.get('add_ons', [])),
                selling_costs=costs, net_guaranteed=round(upfront + instalments - costs),
                net_expected=round(upfront + instalments + add_ons - costs),
                sell_on_pct=offer.get('sell_on_pct', 0))


def evaluate(rows, offer, tactic, club=CLUB):
    today = dt.date.fromisoformat(offer['date'])
    p = find_player(rows, offer['player'], club)
    cache = {}
    slot = next((s for s in (tactic or {}).get('slots', []) if plain(s['player']) == plain(p['name'])), None)
    roles = {r: role_standing(rows, p, r, cache) for r in sr.ROLES if sr.can_play(p, r)}
    roles = {r: v for r, v in roles.items() if v}
    if slot and slot['role'] in roles:
        role = slot['role']
    else:
        role = max(roles, key=lambda r: roles[r]['pct']) if roles else None
    me = roles.get(role)

    # Importance
    pct = me['pct'] if me else 0
    if slot:
        importance = 'key starter' if pct >= 67 else 'starter' if pct >= 33 else 'weak starter'
    elif p['mins'] >= sr.MIN_MINUTES:
        importance = 'strong rotation' if pct >= 67 else 'rotation'
    else:
        importance = 'fringe'
    starters = {plain(s['player']) for s in (tactic or {}).get('slots', [])}

    # Depth after a sale: squad and returning loan players who can play the role
    depth = []
    if role:
        for q in rows:
            if q['contract_club'] != club or q['key'] == p['key'] or not sr.can_play(q, role) or int(q['age'] or 0) < 18:
                continue
            st_q = role_standing(rows, q, role, cache)
            depth.append(dict(name=q['name'], age=int(q['age']), minutes=q['mins'],
                              starter_elsewhere=plain(q['name']) in starters,
                              on_loan_at=q['on_loan_at'] or None, loan_ends=q['loan_ends'] or None,
                              output=st_q['output'] if st_q else None, pct=st_q['pct'] if st_q else None,
                              rank=f"{st_q['rank']} {st_q['league']}" if st_q else 'no ranked league or minutes'))
        depth.sort(key=lambda d: (d['pct'] is None, -(d['pct'] or 0), -d['age']))
    senior = [d for d in depth if d['age'] >= 21]  # no hidden ability (CA): seniority by age
    blockers = []
    if role == 'GK' and len(senior) < 2:
        blockers.append(f'only {len(senior)} senior goalkeeper(s) would remain (minimum 2, target 3)')
    # Players already starting in another slot don't count as cover.
    best_same = next((d for d in depth if d['pct'] is not None and me and not d['starter_elsewhere']
                      and d['rank'].endswith(me['league'])), None)
    gap = (me['pct'] - best_same['pct']) if me and best_same else None
    if importance == 'key starter' and (gap is None or gap > 25):
        blockers.append('no comparable squad replacement: secure one before selling')

    # Cheapest market replacement with at least his output
    replacement = None
    if me and role and me['ranked']:
        league = sr.st.mode([q['competition'] for q in rows if q['club'] == club and q['competition']])
        cands = sr.market_candidates(rows, role, league, club, min_output=me['output'])
        if cands:
            c = min(cands, key=lambda c: int(c['p']['value']))
            replacement = dict(name=c['p']['name'], club=c['p']['club'], league=c['league'], age=int(c['p']['age']),
                               value=int(c['p']['value']), wage_pw=int(c['p']['wage'] or 0),
                               output=round(c['output'], 3), rank=f"{c['rank']}/{c['pool']}")

    # Pricing. The live in-game range (offer['value_range'], read by fm sell before listing) beats
    # the save's stored value, which can be wrong (Thiago exported as £1K while valued £63M).
    vr = offer.get('value_range')
    # Playbook §3: FM's value range is the anchor (what the market pays). Adjusted for us: our own
    # young players are worth a little more, expiring contracts less, and a starter never less than
    # the cost of replacing his output. Numbers: playbook/policy.json valuation.
    pol = POLICY['valuation']
    vlo, vhi = (vr if vr else (int(p['value']) * 0.9, int(p['value']) * 1.1))
    value = int((vlo + vhi) / 2)
    y = years_left(p, today)
    youth = pol['own_youth_premium']
    factors = dict(contract=min(1.0, contract_factor(y)),
                   youth=youth['multiple'] if int(p['age']) <= youth['age_up_to'] else 1.0)
    floor = vlo * factors['contract'] * factors['youth']
    target = vhi * factors['contract'] * factors['youth']
    if pol.get('replacement_floor') and replacement and importance in ('key starter', 'starter', 'strong rotation'):
        floor = max(floor, replacement['value'])
        target = max(target, replacement['value'] * 1.1)
    signals = []
    goals, xg = sr.num(p, 'goals'), sr.num(p, 'xg')
    if role in ('ST', 'Winger', 'AMC') and goals - xg >= 3:
        floor *= 0.9
        signals.append(f'scored {goals:.0f} from {xg:.1f} xG: overperformance rarely repeats, a sell-high signal')
    window_days = days_to_window_close(today)
    if window_days <= 14 and importance in ('key starter', 'starter'):
        floor *= 1.15
        signals.append(f'window closes in {window_days} days: little time to replace him')

    ov = offer_value(offer)
    net = ov['net_expected']
    negotiable = offer.get('negotiable', True)
    if blockers:  # can't sell without cover: only a price at or above target is worth pursuing
        decision = 'investigate' if net >= target else 'reject'
    elif net >= target:
        decision = 'accept'
    elif net >= floor:
        decision = 'counter' if negotiable else 'accept'
    else:
        decision = 'counter' if negotiable and net >= 0.6 * floor else 'reject'

    return dict(
        player=dict(name=p['name'], age=int(p['age']), positions=p['positions'],
                    club_now=p['club'], on_loan_at=p['on_loan_at'] or None, squad_status=p['squad_status'],
                    minutes=p['mins'], value=value, wage_pw=int(p['wage'] or 0), contract_expires=p['contract_expires'],
                    contract_years_left=round(y, 2) if y is not None else None,
                    goals=goals, xg=xg, assists=sr.num(p, 'assists'), xa=sr.num(p, 'xa')),
        role=role, slot=slot, roles=roles, importance=importance,
        depth_after_sale=depth[:6], senior_options_after_sale=len(senior), blockers=blockers,
        best_squad_replacement=best_same, output_gap_pct_points=gap,
        market_replacement=replacement,
        pricing=dict(target=round(target, -4), floor=round(floor, -4), factors=factors, signals=signals,
                     days_to_window_close=window_days),
        offer=ov, negotiable=negotiable,
        wage_saved_pw=int(p['wage'] or 0),
        wage_room_after_sale_pw=(offer['wage_room_pw'] + int(p['wage'] or 0)) if 'wage_room_pw' in offer else None,
        suggested_decision=decision,
        counter_at=round(target, -4) if decision == 'counter' else None,
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('offer', nargs='?', help='offer JSON file (default: stdin)')
    src = ap.add_mutually_exclusive_group()
    src.add_argument('--save', default='latest', help='default: newest save matching config/club.json')
    src.add_argument('--csv')
    ap.add_argument('--club', default=CLUB)
    ap.add_argument('--tactic', default=str(sr.ROOT / 'config' / 'tactic.json'))
    ap.add_argument('--price', action='store_true',
                    help='price only (no offer): {"player", "date", "value_range": [low, high]} → minimum and target')
    a = ap.parse_args()
    offer = json.loads(Path(a.offer).read_text() if a.offer else sys.stdin.read())
    if a.price:
        offer.setdefault('upfront', 0)
    csv_path = a.csv or sr.export_save(a.save)
    tactic = json.loads(Path(a.tactic).read_text(encoding='utf-8')) if Path(a.tactic).exists() else None
    if tactic:
        sr.apply_tactic(tactic)
    rows = sr.load(csv_path)
    if tactic:  # starters come from the live XI selection; tactic.json only supplies the shape
        import manager
        picks = {x['slot']: x['player'] for x in manager.xi(rows, tactic)['xi']}
        for slot in tactic['slots']:
            slot['player'] = picks.get(slot['slot']) or slot['player']
    r = evaluate(rows, offer, tactic, a.club)
    if a.price:
        pr = r['pricing']
        r = dict(player=r.get('player'), importance=r.get('importance'), role=r.get('role'),
                 floor=pr['floor'], target=pr['target'], factors=pr['factors'], signals=pr['signals'],
                 blockers=r.get('blockers'), market_replacement=r.get('market_replacement'))
    print(json.dumps(r, indent=2, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
