"""Scorecard (prototype): attributes as the prediction, stats as the evidence, price as the filter.

Per position: attribute fit (the role's key attributes, 1-20) and a stat profile (the two or three
numbers that define the job, league-adjusted, per 90), each as a percentile among Premier League
players at that position who played enough. Targets are shown next to our current starters with a
verdict on where attributes and stats agree or disagree.

  python3 analysis/scorecard.py [--positions DM,ST] [--max-value N] [--max-age N] [--per N] [--csv path] [--json]
"""
import argparse, json, statistics as st
import manager as m

sr = m.sr
# The job in numbers (FM YouTuber's archetypes, e.g. a DM = Rodri: gets it, gives it).
CORE = {
    'GK': ['xgp_p90', 'save_pct'],
    'CB': ['poss_won_p90', 'headers_won_p90'],
    'FB': ['xa_p90', 'dribbles_p90'],
    'DM': ['progressive_passes_p90', 'poss_won_p90'],
    'CM': ['progressive_passes_p90', 'xa_p90'],
    'W': ['xg_p90', 'xa_p90', 'dribbles_p90'],
    'AM': ['xg_p90', 'xa_p90'],
    'ST': ['xg_p90', 'xa_p90'],
}
ROLE = {'GK': 'GK', 'CB': 'CB', 'FB': 'WB (attacking)', 'DM': 'DM', 'CM': 'CM', 'W': 'Winger', 'AM': 'AMC', 'ST': 'ST'}
RATE = {'save_pct', 'pass_pct', 'header_pct'}


def verdict(a, s):
    if a >= 60 and s >= 60:
        return 'both agree: strong'
    if a >= 60 and s < 40:
        return 'attributes yes, stats no: wrong role/team? possible bargain'
    if s >= 60 and a < 40:
        return 'stats yes, attributes no: regression risk'
    if a < 40 and s < 40:
        return 'both weak'
    return 'mixed'


def scorecard(rows, groups=None, max_value=None, per=6, max_age=None, thin_until=None):
    """thin_until: also score players WITHOUT a stat sample on attributes alone when their contract ends
    by this date (free/expiring: Zalazar 2028, 177 league minutes in the export)."""
    strength, floor = m.league_strength(rows), m.minutes_floor(rows)
    enough = lambda p: m.has_sample(p, floor)
    adj = lambda p, k: sr.num(p, k) if k in RATE else sr.num(p, k) * strength.get(p['competition'], 0)
    buy = m.POLICY['buying']
    today = m.today_of(rows).isoformat()
    out = []
    for g, (pos, _, _) in m.RAW.items():
        if groups and g not in groups:
            continue
        role, core = ROLE[g], CORE[g]
        attrs = sr.ROLES[role][2]
        afit = lambda p: st.mean(sr.num(p, a) for a in attrs)
        peers = [p for p in rows if p['competition'] == m.LEAGUE and p['pos'] & pos and enough(p)]
        dist = {k: sorted(adj(p, k) for p in peers) for k in core}
        adist = sorted(afit(p) for p in peers)
        pct = lambda d, v: round(100 * sum(x <= v for x in d) / len(d)) if d else 50

        def card(p):
            a = pct(adist, afit(p))
            sp = {k: pct(dist[k], adj(p, k)) for k in core}
            s = round(st.mean(sp.values()))
            c = {'name': p['name'], 'age': int(p['age'] or 0), 'club': p['contract_club'] or p['club'], 'league': p['competition'],
                 'minutes': int(p['mins']), 'attr_fit': round(afit(p), 1), 'attr_pct': a,
                 'stats': {k.replace('_p90', ''): f"{sr.num(p, k):.2f} ({sp[k]}%)" for k in core}, 'stat_pct': s,
                 'score': round((a + s) / 2), 'verdict': verdict(a, s), 'value': int(p['value']), 'wage': int(p['wage'] or 0),
                 'contract_until': (p['contract_expires'] or '')[:10] or None, 'free': not p['club'] or (p['contract_expires'] or '9999') < today}
            gx = sr.num(p, 'goals_minus_xg')
            if g in ('ST', 'W', 'AM') and gx >= 3:
                c['luck'] = f"+{gx:.1f} goals over xG"
            return c
        mine = [p for p in rows if p['contract_club'] == m.CLUB and p['pos'] & pos and not p['on_loan_at']]
        ours = sorted((card(p) for p in mine if p['competition'] == m.LEAGUE and enough(p)), key=lambda c: -c['score'])
        thin = [f"{p['name']} ({int(p['mins'])} min)" for p in mine if not (p['competition'] == m.LEAGUE and enough(p))]
        slots = 2 if g in ('CB', 'DM', 'W', 'FB') else 1
        bar = ours[min(slots, len(ours)) - 1]['score'] if ours else 0
        found = []
        for p in rows:
            no_sample = not enough(p)
            if no_sample and thin_until and (p['contract_expires'] or '9999')[:10] <= thin_until and p['contract_club'] != m.CLUB \
                    and p['pos'] & pos and not p['on_loan_at'] and int(p['value']) < sr.NOT_FOR_SALE \
                    and not (max_age and int(p['age'] or 99) > max_age):
                c = card(p)
                if c['attr_pct'] > bar:
                    found.append({**c, 'stat_pct': None, 'stats': {}, 'score': c['attr_pct'],
                                  'verdict': f"attributes only ({int(p['mins'])} league min in the data)"})
                continue
            if (p['contract_club'] == m.CLUB or not (p['pos'] & pos) or no_sample or p['on_loan_at']
                    or p['club'].startswith('club#') or int(p['value']) >= sr.NOT_FOR_SALE):
                continue
            if (max_value and int(p['value']) > max_value) or (max_age and int(p['age'] or 99) > max_age):
                continue
            if sr.num(p, 'Consistency') < buy['min_consistency'] or sr.num(p, 'Important Matches') < buy['min_important_matches']:
                continue
            c = card(p)
            if c['score'] > bar:
                found.append(c)
        found.sort(key=lambda c: (-c['score'], c['value']))
        out.append({'group': g, 'role_attributes': attrs, 'core_stats': core, 'peers': len(peers), 'bar': bar,
                    'ours': ours[:4], 'too_few_minutes': thin, 'targets': found[:per]})
    return out


def show(groups):
    money = lambda v: f"£{v / 1e6:.1f}M"
    for gr in groups:
        print(f"\n=== {gr['group']}  core: {', '.join(k.replace('_p90', '') for k in gr['core_stats'])}  "
              f"(vs {gr['peers']} PL players; bar = our starter's score {gr['bar']})")
        print(f"  {'':2}{'player':24}{'age':>4} {'club':22}{'attr':>6}{'stat':>6}{'score':>6}  {'value':>8}  verdict / stats")
        if gr['too_few_minutes']:
            print(f"  (ours, too few PL minutes to judge: {', '.join(gr['too_few_minutes'])})")
        for tag, lst in (('us', gr['ours']), ('->', gr['targets'])):
            for c in lst:
                print(f"  {tag:2}{c['name'][:23]:24}{c['age']:>4} {c['club'][:21]:22}{c['attr_pct']:>5}%{'-' if c['stat_pct'] is None else c['stat_pct']:>5}%{c['score']:>6}  {money(c['value']):>8}  "
                      f"{c['verdict']}{'; ' + c['luck'] if c.get('luck') else ''}")
                print(f"  {'':26}{'':27}attrs {c['attr_fit']}/20 | " + ' | '.join(f"{k} {v}" for k, v in c['stats'].items()))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--positions'); ap.add_argument('--max-value', type=int); ap.add_argument('--max-age', type=int); ap.add_argument('--per', type=int, default=6)
    ap.add_argument('--csv'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    res = scorecard(rows, a.positions.split(',') if a.positions else None, a.max_value, a.per, a.max_age)
    print(json.dumps(res)) if a.json else show(res)
