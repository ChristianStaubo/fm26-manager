// Our current transfer activity: Recruitment → Transfer Activity. The authoritative list of
// bids we made (and offers received), with status, plus the potential budget impact.
import {goTo, click, waitFor, Screen, parseMoney} from '../../ui/index.mjs';

export async function transferActivity() {
  await goTo('Recruitment');
  await click('Transfer Activity');
  const s = await waitFor(x => x.hasText('Potential Transfer Budget Impact') && x.items.some(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label), {what: 'Transfer Activity list'}).catch(() => Screen.read());
  // Left list: one toggle per deal, label "<Player> <Status>".
  const deals = s.items.filter(i => i.kind === 'toggle' && i.bounds[0] < 480 && i.label).map(i => i.label);
  const after = t => parseMoney(s.after(t, i => i.kind === 'text' && parseMoney(i.label) !== null)?.label);
  // Detail pane of the selected deal: "Offer Made £7.5M".
  const selected = s.items.find(i => i.kind === 'button' && i.name === 'transfer-link-button')?.label;
  return {deals, selected, potentialBudgetImpact: after('Potential Transfer Budget Impact'), transferBudget: after('Transfer Budget'), payrollAvailable: after('Payroll Budget')};
}
