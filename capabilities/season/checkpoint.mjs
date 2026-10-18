// Checkpoints: the season cycle as code (user, 2031-05-28: "workflows defined at the top level… if we
// ran this loop 100 times, sometimes it wouldn't look for free agents"). playbook/cycle.json lists the
// checkpoints and their steps; runCheckpoint runs every step in order and writes ONE report
// (local/reports/checkpoints/<date>-<name>.{json,md}). The model decides from the report; it never
// chooses which steps to run. The judge (audit checkCheckpoints) checks the reports exist and that
// "always buy" free agents got an answer.
import {readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync} from 'node:fs';
import {analysis, gameDate} from '../data.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
export const REPORTS = `${ROOT}local/reports/checkpoints`;
export const loadCycle = (path = `${ROOT}playbook/cycle.json`) => JSON.parse(readFileSync(path, 'utf8'));

/** The next checkpoint on or after `date` (YYYY-MM-DD): {name, date, steps, why}. */
export function nextCheckpoint(date, cycle = loadCycle()) {
  const y = Number(date.slice(0, 4));
  const dated = cycle.checkpoints.flatMap(c => [y, y + 1].map(yy => ({...c, date: `${yy}-${c.on}`})));
  return dated.filter(c => c.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** The season a date belongs to: from 1 July. 2031-01-10 → '2030/31'. */
export const seasonOf = date => { const y = Number(date.slice(0, 4)), s = date.slice(5) >= '07-01' ? y : y - 1; return `${s}/${String(s + 1).slice(2)}`; };

const money = v => v == null ? '-' : `£${(v / 1e6).toFixed(1)}M`;
// The 30 June a contract must end by to be signed free this summer (a pre-contract from January).
const freeBy = date => `${Number(date.slice(0, 4)) + (date.slice(5) >= '07-01' ? 1 : 0)}-06-30`;

// Each step: (ctx) → {data, md: [lines]}. ctx caches the squad call (contracts and squad share it).
export const STEPS = {
  // The scoreboard from the game itself (club page tiles + standings): transfer totals, balance, position.
  async ledger(ctx) {
    const {readLedger} = await import('../ledger/ledger.mjs');
    const r = await readLedger();
    ctx.position = r.position;
    return {data: r, md: [`${r.season}: in ${money(r.in)} (${r.inPlayers}) · out ${money(r.out)} (${r.outPlayers}) · net ${money(r.out - r.in)} · balance ${money(r.balance)} · wages ${money(r.wages)}/${money(r.wageBudget)} · position ${r.position ?? '-'}`]};
  },
  // The buy decision table (analysis/buy_table.py): which positions need a signing, best-value names.
  async buys(ctx) {
    // Planned sales (the sell table's, and promise prices in the price book: Miceli at £81M) are planned
    // around: needs without them, a starter's replacement bought only once he is sold (user, 2026-10-19).
    const {load: loadBook} = await import('../value/pricebook.mjs');
    const selling = [...new Set([...(ctx.sells || []).filter(x => x.action === 'sell').map(x => x.name),
      ...Object.values(loadBook().players).filter(p => p.promise).map(p => p.name)])];
    const d = analysis('buy_table.py', ['--record', '--window', ctx.name === 'january' ? 'january' : 'summer', ...(selling.length ? ['--selling', selling.join(',')] : [])], {date: ctx.date});
    const name = c => `${c.name} (${c.age}, CA ${c.ca}, ${c.club}) ${money(c.value)}`;
    const md = [`${d.window} · squad avg CA ${d.squad_avg} · season surplus ${money(d.season_surplus)} → ${money(d.after_buys)} after these`];
    for (const r of d.positions) {
      for (const n of r.needs) md.push(`${r.position} ${n.kind}${n.for ? ' for ' + n.for : ''}${n.if_sold ? ' (only once he is sold)' : ''} (CA ≥ ${n.min_ca}): ${n.candidates.slice(0, 2).map(name).join(' · ') || 'none in range'}`);
      for (const c of (r.upgrade_option?.candidates || []).filter(c => c.buy)) md.push(`${r.position} upgrade: ${name(c)}`);
    }
    for (const c of d.wonderkids || []) md.push(`wonderkid (PA ${c.pa}, ${c.positions}): ${name(c)} → ${c.on_arrival === 'squad' ? 'joins the squad (backup level)' : 'loan-listed on arrival (approve with --note "wonderkid")'}${c.replaces ? `; replaces ${c.replaces} in the portfolio (sold)` : ''}`);
    if (d.portfolio) md.push(`wonderkid portfolio: ${d.portfolio.held} held, room for ${d.portfolio.room}`);
    return {data: d, md};
  },
  // The sell (listing) table (analysis/sell_table.py): who to list for sale or loan, and at what price.
  async sells(ctx) {
    const d = analysis('sell_table.py', [], {date: ctx.date});
    ctx.sells = d;   // the buys step plans around these sales
    const by = a => d.filter(x => x.action === a);
    return {data: d, md: [
      `sell: ${by('sell').map(x => `${x.name} (${x.age}, ${x.role}) ${money(x.ask)}`).join(' · ') || '-'}`,
      `loan: ${by('loan').map(x => `${x.name} (${x.age}, PA ${x.pa})`).join(' · ') || '-'}`,
      `let go (not listed): ${by('let-go').map(x => x.name).join(' · ') || '-'}`]};
  },
  // Bargains (analysis/bargains.py): undervalued players and buried talent, position-free resale buys.
  async bargains(ctx) {
    const d = analysis('bargains.py', [], {date: ctx.date});
    const name = c => `${c.name} (${c.age}, ${c.positions}, CA ${c.ca}/PA ${c.pa}, ${c.club}) ${money(c.value)}`;
    return {data: d, md: [`caps: ${d.caps.per_window} buys, ${money(d.caps.max_spend)} a window · squad avg CA ${d.squad_avg}, bar CA ${d.quality_bar} (avg − 10)`,
      ...d.undervalued.slice(0, 5).map(c => `undervalued ${c.ratio}x (typical ${money(c.typical)}): ${name(c)}`),
      ...d.buried.slice(0, 5).map(c => `buried talent: ${name(c)}`)]};
  },
  async results(ctx) {
    const d = analysis('results.py', ['--date', ctx.date, '--label', `${ctx.name} ${ctx.date}`], {date: ctx.date});
    return {data: d, md: [`position ${d.position ?? '-'} · balance ${money(d.club_balance)} · income-exp 12m ${money(d.income_12m - d.expenditure_12m)} · first-team value ${money(d.first_team_value)} · wages £${Math.round(d.wage_bill_pw / 1e3)}K/wk`]};
  },
  async contracts(ctx) {
    const sq = ctx.squad ??= analysis('manager.py', ['squad'], {date: ctx.date});
    const alerts = sq.alerts || [];
    return {data: {alerts, expiring: sq.expiring || []},
      md: alerts.length ? alerts.map(a => `${a.name} (${a.age}, ${a.positions}, ${money(a.value)}): ${a.issue}${a.expires ? ' to ' + a.expires : ''} → ${a.do}`) : ['no contract alerts']};
  },
  // Final-year contracts through the decision matrix (capabilities/contracts/final-year.mjs): each
  // player gets an action, not a warning. 'ask-demands' = run the renewal preview, then decide.
  async final_year(ctx) {
    const {decideFinalYear} = await import('../contracts/final-year.mjs');
    const {loadPolicy} = await import('../sell/decide.mjs');
    const pol = loadPolicy().contracts, d = analysis('final_year.py', [], {date: ctx.date});
    const rows = d.players.map(f => ({...f, decision: decideFinalYear(f, {finalYear: pol.final_year, renewal: pol.renewal})}));
    return {data: {final_year_by: d.final_year_by, players: rows},
      md: rows.length ? rows.map(r => `**${r.decision.action.toUpperCase()}** ${r.name} (${r.age}, ${r.role}, ${money(r.value)}, £${Math.round(r.wage / 1e3)}K/wk, ${r.minutes} min${r.starts ? ', starts' : ''}): ${r.decision.why}`)
        : [`no contracts ending by ${d.final_year_by}`]};
  },
  async squad(ctx) {
    const sq = ctx.squad ??= analysis('manager.py', ['squad'], {date: ctx.date});
    const md = (sq.positions || []).map(p => `${p.position} (${p.slots.join('/')}): ${p.specialists.slice(0, 5).map(s => `${s.name} ${s.age} ${money(s.value)} ${s.minutes}m${s.standing?.output != null ? ' out ' + s.standing.output : ''}`).join('; ')}`);
    if (sq.needs?.length) md.push(`needs: ${JSON.stringify(sq.needs)}`);
    const hg = sq.homegrown;
    if (hg) md.push(`homegrown seniors: ${hg.count}/${hg.min}${hg.short ? ` (**${hg.short} short**: prefer homegrown signings)` : ''}: ${hg.players.join(', ') || '-'}`);
    if (sq.sell_candidates?.length) md.push(`sell candidates: ${sq.sell_candidates.map(c => `${c.name} (${c.why})`).join('; ')}`);
    return {data: {positions: sq.positions, needs: sq.needs, sell_candidates: sq.sell_candidates, homegrown: sq.homegrown}, md};
  },
  async free_agents(ctx) {
    const d = ctx.freeAgents = analysis('free_agents.py', ['--top', '25'], {date: ctx.date});
    const md = d.players.map(c => `${c.watch ? '**WATCH** ' : ''}${c.always_buy ? '**ALWAYS BUY** ' : ''}${c.homegrown ? '**HG** ' : ''}${c.name} (${c.age}, ${c.slot ?? c.positions}, CA ${c.ca}/PA ${c.pa}: ${c.why}) worth ${money(c.worth)} (FM now ${money(c.value_now)}), ${c.contract_club || 'free'}${c.on_loan ? ` (on loan at ${c.playing_at})` : ''}, to ${c.contract_until || '-'}: ${c.route}`);
    return {data: d, md: md.length ? md : [`none worth ${money(5e6)}+ ending by ${d.free_by}`]};
  },
  async wonderkids(ctx) {
    const d = analysis('wonderkids.py', [], {date: ctx.date});
    const june = freeBy(ctx.date);
    return {data: d, md: d.players.length ? d.players.map(x => `${x.homegrown ? '**HG** ' : ''}${x.name} (${x.age}, ${x.positions}, ${x.nation}) ${x.club} PA ${x.pa} CA ${x.ca} ${money(x.value)} to ${x.contract_until || '-'}${x.contract_until && x.contract_until <= june ? ' → contract ends by June: a free pre-contract, never a bid (free_agents)' : ''}`)
      : [`none at PA ${d.rule.min_pa}+, age ${d.rule.max_age} or under, ${money(d.rule.max_value)} or less`]};
  },
  async newgens(ctx) {
    const d = analysis('newgens.py', [], {date: ctx.date});
    const row = x => `${x.name} (${x.age}, ${x.positions}, ${x.nation}) ${x.club} CA ${x.ca}/PA ${x.pa} ${money(x.value)}`;
    return {data: d, md: [`class: ${d.class_size}`, `ours: ${d.ours.map(x => `${x.name} PA ${x.pa}`).join(', ') || '-'}`,
      'signable now:', ...d.signable_now.map(row), 'watch until 18:', ...d.watch_until_18.slice(0, 5).map(row)]};
  },
  async plan(ctx) {
    if (!ctx.budget) return {data: null, md: ['skipped: pass --budget N (Recruitment → Budgets, "Transfer Available")']};
    const d = analysis('plan.py', ['--budget', String(ctx.budget), '--lens', ctx.lens || 'attributes', '--max-age', String(ctx.maxAge || 25)], {date: ctx.date});
    return {data: {buy: d.buy, shortlist: d.shortlist, sell: d.sell, budget: d.budget},
      md: [...d.buy.map(b => `buy ${b.slot} ${b.role}: ${b.name} (${b.age}, ${b.club}) ${money(b.value)}, walk away ${money(b.walk_away)}${b.against?.length ? ' · against: ' + b.against.join('; ') : ''}`),
        ...d.sell.map(s => `sell? ${s.name} (${s.slot}, ${money(s.value)}): ${s.why.join('; ')}`)]};
  },
  async audit(ctx) {
    const {audit} = await import('../audit/audit.mjs');
    const sq = ctx.squad ?? (() => { try { return analysis('manager.py', ['squad'], {date: ctx.date}); } catch { return {}; } })();
    const r = await audit({alerts: sq.alerts || [], stillFree: ctx.freeAgents?.players?.map(p => p.name), since: `${seasonOf(ctx.date).slice(0, 4)}-07-01`, running: {name: ctx.name, date: ctx.date}});   // this season's deals, as fm audit
    return {data: r, md: [`ok ${r.ok} · net transfer profit ${money(r.score?.netTransferProfit)}`, ...r.fail.map(x => `FAIL ${x}`), ...r.decide.map(x => `DECIDE ${x}`), ...r.warn.map(x => `warn ${x}`)]};
  },
};

/** Run one checkpoint now: every step in order; a failing step is reported, never skipped silently. */
export async function runCheckpoint(name, {budget, lens, maxAge, date, save = true, steps = STEPS, cycle = loadCycle(), write = true} = {}) {
  const cp = cycle.checkpoints.find(c => c.name === name);
  if (!cp) throw new Error(`checkpoint: ${cycle.checkpoints.map(c => c.name).join(' | ')}`);
  if (save) { const {saveGame} = await import('./save.mjs'); await saveGame(); analysis('free_agents.py', ['--top', '1'], {fresh: true}); }
  date ??= await gameDate();
  // verdicts: every row the tables raise gets the manager's act / propose / pass (season/verdicts.mjs).
  const ctx = {name, date, budget, lens, maxAge}, report = {checkpoint: name, date, season: seasonOf(date), why: cp.why, verdicts: true, steps: {}};
  const md = [`# ${name} checkpoint, ${date}`, '', cp.why, ''];
  for (const step of cp.steps) {
    md.push(`## ${step}`);
    try { const r = await steps[step](ctx); report.steps[step] = {ok: true, data: r.data}; md.push(...r.md.map(l => `- ${l}`)); }
    catch (e) { report.steps[step] = {ok: false, error: e.message}; md.push(`- STEP FAILED: ${e.message}`); }
    md.push('');
  }
  if (write) {
    mkdirSync(REPORTS, {recursive: true});
    const base = `${REPORTS}/${date}-${name}`;
    writeFileSync(`${base}.json`, JSON.stringify(report, null, 1));
    writeFileSync(`${base}.md`, md.join('\n'));
    report.files = [`${base}.md`.replace(ROOT, ''), `${base}.json`.replace(ROOT, '')];
  }
  const {rowsOf} = await import('./verdicts.mjs'), n = rowsOf(report).length;
  if (n) md.push('## verdicts', `- ${n} rows to answer: fm verdicts (list), fm verdict <step> "<item>" act|propose|pass --why "…" [--price N]`, '');
  report.markdown = md.join('\n');
  return report;
}

/** All checkpoint reports on disk: [{name, date, season, file}]. */
export function reports(dir = REPORTS) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const r = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    return {name: r.checkpoint, date: r.date, season: r.season, file: `${dir}/${f}`, report: r};
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** To the next checkpoint, then run it (the loop's one step). Inside a transfer window we drive the
 *  game ourselves with the autopilot (bids, loan offers, deadline deals; match days are a one-day
 *  holiday): user, 2031-08-08, after late loan offers were missed on holiday. Outside the windows:
 *  holiday to the next window or checkpoint, whichever comes first. */
export async function cycle(opts = {}, {date = gameDate, inWindow: inWin, nextOpen, closeOf, drive, away, check = runCheckpoint, done = reports} = {}) {
  const season = await import('./season.mjs');
  inWin ??= season.inWindow; nextOpen ??= season.nextWindowOpen; closeOf ??= season.windowEnd;
  drive ??= async until => (await import('./autopilot.mjs')).run({until});
  away ??= async until => (await import('./holiday.mjs')).holidaySeason({until});
  const iso = d => d.toISOString().slice(0, 10), day = x => new Date(x + 'T00:00:00Z');
  // Today's checkpoint already ran (its report exists): the next one (newgen ran twice, 2032-05-01).
  const start = await date(), ran = done().some(r => r.date === start);
  const next = nextCheckpoint(ran ? season.addDays(start, 1) : start);
  const legs = [];
  for (let i = 0; i < 12; i++) {
    const today = await date();
    if (today >= next.date) return {legs, ...await check(next.name, opts)};
    if (inWin(day(today))) {
      // To the checkpoint if it falls inside this window, else to the window's close.
      const close = iso(closeOf(day(today))), until = next.date <= close ? next.date : season.addDays(close, 1);
      const r = await drive(until); legs.push({drive: until, reason: r.reason});
      if (!['until', 'window-closed'].includes(r.reason)) return {stopped: r, next, legs};
    } else {
      const open = iso(nextOpen(day(today))), until = open < next.date ? open : next.date;
      const h = await away(until); legs.push({holiday: until, reason: h.reason});
      if (h.reason !== 'returned') return {stopped: h, next, legs};
    }
  }
  return {stopped: {reason: 'too many legs'}, next, legs};
}
