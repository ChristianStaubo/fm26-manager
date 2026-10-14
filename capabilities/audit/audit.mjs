// fm audit: the outside judge (notes/loop-engineering.md, playbook §10). Deterministic checks,
// separate from the agent that acts, of what the user caught by eye in the summer 2030 window.
// Pure check functions (tested) + gather() for the live data. Scoreboard: policy.json scoreboard.
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {loadPolicy} from '../sell/decide.mjs';
import {history} from '../log.mjs';
import {load as loadApprovals} from '../approvals.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const m = v => `£${(v / 1e6).toFixed(2)}M`;

// Squad: what the XI and the squad tables must never hide.
export function checkSquad({alerts = [], tactic}) {
  const fail = [], warn = [];
  const slots = tactic?.slots || [];
  if (slots.length !== 11 || !slots.some(s => s.slot === 'GK')) fail.push(`tactic.json has ${slots.length} slots${slots.some(s => s.slot === 'GK') ? '' : ', no GK'}: the shape must be the 11 we play`);
  for (const a of alerts) {
    if (a.issue === 'no contract') (a.minutes >= 900 ? fail : warn).push(`${a.name} (${a.positions}, ${a.minutes} min) has no contract: renew, release or replace`);
    else fail.push(`${a.name} (${a.positions}, ${a.minutes} league min) is a ${a.issue}: move him back before the XI is picked`);
  }
  return {fail, warn};
}

// Deals this season: what we paid against what the user approved; what contracts do to resale.
export function checkDeals({decisions = [], approvals = [], cap, rules}) {
  const fail = [], warn = [];
  const limit = name => approvals.find(a => a.kind === 'buy' && norm(a.player) === norm(name))?.limit;
  const paid = {};
  for (const d of decisions.filter(d => d.action === 'buy' && ['agreed', 'accepted-demands', 'release-clause'].includes(d.outcome))) {
    const last = d.reply || d.demand || d.history?.at(-1) || {};
    const upfront = last.upfront ?? d.fee, total = last.total ?? upfront;
    paid[norm(d.name)] = total;   // what we may pay in all: the resale bar
    const lim = limit(d.name);
    if (lim == null) fail.push(`${d.name}: bought with no approval on record`);
    else if (upfront > lim) fail.push(`${d.name}: ${m(upfront)} up front, above the approved ${m(lim)}`);
    else if (total > lim) warn.push(`${d.name}: ${m(upfront)} up front but ${m(total)} with add-ons, above the approved ${m(lim)}`);
  }
  for (const t of decisions.filter(d => d.action === 'personal-terms' && ['agreed', 'accepted-pending'].includes(d.outcome))) {
    if (cap && t.salary > cap) fail.push(`${t.player}: £${t.salary}/wk, above the wage cap £${Math.round(cap)}`);
    const terms = t.demanded || {}, fee = paid[norm(t.player)];
    if (terms.playerSellOnPct > 0) warn.push(`${t.player}: the player takes ${terms.playerSellOnPct}% of a future sale (resale profit)`);
    if (terms.releaseClause && fee && terms.releaseClause < rules.release_clause_min_x_fee * fee)
      warn.push(`${t.player}: release clause ${m(terms.releaseClause)} is under ${rules.release_clause_min_x_fee}x the ${m(fee)} fee: caps resale`);
    if ((t.tries || []).length > 1 && /acceptable|agreed|appreciates/i.test(t.tries[0].reply || ''))
      warn.push(`${t.player}: suggested again after the agent had agreed`);
  }
  return {fail, warn};
}

// Money and the table: the scoreboard (user, 2026-10-14).
export function checkMoney({club, ledger, position, rules}) {
  const fail = [], warn = [], score = {};
  const seasons = Object.values(ledger?.seasons || {});
  score.netTransferProfit = seasons.reduce((a, s) => a + (s.out - s.in), 0);
  score.seasons = seasons.length;
  if (club) {
    score.balance = club.month_end_balance;
    score.wageRatio = Math.round(1000 * club.month_end_wage_bill_pw / club.wage_budget_pw) / 1000;
    if (score.wageRatio > rules.wage_budget_fail) fail.push(`wage bill ${Math.round(score.wageRatio * 100)}% of the budget`);
    else if (score.wageRatio > rules.wage_budget_warn) warn.push(`wage bill ${Math.round(score.wageRatio * 100)}% of the budget`);
  }
  if (position != null) {
    score.position = position;
    if (position >= rules.relegation_position) fail.push(`${position}th: relegation zone`);
    else if (position >= rules.league_warn_position) warn.push(`${position}th: close to the relegation zone`);
  }
  return {fail, warn, score};
}

// ---- Live data --------------------------------------------------------------------------
function clubRow() {
  const dir = `${ROOT}local/exports`, club = JSON.parse(readFileSync(`${ROOT}config/club.json`, 'utf8')).club;
  const f = readdirSync(dir).filter(n => n.endsWith('_clubs.csv')).map(n => `${dir}/${n}`).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!f) return null;
  const [head, ...rows] = readFileSync(f, 'utf8').trim().split('\n').map(l => l.split(','));
  const row = rows.find(r => r[0] === club);
  return row && Object.fromEntries(head.map((h, i) => [h, i ? Number(row[i]) : row[i]]));
}
// The league position: --position, else the latest row of local/reports/<save>-results.md.
function lastPosition() {
  const dir = `${ROOT}local/reports`;
  const f = existsSync(dir) && readdirSync(dir).filter(n => n.endsWith('-results.md')).map(n => `${dir}/${n}`).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!f) return null;
  const pos = readFileSync(f, 'utf8').split('\n').filter(l => /^\| \d{4}-/.test(l)).map(l => l.split('|')[3]?.trim()).filter(p => /^\d+$/.test(p));
  return pos.length ? Number(pos.at(-1)) : null;
}

export async function audit({alerts, position, since} = {}) {
  const policy = loadPolicy(), rules = policy.scoreboard;
  const tactic = JSON.parse(readFileSync(`${ROOT}config/tactic.json`, 'utf8'));
  // Undated entries are kept: the judge never drops evidence silently (Gaitán's resumed buy had no date).
  const decisions = (await history()).filter(d => !since || !d.date || d.date >= since);
  const ledger = existsSync(`${ROOT}local/runs/ledger.json`) ? JSON.parse(readFileSync(`${ROOT}local/runs/ledger.json`, 'utf8')) : null;
  const median = decisions.filter(d => d.firstTeamMedian).at(-1)?.firstTeamMedian;
  const cap = median ? median * policy.contracts.max_salary_vs_first_team_median : null;
  const parts = [checkSquad({alerts, tactic}), checkDeals({decisions, approvals: loadApprovals().approvals, cap, rules}),
    checkMoney({club: clubRow(), ledger, position: position ?? lastPosition(), rules})];
  const fail = parts.flatMap(p => p.fail), warn = parts.flatMap(p => p.warn);
  return {ok: fail.length === 0, score: parts[2].score, fail, warn, since: since || null};
}
