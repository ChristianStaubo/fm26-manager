"""The transfer-window report: one standard pass per window (playbook §2-5).

For every slot of our shape (config/tactic.json: 4-2-3-1 or the back five): our players, depth
(two solid per slot, one more CB than we start), and the market.
Every player gets two scores, both percentiles vs Premier League regulars at the position:
  - blended  = (role attributes + core stats) / 2; attributes alone when there's no real sample
  - moneyball = the core stats alone (the job in numbers, league-adjusted)
FM's hidden current ability (CA) is never used for ranking (user, 2026-10-10).

Per slot it shows: best (★ = Chabot profile: elite on both, full season in a strong league),
value (points gained per £10M; x mkt = price vs players of the same attributes and age),
bench (cheap: <= --bench-max) and free agents. Then the sell list.

  python3 analysis/window.py [--slots LB,RW] [--max-value N] [--max-age N] [--bench-max N] [--json]
Run it in the first days of July: save the game after ~1 July and before the first league match.
FM writes everyone's full-season totals at the rollover (1,221 PL/Bundesliga/Serie A players on
2027-07-01); once the new season's matches start the export only has the new season (25 on 07-22).
"""
import argparse, json, re, statistics as st
import manager as m, scorecard as sc

sr = m.sr
WIDE = {'AML', 'AMR', 'ML', 'MR'}
FULLBACK = {'DL', 'DR', 'WBL', 'WBR'}
# slot: (natural positions, target pool, role attributes, core stats, players needed)
SLOTS = {
    'GK': ({'GK'}, {'GK'}, 'GK', sc.CORE['GK'], 2),
    'LB': ({'DL', 'WBL'}, {'DL', 'WBL'}, 'WB (attacking)', sc.CORE['FB'], 2),
    'CB': ({'DC'}, {'DC'}, 'CB', sc.CORE['CB'], 3),
    'RB': ({'DR', 'WBR'}, {'DR', 'WBR'}, 'WB (attacking)', sc.CORE['FB'], 2),
    # The 4-2-3-1's central pair: DMs and CMs judged together on the Rodri profile (progressive
    # passes + possession won). There is no CM slot in this shape (Yarmoliuk, MC: elite there).
    'DM': ({'DM', 'MC'}, {'DM', 'MC'}, 'DM', sc.CORE['DM'], 3),
    'AM': ({'AMC'}, {'AMC'}, 'AMC', sc.CORE['AM'], 2),
    'LW': ({'AML', 'ML'}, WIDE, 'Winger', sc.CORE['W'], 2),        # wide forwards play either flank
    'RW': ({'AMR', 'MR'}, WIDE, 'Winger', sc.CORE['W'], 2),
    'ST': ({'ST'}, {'ST'}, 'ST', sc.CORE['ST'], 2),
}


def shape(tactic):
    """SLOTS for the tactic in config/tactic.json: drop slots it doesn't use (no AM in a back five),
    one more CB than it starts (3 → 4), and wing-backs judged as attacking WBs (user, 2026-10-14: 5-2-3)."""
    used = {s['slot'] for s in tactic['slots']}
    cbs = sum(1 for x in used if m.GROUP.get(x) == 'CB')
    out = {}
    for slot, spec in SLOTS.items():
        if slot == 'CB' and cbs: out[slot] = spec[:4] + (cbs + 1,)
        elif slot == 'DM' and {'LDM', 'RDM'} & used: out[slot] = spec
        elif slot in used: out[slot] = spec
    return out


CUP = re.compile(r'UEFA|Cup|Copa|Coupe|Pokal|Coppa|Taça|Trophy|Shield|Libertadores|Sudamericana|Champions|Conference|Europa', re.I)
MIN_SAMPLE = 1200          # league minutes for a stats score
STRONG = 0.85              # league strength (vs ours) for a stats score
SOLID = 50                 # blended score that counts as a solid player


def report(rows, slots=None, max_value=60e6, max_age=29, bench_max=8e6, tactic=None):
    shaped = shape(tactic) if tactic else SLOTS
    strength = m.league_strength(rows)
    buy = m.POLICY['buying']
    today = m.today_of(rows).isoformat()
    # Free agents and contracts ending by the coming 30 June (free in the summer window).
    t = m.today_of(rows)
    free_by = f"{t.year + (1 if t.month >= 7 else 0)}-06-30"
    adj = lambda p, k: sr.num(p, k) if k in sc.RATE else sr.num(p, k) * strength.get(p['competition'], 0)
    real = lambda p: p['mins'] >= MIN_SAMPLE and strength.get(p['competition'], 0) >= STRONG and not CUP.search(p['competition'] or 'x')
    by_wage = sorted((p for p in rows if p['contract_club'] == m.CLUB and not p['on_loan_at']), key=lambda p: -sr.num(p, 'wage'))
    loaned_in = [p for p in rows if p['club'] == m.CLUB and p['contract_club'] not in ('', m.CLUB)]
    squad = [p for p in by_wage[:28] if not (int(p['age'] or 0) <= 21 and sr.num(p, 'wage') < 15000)] + loaned_in
    best_slot = {}   # each of our players is judged once, at his best slot (Schlager: DM, not CM)
    pl = [p for p in rows if p['competition'] == m.LEAGUE]
    history = sum(p.get('stats_source') == 'history' for p in pl)
    out = {'date': today, 'data': {'pl_players': len(pl), 'full_season': history,
           'warning': None if history >= len(pl) / 2 else 'Few players have full-season stats: run this in the first days of July (save after the rollover, before the first league match), else most stats are partial and scores lean on attributes.'},
           'alerts': m.alerts(rows), 'slots': [], 'sell': []}

    for slot, (natural, pool, role, core, need) in shaped.items():
        if slots and slot not in slots:
            continue
        peers = [p for p in pl if p['pos'] & natural and p['mins'] >= MIN_SAMPLE]
        adist = sorted(sc.attr_fit(p, role) for p in peers)
        sdist = {k: sorted(adj(p, k) for p in peers) for k in core}
        pct = lambda d, v: round(100 * sum(x <= v for x in d) / len(d)) if d else 50

        def card(p):
            a = pct(adist, sc.attr_fit(p, role))
            s = round(st.mean(pct(sdist[k], adj(p, k)) for k in core)) if real(p) else None
            return {'name': p['name'], 'age': int(p['age'] or 0), 'club': p['contract_club'] or p['club'],
                    'league': p['competition'] or '-', 'positions': p['positions'],
                    'blended': round((a + s) / 2) if s is not None else a, 'attributes': a, 'moneyball': s,
                    'chabot': s is not None and a >= 75 and s >= 70 and p.get('stats_source') == 'history' and strength.get(p['competition'], 0) >= 0.9,
                    'rating': p['avg_rating'] or None, 'minutes': int(p['mins']), 'value': int(p['value'] or 0),
                    'wage': int(p['wage'] or 0), 'contract_until': (p['contract_expires'] or '')[:10] or None,
                    'loan': p['contract_club'] not in ('', m.CLUB) and p['club'] == m.CLUB}

        ours = sorted((card(p) for p in squad if p['pos'] & natural), key=lambda c: -c['blended'])
        solid = [c for c in ours if c['blended'] >= SOLID]
        starter = ours[0]['blended'] if ours else 0
        # Market: price vs players of the same attributes and age.
        market = [p for p in rows if p['pos'] & pool and 0 < int(p['value'] or 0) < sr.NOT_FOR_SALE]
        fits = {p['name']: sc.attr_fit(p, role) for p in market}
        def x_market(p):
            f, a = fits[p['name']], int(p['age'] or 0)
            sim = [int(q['value']) for q in market if abs(fits[q['name']] - f) <= 0.4 and abs(int(q['age'] or 0) - a) <= 2]
            return round(int(p['value']) / st.median(sim), 2) if len(sim) >= 6 else None
        targets, bench, free = [], [], []
        for p in market:
            if p['contract_club'] == m.CLUB or p['club'] == m.CLUB or p['on_loan_at'] or p['club'].startswith('club#'):
                continue
            if slot == 'DM' and p['pos'] & (FULLBACK | WIDE):
                continue
            if sr.num(p, 'Injury Proneness') > 13 or sr.num(p, 'Consistency') < buy['min_consistency'] \
                    or sr.num(p, 'Important Matches') < buy['min_important_matches'] - 1:
                continue
            age, value = int(p['age'] or 99), int(p['value'])
            is_free = not p['club'] or (p['contract_expires'] or '9999')[:10] <= free_by
            if is_free and age <= 31:
                free.append({**card(p), 'free_from': (p['contract_expires'] or '')[:10] or 'now'})
            if value <= bench_max and age <= 31 and p['mins'] >= 900:
                bench.append(card(p))
            if age <= max_age and value <= max_value:
                c = card(p)
                if c['attributes'] >= 55 and c['blended'] > starter:
                    c['gain'] = c['blended'] - starter
                    c['per10m'] = round(c['gain'] / (max(value, 5e5) / 1e7), 1)
                    c['x_market'] = x_market(p)
                    targets.append(c)
        out['slots'].append({
            'slot': slot, 'need': need, 'solid': len(solid), 'status': 'OK' if len(solid) >= need else f'NEED {need - len(solid)}',
            'role': role, 'core': core, 'peers': len(peers), 'ours': ours,
            'best': sorted(targets, key=lambda c: -c['blended'])[:3],
            'value': sorted(targets, key=lambda c: -c['per10m'])[:3],
            'bench': sorted((c for c in bench if c['blended'] >= 35), key=lambda c: (-c['blended'], c['value']))[:3],
            'free': sorted((c for c in free if c['blended'] >= 40), key=lambda c: -c['blended'])[:4],
        })
        for c in ours:
            if c['name'] not in best_slot or c['blended'] > best_slot[c['name']][1]['blended']:
                best_slot[c['name']] = (slot, c)
    # Sell: weak for the money, or stats the attributes don't back on a small sample (each player
    # at his best slot; a big sample is evidence, Schade 2027: 2,552 min of real output).
    cap = 1.3 * st.median(sr.num(p, 'wage') for p in by_wage[:25])
    for slot, c in best_slot.values():
        why = []
        if c['moneyball'] is not None and c['attributes'] < 35 and c['moneyball'] >= 60 and c['minutes'] < 2000:
            why.append('stats not backed by attributes on a small sample: regression risk')
        if c['blended'] < 40 and not c['loan']:
            why.append(f"weak ({c['blended']})")
        if c['value'] >= 30e6 and c['value'] / max(c['blended'], 1) >= 1e6 and not c['loan']:
            why.append(f"the market pays £{c['value'] / max(c['blended'], 1) / 1e6:.1f}M per score point")
        if c['age'] >= 30 and c['wage'] >= cap:
            why.append(f"30+ on £{c['wage'] // 1000}K/wk")
        if why:
            out['sell'].append({**c, 'slot': slot, 'why': why})
    return out


def show(r):
    money = lambda v: f"£{v / 1e6:.1f}M"
    score = lambda c: f"{c['blended']:>3} (attr {c['attributes']}% / {'mb ' + str(c['moneyball']) + '%' if c['moneyball'] is not None else 'attrs only'})"
    line = lambda c: (f"{c['name'][:22]:23}{c['age']:>3} {c['club'][:18]:19}{c['league'][:12]:13}{'★' if c['chabot'] else ' '} {score(c):30}"
                      f" rat {c['rating'] or '-':>5} {c['minutes']:>5}m  {money(c['value']):>7} £{c['wage'] // 1000}K")
    d = r['data']
    print(f"Window report {r['date']} | full-season data for {d['full_season']}/{d['pl_players']} PL players")
    if d['warning']:
        print('!! ' + d['warning'])
    print("score = blended (attr = role attributes, mb = moneyball/core stats), percentiles vs PL regulars; ★ = Chabot profile\n")
    for s in r['slots']:
        print(f"== {s['slot']}  {s['status']} ({s['solid']}/{s['need']} solid)   core: {', '.join(k.replace('_p90', '') for k in s['core'])}")
        for c in s['ours']:
            print(f"   us    {line(c)}{'  (loan)' if c['loan'] else ''}")
        for tag in ('best', 'value', 'bench', 'free'):
            seen = set()
            for c in s[tag]:
                extra = f"  +{c['gain']} | {c['per10m']}/£10M | x mkt {c['x_market']}" if 'gain' in c else ''
                print(f"   {tag:5} {line(c)}{extra}")
        print()
    print("SELL")
    for c in sorted(r['sell'], key=lambda c: -c['value']):
        print(f"   {c['slot']:3} {c['name'][:22]:23}{c['age']:>3} score {score(c):30} {money(c['value']):>7}  -> {'; '.join(c['why'])}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--slots'); ap.add_argument('--max-value', type=float, default=60e6); ap.add_argument('--max-age', type=int, default=29)
    ap.add_argument('--bench-max', type=float, default=8e6); ap.add_argument('--csv'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    rows, tactic = m.load(a.csv)
    res = report(rows, a.slots.split(',') if a.slots else None, a.max_value, a.max_age, a.bench_max, tactic)
    print(json.dumps(res, default=str)) if a.json else show(res)
