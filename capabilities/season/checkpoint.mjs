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

// Each step: (ctx) → {data, md: [lines]}. ctx caches the squad call (contracts and squad share it).
export const STEPS = {
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
  async squad(ctx) {
    const sq = ctx.squad ??= analysis('manager.py', ['squad'], {date: ctx.date});
    const md = (sq.positions || []).map(p => `${p.position} (${p.slots.join('/')}): ${p.specialists.slice(0, 5).map(s => `${s.name} ${s.age} ${money(s.value)} ${s.minutes}m${s.standing?.output != null ? ' out ' + s.standing.output : ''}`).join('; ')}`);
    if (sq.needs?.length) md.push(`needs: ${JSON.stringify(sq.needs)}`);
    if (sq.sell_candidates?.length) md.push(`sell candidates: ${sq.sell_candidates.map(c => `${c.name} (${c.why})`).join('; ')}`);
    return {data: {positions: sq.positions, needs: sq.needs, sell_candidates: sq.sell_candidates}, md};
  },
  async free_agents(ctx) {
    const d = analysis('free_agents.py', ['--top', '25'], {date: ctx.date});
    const md = d.players.map(c => `${c.always_buy ? '**ALWAYS BUY** ' : ''}${c.name} (${c.age}, ${c.slot}, attrs ${c.attributes}) worth ${money(c.worth)} (FM now ${money(c.value_now)}), ${c.contract_club || 'free'}${c.on_loan ? ` (on loan at ${c.playing_at})` : ''}, to ${c.contract_until || '-'}: ${c.route}`);
    return {data: d, md: md.length ? md : [`none worth ${money(5e6)}+ ending by ${d.free_by}`]};
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
    const r = await audit({alerts: sq.alerts || [], since: `${seasonOf(ctx.date).slice(0, 4)}-07-01`});   // this season's deals, as fm audit
    return {data: r, md: [`ok ${r.ok} · net transfer profit ${money(r.score?.netTransferProfit)}`, ...r.fail.map(x => `FAIL ${x}`), ...r.decide.map(x => `DECIDE ${x}`), ...r.warn.map(x => `warn ${x}`)]};
  },
};

/** Run one checkpoint now: every step in order; a failing step is reported, never skipped silently. */
export async function runCheckpoint(name, {budget, lens, maxAge, date, save = true, steps = STEPS, cycle = loadCycle(), write = true} = {}) {
  const cp = cycle.checkpoints.find(c => c.name === name);
  if (!cp) throw new Error(`checkpoint: ${cycle.checkpoints.map(c => c.name).join(' | ')}`);
  if (save) { const {saveGame} = await import('./save.mjs'); await saveGame(); analysis('free_agents.py', ['--top', '1'], {fresh: true}); }
  date ??= await gameDate();
  const ctx = {name, date, budget, lens, maxAge}, report = {checkpoint: name, date, season: seasonOf(date), why: cp.why, steps: {}};
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

/** Holiday to the next checkpoint, then run it (the loop's one step). */
export async function cycle(opts = {}) {
  const today = await gameDate();
  const next = nextCheckpoint(today);
  if (next.date > today) { const {holidaySeason} = await import('./holiday.mjs'); const h = await holidaySeason({until: next.date}); if (h.reason !== 'returned') return {stopped: h, next}; }
  return runCheckpoint(next.name, opts);
}
