"""Squad review (prototype): who to sell and who to buy, on attributes and/or numbers.

Sell: our players the scorecard rates poorly for what the market pays (value per score point),
stats that attributes don't back (regression risk), lucky finishers, 30+ on big wages.
Buy, per position: the best upgrade on our starter, the best value (points gained per £10M), and
free/expiring players (contract ends within `--expiring-months`).

  python3 analysis/review.py [--date 2028-07-04, default FM_GAME_DATE] [--max-value N] [--max-age N] [--csv path]
"""
import argparse, datetime as dt, json
import manager as m, scorecard as sc, wage_bands

money = lambda v: f"£{v / 1e6:.1f}M"


def review(rows, today, max_value=None, max_age=None, expiring_months=12):
    _today = today
    m.today_of = lambda rows: _today         # one date for the whole review
    by = {r['name']: r for r in rows}
    cap = wage_bands.bands(rows, m.CLUB)['median'] * m.POLICY['contracts']['max_salary_vs_first_team_median']
    soon = (today + dt.timedelta(days=round(365 * expiring_months / 12) + 7)).isoformat()  # contracts end on 30 June
    cards = sc.scorecard(rows, None, None, 4000, None, thin_until=soon)
    sell, buy = [], []
    for g in cards:
        bar = g['bar']
        for i, c in enumerate(g['ours']):
            p = by[c['name']]
            why = []
            if c['verdict'].startswith('stats yes'):
                why.append('stats not backed by attributes: regression risk')
            if c.get('luck'):
                why.append('lucky finishing: ' + c['luck'])
            if c['score'] < 40:
                why.append(f"weak on both ({c['score']})")
            per_point = c['value'] / max(c['score'], 1)
            if c['value'] >= 30e6 and per_point >= 1e6:
                why.append(f"market pays {money(per_point)} per score point")
            if c['age'] >= 30 and c['wage'] >= cap:
                why.append(f"30+ on £{c['wage'] // 1000}K/wk")
            if why:
                sell.append({**c, 'position': g['group'], 'why': why, 'starter_rank': i + 1})
        for c in g['targets']:
            if max_age and c['age'] > max_age:
                continue
            expiring = c['free'] or (c['contract_until'] or '9999') <= soon
            if max_value and c['value'] > max_value and not expiring:
                continue
            # Swap: above the cap is fine up to the wage of one of our sell candidates there.
            outgoing = max([o['wage'] for o in sell if o['position'] == g['group']], default=0)
            c = {**c, 'position': g['group'], 'gain': c['score'] - bar, 'swap_ok': cap < c['wage'] <= outgoing,
                 'per10m': (c['score'] - bar) / (max(c['value'], 5e5) / 1e7), 'expiring': expiring,
                 'wage_ok': c['wage'] <= cap, 'backed': c['attr_pct'] >= 50}
            buy.append(c)
    return {'cap': cap, 'sell': sell, 'buy': buy, 'bars': {g['group']: g['bar'] for g in cards}}


def show(r, per=3):
    print(f"wage cap £{r['cap'] / 1000:.0f}K/wk | our bars (starter score per position): {r['bars']}\n")
    print("SELL candidates")
    for c in sorted(r['sell'], key=lambda c: -c['value']):
        print(f"  {c['position']:3} {c['name'][:22]:23}{c['age']:>3}  score {c['score']:>3} (attr {c['attr_pct']}%, stats {c['stat_pct']}%)  "
              f"{money(c['value']):>7}  £{c['wage'] // 1000}K/wk  -> {'; '.join(c['why'])}")
    print("\nBUY, per position (attributes back the stats unless marked; ! = wage over cap; (swap) = over cap but under the wage of a player we'd sell there)")
    for g in r['bars']:
        cs = [c for c in r['buy'] if c['position'] == g]
        if not cs:
            continue
        pick = lambda key, flt=lambda c: True: sorted([c for c in cs if c['backed'] and flt(c)], key=key)[:per]
        rows = [('best', pick(lambda c: -c['score'], lambda c: c['stat_pct'] is not None)),
                ('value', pick(lambda c: -c['per10m'], lambda c: c['stat_pct'] is not None)),
                ('free/expiring', pick(lambda c: -c['score'], lambda c: c['expiring']))]
        print(f"  {g} (our starter {r['bars'][g]})")
        seen = set()
        for tag, lst in rows:
            for c in lst:
                if (tag, c['name']) in seen:
                    continue
                seen.add((tag, c['name']))
                print(f"     {tag:14}{c['name'][:22]:23}{c['age']:>3} {c['club'][:20]:21}score {c['score']:>3} (+{c['gain']:>2})  "
                      f"{money(c['value']):>7}  £{c['wage'] // 1000}K{'' if c['wage_ok'] else ' (swap)' if c['swap_ok'] else '!'}  "
                      f"{'FREE' if c['free'] else 'to ' + (c['contract_until'] or '?')[:7]}  {c['verdict'].split(':')[0]}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--date'); ap.add_argument('--max-value', type=int); ap.add_argument('--max-age', type=int)
    ap.add_argument('--expiring-months', type=int, default=12); ap.add_argument('--csv'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    res = review(rows, dt.date.fromisoformat(a.date) if a.date else m.today_of(rows), a.max_value, a.max_age, a.expiring_months)
    print(json.dumps(res, default=str)) if a.json else show(res)
