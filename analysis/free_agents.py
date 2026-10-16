"""Free agents and expiring contracts, first (user, 2031-05-28: "free agents should be our number one
thing… players worth 30M+ on free deals in 6 months is always worth it").

Who: players with no club and no contract, or whose contract ends by the coming 30 June: in the
January window they can sign a pre-contract and join free on 1 July (fm precontract). Loanees count:
the contract that matters is the parent club's (Ethan Mbappé, Lille → on loan at Holstein Kiel, to
2031-06-30, joined Monaco free; every market search skipped him for being on loan).

Worth: FM's value of a player in his final months collapses (Mbappé £0.2M), so each is priced as the
median value of players at his position with the same role attributes (±0.4) and age (±2), the
resale we could get once he's on a long contract. Ranked by that worth; attributes are percentiles vs
Premier League regulars at the position (Doak 43 at RW).
"""
import argparse, json, statistics as st
import manager as m, scorecard as sc
from window import SLOTS, MIN_SAMPLE

sr = m.sr


def scan(rows, max_age=None, min_worth=None, min_attr=None):
    pol = m.POLICY['free_agents']
    global WATCH, ENGLISH_CLUBS
    WATCH = {w['name']: w['why'] for w in pol.get('watch', [])}
    ENGLISH_CLUBS = {q['contract_club'] for q in rows if q.get('contract_club') and q['club'] == q['contract_club'] and (q['competition'] or '').startswith(m.ENGLISH_COMPS)}
    max_age = max_age or pol['max_age']; min_worth = min_worth or pol['list_min_worth']; min_attr = min_attr or pol['min_attr_pct']
    t = m.today_of(rows)
    by = m.free_by(t)
    pl = [p for p in rows if p['competition'] == m.LEAGUE]
    out, seen = [], {}
    for slot, (natural, pool, role, core, need) in SLOTS.items():
        peers = sorted(sc.attr_fit(p, role) for p in pl if p['pos'] & natural and p['mins'] >= MIN_SAMPLE)
        pct = lambda v: round(100 * sum(x <= v for x in peers) / len(peers)) if peers else 50
        market = [p for p in rows if p['pos'] & pool and 0 < int(p['value'] or 0) < sr.NOT_FOR_SALE]
        fits = {p['name']: sc.attr_fit(p, role) for p in market}
        for p in rows:
            if not p['pos'] & natural or m.CLUB in (p['contract_club'], p['club']) or (p['club'] or '').startswith('club#'):
                continue
            ends = (p['contract_expires'] or '')[:10]
            if not m.available_free(p, by) or int(p['age'] or 99) > max_age:
                continue
            if sr.num(p, 'Injury Proneness') > 13:
                continue
            f, a = sc.attr_fit(p, role), int(p['age'] or 0)
            sim = [int(q['value']) for q in market if abs(fits[q['name']] - f) <= 0.4 and abs(int(q['age'] or 0) - a) <= 2]
            if len(sim) < 6:
                continue
            worth, attrs = st.median(sim), pct(f)
            watched = p['name'] in WATCH
            if (worth < min_worth or attrs < min_attr) and not watched:
                continue
            c = {'name': p['name'], 'age': a, 'slot': slot, 'positions': p['positions'], 'attributes': attrs,
                 'worth': int(worth), 'value_now': int(p['value'] or 0), 'wage': int(p['wage'] or 0),
                 'contract_club': p['contract_club'] or None, 'playing_at': p['club'] or None,
                 'on_loan': bool(p['on_loan_at']), 'contract_until': ends or None, 'free_now': m.is_free_agent(p),
                 'nation': p.get('nation'), 'league': p['competition'] or '-', 'minutes': int(p['mins']),
                 'ca': p.get('ca') or None, 'pa': p.get('pa') or None,
                 'homegrown': m.homegrown(p, t), 'watch': WATCH.get(p['name']),
                 'route': 'sign now (free agent)' if m.is_free_agent(p)
                 # English clubs: no pre-contract with another English club during the season (user,
                 # 2032-01-01: Burton/Monga "not available for approach yet"); under 24 a compensation fee.
                 else 'English club: approach when the season ends' + (' (compensation fee: under 24)' if a < 24 else '')
                 if (p['competition'] or '').startswith(m.ENGLISH_COMPS) and not p['on_loan_at'] or (p.get('contract_club') or '') in ENGLISH_CLUBS
                 else 'pre-contract (fm precontract) from January; free on 1 July'}
            # One entry per player, at the slot where he's worth most. Always-buy: worth and age.
            c['always_buy'] = worth >= pol['always_buy_worth'] and a <= pol.get('always_buy_max_age', 99)
            if c['name'] not in seen or c['worth'] > seen[c['name']]['worth']:
                seen[c['name']] = c
    out = sorted(seen.values(), key=lambda c: (not c['watch'], -c['worth']))
    return {'date': t.isoformat(), 'free_by': by, 'count': len(out), 'players': out}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--max-age', type=int); ap.add_argument('--min-worth', type=float)
    ap.add_argument('--min-attr', type=int); ap.add_argument('--top', type=int, default=40); ap.add_argument('--csv')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    r = scan(rows, a.max_age, a.min_worth, a.min_attr)
    r['players'] = r['players'][:a.top]
    print(json.dumps(r, default=str))
