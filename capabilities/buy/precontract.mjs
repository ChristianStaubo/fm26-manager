// Pre-contracts (user, 2031-01-01): a player whose contract ends this June joins us FREE on 1 July.
// Mapped on Miretti: the agent chat (keen → first Contest reply → Agree: his wage ask dropped from
// £39.5-53K to £36-48K) → profile Actions → "Approach To Sign" (top level) → Contract Negotiation:
// Promises with "Contract Start Date: End Of Contract - 7/1/2031" → the contract form → the split
// from his current wage. Agreed £42K (demand £44.5K, current £39.5K).
import {Screen, openPlayer, peekActions, actionPath, profileFacts, NeedsAnalyst, settle, recover, parseMoney} from '../../game/ui/index.mjs';
import {askAgent, ASK} from './ask.mjs';
import {negotiatePersonalTerms} from '../contracts/personal-terms.mjs';
import {gate, factsChanged} from '../approvals.mjs';
import {noteIfOurs} from './arranged.mjs';

export const APPROACH = 'Approach To Sign';

export async function preContract(name, club, {preview = false, dryRun = false} = {}) {
  const approved = dryRun ? null : gate('buy', 'buy', name, {price: 0, what: `pre-contract ${name} (${club})`});
  let profile = await openPlayer(name, club);
  // The facts the approval rests on still hold? (a free agent who has since signed elsewhere: Jiménez, 2036-07)
  const changed = factsChanged(approved, profileFacts(profile));
  if (changed) throw new NeedsAnalyst(`${name}: ${changed}`, {approval: 'facts-changed'});
  // Already agreed (Luiz and Rusnák, 2036-06-04): nothing to offer.
  const done = profileFacts(profile).arranged;
  if (done) { noteIfOurs(name, done); return {action: 'pre-contract', name, club, outcome: 'arranged', arranged: done}; }
  let {top} = await peekActions('Transfer');
  let agent = null;
  if (top.includes(ASK) && !dryRun) {
    agent = await askAgent(name, club);
    if (agent.asked && !agent.willing) return {action: 'pre-contract', name, club, outcome: 'unwilling', agent};
    await recover();
    profile = await openPlayer(name, club);
    ({top} = await peekActions('Transfer'));
  }
  if (!top.includes(APPROACH)) return {action: 'pre-contract', name, club, outcome: 'not-offered', why: `no "${APPROACH}": contract not expiring, talks already open, or (English club) not before his contract ends: approach as a free agent the day after (user, 2032-05-28)`, actions: top};
  const facts = profileFacts(profile);
  const currentWage = facts.wage ?? parseMoney(/£[\d.,]+K?/.exec(facts.contract || '')?.[0] ?? '') ?? null;
  if (dryRun) return {action: 'pre-contract', name, club, dryRun: true, currentWage};
  await actionPath([APPROACH]);
  await settle(2500);
  const s = await Screen.read();
  const start = s.after('Contract Start Date', i => i.kind === 'dropdown')?.label || '';
  if (start && !/End Of Contract/i.test(start)) throw new NeedsAnalyst(`${name}: contract start "${start}" is not End Of Contract (not a pre-contract); talks left open`, {start});
  const r = await negotiatePersonalTerms({player: name, entered: true, currentWage, preview});
  return {action: 'pre-contract', name, club, start, agent, ...r};
}
