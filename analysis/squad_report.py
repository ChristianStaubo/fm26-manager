#!/usr/bin/env python3
"""Moneyball squad report from an FM26 Scout export.

Ranks our players against the same role in their league on output (stats
only, shrunk for minutes), adds a supplementary blended rank (75% output, 25%
attributes), lists the club's finances, and finds market players with strong
output per pound. Method: docs/analysis/*.md.

Usage:
    python3 analysis/squad_report.py                     # newest save (config/club.json), exported via FM26 Scout
    python3 analysis/squad_report.py --save "path/to/save.fm"
    python3 analysis/squad_report.py --csv exports/<save>_<date>.csv
Options: --club, --tactic (default config/tactic.json), --max-value (£M), --max-wage (£/week),
--max-age, --out.
FM26 Scout is found via FM26_SCOUT_PATH (else ../fm26-scout); saves via FM26_SAVE_DIR (else the default FM26
games folder).
"""
import argparse
import csv
import datetime as dt
import json
import os
import statistics as st
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCOUT = Path(os.environ.get('FM26_SCOUT_PATH', ROOT.parent / 'fm26-scout'))

STAT_K = 1500     # minutes at which outfield output counts half (see DEFENDERS.md)
GK_K = 1300       # same for goals prevented (see GOALKEEPERS.md)
MIN_MINUTES = 900
OUTPUT_WEIGHT = 0.75
NOT_FOR_SALE = 300_000_000  # transfer value placeholder for untouchable players

FB = {'DL', 'DR', 'WBL', 'WBR'}
ROLES = {  # role: (natural positions, stats, attributes)
    'GK': ({'GK'}, ['goals_prevented_p90'],
           ['Reflexes', 'Agility', 'Positioning', 'One On Ones', 'Handling', 'Aerial Reach', 'Bravery']),
    'CB': ({'DC'}, ['headers_won_p90', 'interceptions_p90', 'header_pct', 'avg_rating'],
           ['Jumping Reach', 'Heading', 'Strength', 'Positioning', 'Marking', 'Tackling', 'Anticipation', 'Concentration']),
    'FB (defensive)': (FB, ['pressures_cmp_p90', 'interceptions_p90', 'poss_won_p90', 'tackles_won_p90', 'headers_won_p90', 'avg_rating'],
                       ['Acceleration', 'Pace', 'Stamina', 'Work Rate', 'Anticipation', 'Composure', 'Tackling', 'Marking']),
    'WB (attacking)': (FB, ['dribbles_p90', 'progressive_passes_p90', 'crosses_cmp_p90', 'xa_p90', 'pass_pct', 'header_pct', 'avg_rating'],
                       ['Crossing', 'Passing', 'Vision', 'Technique', 'First Touch', 'Dribbling', 'Acceleration', 'Pace', 'Stamina', 'Work Rate']),
    'DM': ({'DM'}, ['poss_won_p90', 'interceptions_p90', 'tackles_won_p90', 'pressures_cmp_p90', 'passes_cmp_p90', 'pass_pct', 'avg_rating'],
           ['Tackling', 'Positioning', 'Anticipation', 'Marking', 'Concentration', 'Work Rate', 'Teamwork', 'Decisions', 'Passing', 'Composure']),
    'CM': ({'MC'}, ['progressive_passes_p90', 'xa_p90', 'passes_cmp_p90', 'pass_pct', 'poss_won_p90', 'shots_p90', 'avg_rating'],
           ['Passing', 'Vision', 'Technique', 'First Touch', 'Decisions', 'Composure', 'Anticipation', 'Work Rate', 'Stamina', 'Off The Ball']),
    'Winger': ({'AML', 'AMR', 'ML', 'MR'}, ['xg_p90', 'xa_p90', 'dribbles_p90', 'progressive_passes_p90', 'shots_p90', 'avg_rating'],
               ['Dribbling', 'Acceleration', 'Pace', 'Agility', 'Technique', 'Crossing', 'First Touch', 'Off The Ball', 'Finishing', 'Decisions']),
    'AMC': ({'AMC'}, ['xa_p90', 'xg_p90', 'progressive_passes_p90', 'dribbles_p90', 'pass_pct', 'avg_rating'],
            ['Vision', 'Passing', 'Technique', 'First Touch', 'Decisions', 'Off The Ball', 'Composure', 'Dribbling', 'Anticipation', 'Finishing']),
    'ST': ({'ST'}, ['xg_p90', 'shots_p90', 'xa_p90', 'header_pct', 'avg_rating'],
           ['Finishing', 'Off The Ball', 'Anticipation', 'Composure', 'Heading', 'Jumping Reach', 'Strength', 'Acceleration', 'Pace', 'First Touch']),
}


def num(p, k):
    v = p.get(k)
    return float(v) if v not in (None, '') else 0.0


def load(path):
    rows = list(csv.DictReader(open(path, encoding='utf-8')))
    for p in rows:
        p['pos'] = set(p['positions'].split('/')) if p['positions'] else set()
        p['mins'] = int(p['minutes'] or 0)
        n90 = p['mins'] / 90
        if n90 and p.get('pressures_att'):
            p['pressures_cmp_p90'] = num(p, 'pressures_att') * num(p, 'pressure_pct') / 100 / n90
    add_goals_prevented(rows)
    return rows


def add_goals_prevented(rows):
    """Goals prevented per 90 from shots on target (league-average conversion), corrected within each
    league for shots-on-target volume. See GOALKEEPERS.md."""
    keepers = [p for p in rows if p.get('sot_faced') and 'GK' in p['pos']]
    by_league = {}
    for p in keepers:
        by_league.setdefault(p['competition'], []).append(p)
    for league, ks in by_league.items():
        sot = sum(num(p, 'sot_faced') for p in ks)
        if not sot:
            continue
        rate = sum(num(p, 'conceded') for p in ks) / sot
        for p in ks:
            p['gp90_raw'] = (num(p, 'sot_faced') * rate - num(p, 'conceded')) / p['mins'] * 90 if p['mins'] else 0
            p['sot_p90'] = num(p, 'sot_faced') / p['mins'] * 90 if p['mins'] else 0
        fit = [p for p in ks if p['mins'] >= MIN_MINUTES]
        b, mx, my = 0.0, 0.0, 0.0
        if len(fit) >= 5:
            x, y = [p['sot_p90'] for p in fit], [p['gp90_raw'] for p in fit]
            mx, my = st.mean(x), st.mean(y)
            den = sum((a - mx) ** 2 for a in x)
            b = sum((a - mx) * (c - my) for a, c in zip(x, y)) / den if den else 0.0
        for p in ks:
            adj = p['gp90_raw'] - (my + b * (p['sot_p90'] - mx))
            p['goals_prevented_p90'] = adj * p['mins'] / (p['mins'] + GK_K)


def pctile(v, pool):
    return 100 * (sum(x < v for x in pool) + 0.5 * sum(x == v for x in pool)) / len(pool)


def role_pool(rows, role, league):
    pos, _, _ = ROLES[role]
    gk = role == 'GK'
    return [p for p in rows if p['competition'] == league and p['mins'] >= MIN_MINUTES and p['pos'] & pos
            and (gk or 'GK' not in p['pos'])]


def scores(p, role, pool):
    """(output 0-100 or goals prevented/90 for keepers, attribute percentile, blended 0-100)."""
    _, stats, attrs = ROLES[role]
    attr_avg = st.mean(num(p, a) for a in attrs)
    attr = pctile(attr_avg, [st.mean(num(q, a) for a in attrs) for q in pool])
    if role == 'GK':
        out_pct = pctile(num(p, 'goals_prevented_p90'), [num(q, 'goals_prevented_p90') for q in pool])
        return num(p, 'goals_prevented_p90'), attr, OUTPUT_WEIGHT * out_pct + (1 - OUTPUT_WEIGHT) * attr, attr_avg
    raw = st.mean(pctile(num(p, s), [num(q, s) for q in pool]) for s in stats)
    out = 50 + (raw - 50) * p['mins'] / (p['mins'] + STAT_K)
    return out, attr, OUTPUT_WEIGHT * out + (1 - OUTPUT_WEIGHT) * attr, attr_avg


def ranked(rows, role, league):
    pool = role_pool(rows, role, league)
    if len(pool) < 8:
        return pool, {}
    res = {p['key']: scores(p, role, pool) for p in pool}
    out_rank = {k: n for n, k in enumerate(sorted(res, key=lambda k: -res[k][0]), 1)}
    blend_rank = {k: n for n, k in enumerate(sorted(res, key=lambda k: -res[k][2]), 1)}
    return pool, {k: (*res[k], out_rank[k], blend_rank[k]) for k in res}


def money(v):
    return f'£{v / 1e6:.1f}M' if v >= 1e6 else f'£{v / 1e3:.0f}K'


def fmt_out(role, v):
    return f'{v:+.2f}/90' if role == 'GK' else f'{v:.0f}'


def apply_tactic(tactic):
    """Add the tactic's extra stats (e.g. pressing for a Gegenpress side) to the role definitions."""
    for role, extra in tactic.get('extra_stats', {}).items():
        pos, stats, attrs = ROLES[role]
        ROLES[role] = (pos, stats + [s for s in extra if s not in stats], attrs)


def can_play(p, role):
    """The game lists a position for a player when he is rated 15+ there (20 = natural)."""
    pos = ROLES[role][0]
    if role != 'GK' and 'GK' in p['pos']:
        return False
    return bool(p['pos'] & pos) or any(num(p, f'pos_{x}') >= 15 for x in pos)


def lineup_section(rows, club, tactic):
    """Each slot's starter against the best-output squad option for the slot's role."""
    ours = [p for p in rows if p['contract_club'] == club]
    by_name = {p['name']: p for p in ours}
    starters = {s['player'] for s in tactic['slots']}
    lines = [f'Tactic: {tactic["name"]} ({tactic.get("style", "")}, {tactic.get("mentality", "")}).', '',
             '| Slot | Roles (in / out of possession) | Scored as | Starter | Starter output | Best same-league option | Lead from another league |',
             '|---|---|---|---|---|---|---|']
    cache = {}
    for s in tactic['slots']:
        role = s['role']
        options = []
        for p in ours:
            if not p['mins'] or not can_play(p, role) or (p['name'] in starters and p['name'] != s['player']):
                continue
            key = (role, p['competition'])
            if key not in cache:
                cache[key] = ranked(rows, role, p['competition'])
            pool, res = cache[key]
            if p['key'] in res:
                o, _, _, _, orank, _ = res[p['key']]
                options.append((orank / len(pool), p, f'{fmt_out(role, o)}, {orank}/{len(pool)} {p["competition"]}'))
            elif len(pool) >= 8:  # under the minutes cut, or not natural: score against the pool, unranked
                o = scores(p, role, pool)[0]
                pct = pctile(o, [v[0] for v in res.values()]) if res else 50
                note = f'only {p["mins"]} min' if p['mins'] < MIN_MINUTES else 'not natural, unranked'
                options.append((1 - pct / 100, p, f'{fmt_out(role, o)}, ~{pct:.0f}th pct {p["competition"]}, {note}'))
        options.sort(key=lambda t: t[0])
        starter = next((t for t in options if t[1]['name'] == s['player']), None)
        if starter:
            start_txt = starter[2]
        elif s['player'] in by_name:
            start_txt = f'not natural in this role ({by_name[s["player"]]["positions"]})'
        else:
            start_txt = 'not in export'
        league = starter[1]['competition'] if starter else None
        alts = [t for t in options if t[1]['name'] != s['player']]
        same = next((t for t in alts if t[1]['competition'] == league), None)
        other = next((t for t in alts if t[1]['competition'] != league and (not same or t[0] < same[0])), None)
        better = same and starter and same[0] < starter[0]
        same_txt = f'{"**" if better else ""}{same[1]["name"]}{"**" if better else ""} ({same[2]})' if same else '-'
        other_txt = f'{other[1]["name"]} ({other[2]})' if other else '-'
        lines.append(f'| {s["slot"]} | {s["in"]} / {s["out"]} | {role} | {s["player"]} | {start_txt} | {same_txt} | {other_txt} |')
    lines += ['', 'Options are squad and loaned-out players, excluding the other starters. Bold: ranks higher on output than the '
              'starter. Ranks from another league are not comparable; treat those as leads.']
    return lines


def squad_section(rows, club):
    ours = [p for p in rows if p['contract_club'] == club and p['mins'] > 0]
    cache, lines, summary = {}, [], []
    for p in sorted(ours, key=lambda p: -p['mins']):
        entries = []
        for role, (pos, _, _) in ROLES.items():
            if not p['pos'] & pos or (role != 'GK' and 'GK' in p['pos']):
                continue
            key = (role, p['competition'])
            if key not in cache:
                cache[key] = ranked(rows, role, p['competition'])
            pool, res = cache[key]
            if not res:
                continue
            if p['key'] in res:
                out, attr, blend, _, orank, brank = res[p['key']]
                entries.append((orank / len(pool), role, f'{orank}/{len(pool)}', f'{brank}/{len(pool)}', fmt_out(role, out), f'{attr:.0f}', len(pool)))
            else:  # under the minutes cut: score against the pool without ranking
                out, attr, _, _ = scores(p, role, pool)
                entries.append((2, role, f'({p["mins"]} min)', '-', fmt_out(role, out), f'{attr:.0f}', len(pool)))
        if not entries:
            continue
        entries.sort()
        best = entries[0]
        flag = ''
        if best[0] <= 1:
            out_top = best[0] <= 0.33
            attr_v = float(best[5])
            if out_top and attr_v < 40:
                flag = 'output >> attributes'
            elif best[0] >= 0.67 and attr_v > 70:
                flag = 'attributes >> output'
        loan = f' (on loan: {p["on_loan_at"]})' if p['on_loan_at'] else ''
        summary.append((list(ROLES).index(best[1]), best[0], f'| {p["name"]}{loan} | {p["age"]} | {best[1]} | {best[2]} | {best[3]} | {best[4]} | {best[5]} | '
                       f'{money(int(p["value"]))} | £{int(p["wage"] or 0) / 1e3:.0f}K | {(p["contract_expires"] or "")[:4]} | {flag} |'))
        others = ', '.join(f'{e[1]} {e[2]}' for e in entries[1:])
        if others:
            lines.append(f'- {p["name"]}: also {others}')
    head = ['| Player | Age | Best role | Output rank | Blended rank | Output | Attr pct | Value | Wage | Expires | Flag |',
            '|---|---|---|---|---|---|---|---|---|---|---|']
    return head + [line for *_, line in sorted(summary)] + ([''] + ['Other roles:'] + lines if lines else [])


def market_candidates(rows, role, league, club, max_value=float('inf'), max_wage=float('inf'), max_age=99,
                      min_output=None, min_minutes=1500):
    """Market players for a role with strong output, sorted by output per £.

    Output is ranked within each player's own league, so a player who dominates a weak league looks elite:
    candidates also need attributes at least at the bottom-quarter level of our league's players in the role.
    Returns dicts with player, league, output, rank, pool size and attribute percentile vs our league."""
    _, bench = ranked(rows, role, league)
    if not bench:
        return []
    attr_floor = st.quantiles([v[3] for v in bench.values()], n=4)[0]
    if min_output is None:
        min_output = 0.05 if role == 'GK' else 58
    cands = []
    for lg in {p['competition'] for p in rows if p['competition']}:
        pool, res = ranked(rows, role, lg)
        if len(pool) < 15:
            continue
        for p in pool:
            v, w = int(p['value']), int(p['wage'] or 0)
            if (p['contract_club'] == club or p['mins'] < min_minutes or v >= NOT_FOR_SALE or v > max_value
                    or w > max_wage or int(p['age'] or 99) > max_age):
                continue
            o, attr, _, attr_avg, orank, _ = res[p['key']]
            if o >= min_output and attr_avg >= attr_floor:
                per_pound = (o * 10 if role == 'GK' else o - 50) / (v / 1e6 + 3)
                cands.append(dict(p=p, league=lg, output=o, rank=orank, pool=len(pool), per_pound=per_pound,
                                  attr_pct=pctile(attr_avg, [b[3] for b in bench.values()])))
    return sorted(cands, key=lambda c: -c['per_pound'])


def market_section(rows, club, league, max_value, max_wage, max_age):
    out = []
    for role in ROLES:
        if not ranked(rows, role, league)[1]:
            continue
        cands = market_candidates(rows, role, league, club, max_value, max_wage, max_age)
        out.append(f'\n### {role}\n')
        if not cands:
            out.append('No candidates within the limits.')
            continue
        out.append(f'| Player | Club | League | Age | Output | League rank | Attr pct vs {league} | Value | Wage | Expires |')
        out.append('|---|---|---|---|---|---|---|---|---|---|')
        for c in cands[:6]:
            p = c['p']
            out.append(f'| {p["name"]} | {p["club"]} | {c["league"]} | {p["age"]} | {fmt_out(role, c["output"])} | '
                       f'{c["rank"]}/{c["pool"]} | {c["attr_pct"]:.0f} | {money(int(p["value"]))} | '
                       f'£{int(p["wage"] or 0) / 1e3:.0f}K | {(p["contract_expires"] or "")[:4]} |')
    return out


def finance_section(clubs_csv, club):
    if not clubs_csv or not Path(clubs_csv).exists():
        return ['No club finances (export with --clubs).']
    row = next((r for r in csv.DictReader(open(clubs_csv, encoding='utf-8')) if r['club'] == club), None)
    if not row:
        return [f'No finances found for {club}.']
    g = lambda k: int(row[k]) if row.get(k) else 0
    return [
        f'- Transfer budget remaining: **{money(g("transfer_remaining"))}** of {money(g("transfer_budget"))}',
        f'- Wage budget: £{g("wage_budget_pw") / 1e3:.0f}K/week. Player wages (loanees out excluded): '
        f'£{g("player_wages_pw") / 1e3:.0f}K/week. **Wage room is not known from the save**: the game\'s payroll '
        'includes staff and bonuses. Read "Salary available" from Club > Finances.',
        f'- Balance at end of {row["month_end"]}: {money(g("month_end_balance"))} (the live balance differs)',
        f'- Last 12 months: income {money(g("income_12m"))}, expenditure {money(g("expenditure_12m"))}; '
        f'sponsorship {money(g("sponsorship"))}',
        f'- Squad: {row["players"]} contracted players, {row["loaned_out"]} loaned out',
    ]


SAVE_DIR = Path(os.environ.get('FM26_SAVE_DIR', Path.home() / 'Library/Application Support/Sports Interactive/Football Manager 26/games'))


CLUB_CONFIG = json.loads((ROOT / 'config' / 'club.json').read_text())


def latest_save(pattern=CLUB_CONFIG.get('save_pattern', '*.fm')):
    saves = sorted(SAVE_DIR.glob(pattern), key=lambda f: f.stat().st_mtime)
    if not saves:
        sys.exit(f'No saves matching {pattern} in {SAVE_DIR}; set FM26_SAVE_DIR or pass --save')
    return saves[-1]


def export_save(save='latest'):
    """Export a save ('latest' = newest save matching config/club.json) with FM26 Scout, players + club finances, unless the
    cached export is newer. Returns the player CSV path."""
    exporter = SCOUT / 'fm26_export.py'
    if not exporter.exists():
        sys.exit(f'FM26 Scout not found at {SCOUT}; set FM26_SCOUT_PATH')
    save = latest_save() if save == 'latest' else Path(save)
    print(f'Save: {save.name}', file=sys.stderr)
    csv_path = ROOT / 'local' / 'exports' / f'{Path(save).stem}.csv'
    if not csv_path.exists() or csv_path.stat().st_mtime < Path(save).stat().st_mtime:
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([sys.executable, str(exporter), str(save), '--clubs', '-o', str(csv_path)], check=True)
    return csv_path


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    src = ap.add_mutually_exclusive_group()
    src.add_argument('--save', default='latest', help='FM26 save to export with FM26 Scout (default: newest matching config/club.json)')
    src.add_argument('--csv', help='existing FM26 Scout player export')
    ap.add_argument('--club', default=CLUB_CONFIG['club'])
    ap.add_argument('--tactic', default=str(ROOT / 'config' / 'tactic.json'), help='tactic slots and roles (JSON)')
    ap.add_argument('--max-value', type=float, default=25, help='market search: max transfer value in £M')
    ap.add_argument('--max-wage', type=int, default=60000, help='market search: max weekly wage in £')
    ap.add_argument('--max-age', type=int, default=29)
    ap.add_argument('-o', '--out', help='report path (default: local/reports/<export>.md)')
    a = ap.parse_args()

    csv_path = a.csv or export_save(a.save)
    clubs_csv = Path(csv_path).with_name(Path(csv_path).stem + '_clubs.csv')

    tactic = json.loads(Path(a.tactic).read_text(encoding='utf-8')) if Path(a.tactic).exists() else None
    if tactic:
        apply_tactic(tactic)
    rows = load(csv_path)
    ours = [p for p in rows if p['contract_club'] == a.club]
    if not ours:
        sys.exit(f'No players contracted to {a.club} in {csv_path}')
    league = st.mode([p['competition'] for p in ours if p['club'] == a.club and p['competition']])

    report = [
        f'# Squad report: {a.club}',
        '',
        f'Source: `{Path(csv_path).name}`, generated {dt.date.today()}. Comparison league: {league}.',
        '',
        '**Output rank** is the headline: stats only, shrunk for minutes, against the same role in the '
        f'player\'s league ({MIN_MINUTES}+ min). **Blended rank** is supplementary: {OUTPUT_WEIGHT:.0%} output, '
        f'{1 - OUTPUT_WEIGHT:.0%} attributes. For keepers, output is goals prevented per 90. Flags mark large gaps '
        'between output and attributes. See docs/analysis/.',
        '',
        '## Finances',
        '',
        *finance_section(clubs_csv, a.club),
        '',
        *(['## Starting XI', '', *lineup_section(rows, a.club, tactic), ''] if tactic else []),
        '## Squad (best-ranked natural role)',
        '',
        *squad_section(rows, a.club),
        '',
        f'## Market: strong output per £ (1500+ min, value ≤ £{a.max_value:.0f}M, wage ≤ £{a.max_wage / 1e3:.0f}K/week, age ≤ {a.max_age})',
        '',
        'Ranked by output per £. League rank is within the player\'s own league, so candidates must also have '
        f'attributes at least at the bottom-quarter level of {league} players in the role (attribute percentile shown).',
        *market_section(rows, a.club, league, a.max_value * 1e6, a.max_wage, a.max_age),
    ]
    out = Path(a.out) if a.out else ROOT / 'local' / 'reports' / f'{Path(csv_path).stem}.md'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(report) + '\n', encoding='utf-8')
    print(f'Wrote {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
