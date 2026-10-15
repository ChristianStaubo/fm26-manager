// Price book (local/runs/price-book.json): our minimum and target for each player we listed.
// Written by `fm sell` at listing time, when the game still shows his value range (a listed
// player's profile shows the asking price instead); read by the bid handler weeks later.
// Minimum and target come from analysis/evaluate_offer.py --price (importance, replacement,
// contract, age), fed the live range; without analysis: minimum v_low, target v_high.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {loadRules} from '../sell/decide.mjs';

const FILE = new URL('../../local/runs/price-book.json', import.meta.url);
const ROOT = new URL('../..', import.meta.url).pathname;
const key = name => (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function load() { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {players: {}}; } }

/** The entry for a player; offers can name him shorter ("Thiago"), so match either way. */
export function lookup(name, book = load()) {
  const k = key(name);
  if (!k) return null;
  return book.players[k] || Object.values(book.players).find(p => key(p.name).endsWith(' ' + k) || k.endsWith(' ' + key(p.name))) || null;
}

// Unlisting ends the price: a stale minimum would decide later bids (Brown, 2031-01-08: unlisted to
// renew him, the book still said £39M against a £72-78M value).
export function remove(name) {
  const book = load(), k = key(lookup(name, book)?.name);
  if (!k || !book.players[k]) return false;
  delete book.players[k];
  writeFileSync(FILE, JSON.stringify(book, null, 1));
  return true;
}

export function record(entry) {
  const book = load();
  book.players[key(entry.name)] = entry;
  mkdirSync(new URL('.', FILE), {recursive: true});
  writeFileSync(FILE, JSON.stringify(book, null, 1));
  return entry;
}

/** Our minimum and target from the live range. min overrides the minimum (e.g. the analyst's). */
export function price(name, range, date, {min} = {}) {
  const [vLow, vHigh] = range, rules = loadRules().selling;
  let analysis = null;
  try {
    const out = execFileSync('python3', ['analysis/evaluate_offer.py', '--price'],
      {cwd: ROOT, input: JSON.stringify({player: name, date, value_range: range}), stdio: ['pipe', 'pipe', 'ignore'], timeout: 120000});
    analysis = JSON.parse(out);
  } catch { /* no save export or player not found: rules only */ }
  // Never below v_low × minimum_vs_v_low; never aim below the top of the range.
  const minimum = Math.round(min ?? Math.max(analysis?.floor ?? vLow, vLow * rules.minimum_vs_v_low));
  const target = Math.round(Math.max(analysis?.target ?? vHigh, vHigh, minimum));
  const repl = analysis?.market_replacement;
  const why = min !== undefined ? 'minimum set by analyst'
    : analysis ? `${analysis.importance} ${analysis.role ?? ''}; factors ${JSON.stringify(analysis.factors)}${repl ? `; cheapest replacement with his output: ${repl.name} (${repl.club}) £${(repl.value / 1e6).toFixed(1)}M` : ''}${analysis.signals?.length ? '; ' + analysis.signals.join('; ') : ''}`
    : 'no analysis (rules only)';
  // Our floor above the top of the market range: nobody will pay it, and he is worth more to us.
  const keep = min === undefined && minimum > vHigh * rules.keep_if_minimum_over;
  return {minimum, target, why, keep, blockers: analysis?.blockers || []};
}
