"""Free agents and expiring contracts, first (user, 2031-05-28: "free agents should be our number one
thing… players worth 30M+ on free deals in 6 months is always worth it").

Who: players with no club and no contract, or whose contract ends by the coming 30 June: in the
January window they can sign a pre-contract and join free on 1 July (fm precontract). Loanees count:
the contract that matters is the parent club's (Ethan Mbappé, Lille → on loan at Holstein Kiel, to
2031-06-30, joined Monaco free; every market search skipped him for being on loan).

Judged by CA and PA (PLAYBOOK §1a, user 2026-10-18; it was role attributes vs Premier League regulars,
which cut Holmbjerg, PA 178, and Rusnák, CA 147, and on 2036-05-01 listed nobody). Two ways in:
  free wonderkid  PA >= buying.table.wonderkid_min_pa, age <= free_agents.wonderkid_max_age: always a buy
  quality         CA >= our backup level (squad average CA - buying.table.backup_within), fits a slot of
                  our shape
Foreign under-18s are not listed: they won't join an English club (user, 2031-05-28; tested 2026-10-18).
Worth: FM's value of a player in his final months collapses (Mbappé £0.2M, Rusnák £4.3M), so each is
priced as what players of his CA (±3) and age (±1) are worth (bargains.typical_values), the resale we
could get once he's on a long contract; FM's value when too few compare.
"""
import datetime as dt
import argparse, json, statistics as st
import manager as m, scorecard as sc
import bargains
from window import SLOTS, MIN_SAMPLE
from buy_table import BRITISH_IRISH

sr = m.sr


def approach_on(ends):
    """The day after a contract ends (YYYY-MM-DD): when an English club's player can be approached."""
    try:
        return (dt.date.fromisoformat(ends[:10]) + dt.timedelta(days=1)).isoformat()
    except (ValueError, TypeError):
        return 'when his contract ends'


def scan(rows, max_age=None, min_worth=None, min_attr=None):
    """min_attr: unused since the CA/PA lens (kept for the CLI)."""
    pol, table = m.POLICY['free_agents'], m.POLICY['buying']['table']
    watch = {w['name']: w['why'] for w in pol.get('watch', [])}
    english_clubs = {q['contract_club'] for q in rows if q.get('contract_club') and q['club'] == q['contract_club'] and (q['competition'] or '').startswith(m.ENGLISH_COMPS)}
    max_age = max_age or pol['max_age']; min_worth = pol['list_min_worth'] if min_worth is None else min_worth
    t = m.today_of(rows)
    by = m.free_by(t)
    iv, typical = m.intval, bargains.typical_values(rows)
    # Our level as the buy table measures it: the mean CA of our top squad_size players, loanees out.
    ours = sorted((iv(p, 'ca') for p in rows if p['contract_club'] == m.CLUB and not p.get('on_loan_at')), reverse=True)[:table.get('squad_size', 22)]
    squad_avg = round(sum(ours) / len(ours)) if ours else 140
    backup_level = squad_avg - table.get('backup_within', 25)
    wk_pa, wk_age = table.get('wonderkid_min_pa', 175), pol.get('wonderkid_max_age', 23)
    out = []
    for p in rows:
        if m.CLUB in (p['contract_club'], p['club']) or (p['club'] or '').startswith('club#'):
            continue
        ends, a, ca, pa = (p['contract_expires'] or '')[:10], iv(p, 'age'), iv(p, 'ca'), iv(p, 'pa')
        if not m.available_free(p, by) or not a or a > max_age:
            continue
        if a < 18 and p.get('nation') not in BRITISH_IRISH:
            continue
        if sr.num(p, 'Injury Proneness') > 13:
            continue
        slot = next((name for name, (natural, *_) in SLOTS.items() if p['pos'] & natural), None)
        wonderkid, quality, watched = pa >= wk_pa and a <= wk_age, ca >= backup_level and slot is not None, p['name'] in watch
        if not (wonderkid or quality or watched):
            continue
        tv = typical(p)
        worth = int(tv) if tv else int(float(p['value'] or 0))
        if worth < min_worth and not (wonderkid or watched):
            continue
        c = {'name': p['name'], 'age': a, 'slot': slot, 'positions': p['positions'], 'ca': ca, 'pa': pa,
             'why': f'free wonderkid (PA {pa}, {a})' if wonderkid else f'CA {ca} >= our backup level {backup_level}' if quality else 'on the watch list',
             'worth': worth, 'worth_basis': 'players of his CA and age' if tv else 'FM value', 'value_now': int(float(p['value'] or 0)),
             'wage': int(float(p['wage'] or 0)), 'contract_club': p['contract_club'] or None, 'playing_at': p['club'] or None,
             'on_loan': bool(p['on_loan_at']), 'contract_until': ends or None, 'free_now': m.is_free_agent(p),
             'nation': p.get('nation'), 'league': p['competition'] or '-', 'minutes': int(p['mins']),
             'homegrown': m.homegrown(p, t), 'watch': watch.get(p['name']),
             'route': 'sign now (free agent)' if m.is_free_agent(p)
             # English clubs: no pre-contract with another English club during the season (user,
             # 2032-01-01: Burton/Monga "not available for approach yet"); under 24 a compensation fee.
             # No "Approach To Sign" on the profile until the contract has run out (user,
             # 2032-05-28, Burton/Monga): approach on the day after it ends, as a free agent.
             else f"English club: approach on {approach_on(ends)} (no Approach To Sign before the contract ends)" + (' (compensation fee: under 24)' if a < 24 else '')
             if (p['competition'] or '').startswith(m.ENGLISH_COMPS) and not p['on_loan_at'] or (p.get('contract_club') or '') in english_clubs
             else 'pre-contract (fm precontract) from January; free on 1 July'}
        # Always a buy: a free wonderkid (no fee, pure resale), or one worth a lot young enough to resell.
        c['always_buy'] = wonderkid or (worth >= pol['always_buy_worth'] and a <= pol.get('always_buy_max_age', 99))
        out.append(c)
    out.sort(key=lambda c: (not c['watch'], not c['always_buy'], -c['worth']))
    return {'date': t.isoformat(), 'free_by': by, 'squad_avg': squad_avg, 'backup_level': backup_level, 'count': len(out), 'players': out}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--max-age', type=int); ap.add_argument('--min-worth', type=float)
    ap.add_argument('--min-attr', type=int); ap.add_argument('--top', type=int, default=40); ap.add_argument('--csv')
    a = ap.parse_args()
    rows, _ = m.load(a.csv)
    r = scan(rows, a.max_age, a.min_worth, a.min_attr)
    r['players'] = r['players'][:a.top]
    print(json.dumps(r, default=str))
