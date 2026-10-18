// Benchmarks for the A/B of UI paths against direct game calls (docs/next-steps.md #6). One job, both
// ways, alternating, each from the same start (the Portal, no profile on screen); time to the
// verified result, and the bridge calls it took. Saved in local/runs/benchmarks/.
import {mkdirSync, writeFileSync} from 'node:fs';
import {counts} from './trace.mjs';

const snapshot = () => ({...counts});
const diff = (a, b) => Object.fromEntries(Object.keys(b).map(k => [k, b[k] - (a[k] || 0)]).filter(([, v]) => v));

/** Open each player's profile n times through the UI and n times directly. players: [{name, club}]. */
export async function benchOpenProfile(players, {n = 5} = {}) {
  const nav = await import('../game/ui/navigate.mjs'), {waitFor} = await import('../game/ui/screen.mjs');
  const client = await import('../game/bridge/client.mjs');
  const isProfile = x => x.items.some(i => i.kind === 'menu' && i.label === 'Actions') && x.items.some(i => i.name === 'ContractDetails');
  const showing = name => x => isProfile(x) && x.texts().some(t => nav.sameName(t, name));
  // Learn each index once through the UI (what the direct path needs).
  for (const p of players) { await nav.openPlayer(p.name, p.club); p.index = (await client.direct('currentPerson')).index; }
  const runs = [];
  for (let i = 0; i < n; i++) for (const p of players) for (const way of ['ui', 'direct']) {
    await nav.goTo('Portal'); await waitFor(x => !isProfile(x), {what: 'no profile', timeout: 10000});
    const before = snapshot(), t = Date.now();
    let ok = true;
    try {
      if (way === 'ui') await nav.openPlayer(p.name, p.club);
      else await client.direct('openPerson', {index: p.index});
      await waitFor(showing(p.name), {what: `${p.name} profile`, timeout: 10000});
    } catch (e) { ok = false; }
    runs.push({way, player: p.name, ms: Date.now() - t, ok, calls: diff(before, snapshot())});
  }
  const sum = way => {
    const r = runs.filter(x => x.way === way), ms = r.map(x => x.ms).sort((a, b) => a - b);
    const calls = {}; for (const x of r) for (const [k, v] of Object.entries(x.calls)) calls[k] = (calls[k] || 0) + v;
    return {runs: r.length, ok: r.filter(x => x.ok).length, medianMs: ms[Math.floor(ms.length / 2)], minMs: ms[0], maxMs: ms.at(-1),
      callsPerRun: Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, +(v / r.length).toFixed(1)]))};
  };
  const result = {job: 'open a player profile from the Portal', at: new Date().toISOString(), players: players.map(p => p.name), ui: sum('ui'), direct: sum('direct'), runs};
  mkdirSync(new URL('../local/runs/benchmarks/', import.meta.url), {recursive: true});
  writeFileSync(new URL(`../local/runs/benchmarks/${result.at.slice(0, 19).replace(/:/g, '-')}-open-profile.json`, import.meta.url), JSON.stringify(result, null, 1));
  return result;
}
