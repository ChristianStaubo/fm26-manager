// Fallback before a stop (robotics: a recovery behaviour; behavior trees: a fallback node). When the
// autopilot would stop on a screen, a cheap model looks at it first, within playbook/policy.json
// autopilot.fallback:
//   readFacts  a handler can't read some facts it needs (Unreadable). The model reads only those, each
//              must be on the screen (grounded), and the handler runs again with them: its table decides.
//   pressSafe  no handler for the screen. The model may press one allowed button (safe_buttons) that is
//              on the screen, or none. A screen about money (money_words) always stops, unasked.
// At most max_per_run answers per run, never twice on one screen; each is logged (decisions.jsonl,
// action 'fallback') and recorded as a supervisor-decision for the user to review (fm autonomy).
import {spawn} from 'node:child_process';
import {mainItems, isContent} from './progress.mjs';

const SYSTEM = 'You help an autopilot that plays Football Manager 26 for a club. You see one game screen as text. '
  + 'Answer only through the JSON schema. Never guess: when unsure, answer null and a human will look.';

/** The screen as the model sees it: the main pane in reading order, so a label sits next to its value
 *  ("Playing Salary Percentage" then "[value] 50% (£5,750 p/w)"; listed apart, Haiku couldn't pair them). */
export function screenText(s) {
  // From x 340: offer pages put their form labels at ~380-460 (left of the 480 line the fingerprint uses).
  const lines = s.items.filter(i => isContent(i, 340)).slice(0, 160)
    .map(i => i.kind === 'text' ? '  ' + i.label.slice(0, 240) : `  [${i.kind === 'dropdown' ? 'value' : 'button'}] ${i.label.slice(0, 120)}`);
  return [`date ${s.date()?.toISOString().slice(0, 10) ?? '?'} | Continue slot: ${s.continueLabel() ?? '-'}`, ...lines].join('\n');
}

/** Run `claude -p` (the user's Claude Code login; no API key). Resolves to the structured answer or null. */
export function claudeRunner({bin = process.env.FM_CLAUDE_BIN || 'claude', timeoutMs = 90000} = {}) {
  return ({system, prompt, schema, model}) => new Promise(resolve => {
    const args = ['-p', '--model', model, '--output-format', 'json', '--no-session-persistence', '--tools', '',
      '--strict-mcp-config', '--disable-slash-commands', '--system-prompt', system, '--json-schema', JSON.stringify(schema)];
    let out = '';
    const p = spawn(bin, args, {cwd: '/tmp', stdio: ['pipe', 'pipe', 'ignore']});
    const timer = setTimeout(() => { p.kill(); resolve(null); }, timeoutMs);
    p.stdout.on('data', d => { out += d; });
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.on('close', () => {
      clearTimeout(timer);
      try { const r = JSON.parse(out); resolve(r.is_error ? null : r.structured_output ?? null); } catch { resolve(null); }
    });
    p.stdin.end(prompt);
  });
}

// Facts the model may read, how to describe them, and how to check its answer is on the screen.
const pct = v => `${Math.round(v * 100)}%`;
export const FACTS = {
  wageShare: {schema: {type: ['number', 'null']}, about: 'the share of his wage the other club pays, as a fraction 0-1 (shown as a percentage, e.g. 80% = 0.8)',
    valid: v => Number.isFinite(v) && v >= 0 && v <= 1, grounded: (v, text) => text.includes(pct(v))},
  duration: {schema: {type: ['string', 'null']}, about: 'how long the loan runs, copied exactly as shown (e.g. "End of season")'},
  playingTime: {schema: {type: ['string', 'null']}, about: 'the playing time promised, copied exactly as shown (e.g. "Regular Starter")'},
};
const fold = t => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
const onScreen = (v, text) => typeof v === 'string' && v.trim().length > 1 && fold(text).includes(fold(v));

export function makeFallback({policy, runner = claudeRunner(), log = null, ledger = null} = {}) {
  const cfg = policy?.autopilot?.fallback || {};
  const enabled = cfg.enabled !== false && process.env.FM_FALLBACK !== 'off';
  const safe = (cfg.safe_buttons || []).map(r => new RegExp(r)), money = new RegExp(cfg.money_words || '$^', 'i');
  const seen = new Set();
  let used = 0;
  const budget = fp => {
    if (!enabled) return 'fallback disabled';
    if (used >= (cfg.max_per_run ?? 3)) return `fallback limit reached (${cfg.max_per_run ?? 3} this run)`;
    if (fp && seen.has(fp)) return 'fallback already tried this screen';
    return null;
  };
  const record = async (entry, decided) => {
    try { await log?.(entry); } catch { /* logging never stops play */ }
    try { ledger?.({capability: 'season', kind: 'supervisor-decision', decided, rule: entry.why, date: entry.date}); } catch { /* idem */ }
  };

  /** No handler: press one safe button, or none. → {pressed, button, why, entry} */
  async function pressSafe(s, {fp, dryRun = false, press} = {}) {
    const why = budget(fp);
    if (why) return {pressed: false, why};
    const {texts, buttons, dropdowns} = mainItems(s), text = [...texts, ...buttons, ...dropdowns].join('\n');
    if (money.test(text)) return {pressed: false, why: 'a screen about money: always for a human'};
    const allowed = buttons.filter(b => safe.some(r => r.test(b)));
    if (!allowed.length) return {pressed: false, why: 'no allowed button on this screen'};
    seen.add(fp); used++;
    const answer = await runner({system: SYSTEM, model: cfg.model || 'haiku', schema: {type: 'object', properties: {button: {type: ['string', 'null']}, why: {type: 'string'}}, required: ['button', 'why']},
      prompt: `The autopilot has no rule for this screen. Choose the button a sensible manager presses so the game can go on, `
        + `without spending money or changing the squad, from ALLOWED only; or null to stop and ask a human.\n`
        + `Club rules: one-off manager decisions (captaincy, friendlies) are settled the default way; invitations are accepted.\n\n`
        + `SCREEN:\n${screenText(s)}\n\nALLOWED: ${JSON.stringify(allowed)}`});
    const date = s.date()?.toISOString().slice(0, 10) ?? null;
    if (!answer || answer.button == null) return {pressed: false, why: `the model chose to stop${answer?.why ? ': ' + answer.why : ''}`};
    if (!allowed.includes(answer.button)) return {pressed: false, why: `the model chose "${answer.button}", not an allowed button`};
    const entry = {action: 'fallback', mode: 'press', date, button: answer.button, why: answer.why, screen: texts.slice(0, 6), dryRun};
    if (!dryRun) await press(answer.button);
    await record(entry, `pressed "${answer.button}" on "${texts[0] || s.continueLabel()}"`);
    return {pressed: true, button: answer.button, why: answer.why, entry};
  }

  /** A handler's facts missing (Unreadable): read just those. → {facts, why, entry} */
  async function readFacts(s, missing, known = {}, {fp} = {}) {
    const why = budget(fp);
    if (why) return {facts: null, why};
    const unknown = missing.filter(k => !FACTS[k]);
    if (unknown.length) return {facts: null, why: `no description for ${unknown.join(', ')}`};
    seen.add(fp); used++;
    const text = screenText(s);
    const answer = await runner({system: SYSTEM, model: cfg.model || 'haiku',
      schema: {type: 'object', properties: Object.fromEntries(missing.map(k => [k, FACTS[k].schema])), required: missing},
      prompt: `A screen handler could not read these facts from the screen. Read them; null for any you cannot see.\n`
        + missing.map(k => `- ${k}: ${FACTS[k].about}`).join('\n') + `\n\nKNOWN: ${JSON.stringify(known)}\n\nSCREEN:\n${text}`});
    if (!answer) return {facts: null, why: 'no answer from the model'};
    const facts = {}, rejected = [];
    for (const k of missing) {
      const v = answer[k], f = FACTS[k];
      const ok = v != null && (f.valid ? f.valid(v) : true) && (f.grounded ? f.grounded(v, text) : onScreen(v, text));
      if (ok) facts[k] = v; else rejected.push(`${k}=${JSON.stringify(v)}`);
    }
    if (rejected.length) return {facts: null, why: `not on the screen: ${rejected.join(', ')}`};
    const entry = {action: 'fallback', mode: 'read', date: s.date()?.toISOString().slice(0, 10) ?? null, facts, screen: mainItems(s).texts.slice(0, 6)};
    await record({...entry, why: `read ${missing.join(', ')} from the screen`}, `read ${JSON.stringify(facts)}`);
    return {facts, entry};
  }
  return {pressSafe, readFacts, get used() { return used; }};
}
