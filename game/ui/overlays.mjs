// What is open on top of the page, and how to get back to a clean page.
import {ui} from '../bridge/client.mjs';
import {Screen, clean, settle} from './screen.mjs';
import {click, act} from './controls.mjs';

export class NeedsAnalyst extends Error { constructor(message, details) { super(message); this.details = details; } }

// Confirmation dialogs answered automatically: title or question → button. Add new ones here.
// Generic titles ("Please Confirm") are matched by their question (dialog-description) instead.
export const KNOWN_DIALOGS = {
  'DOF to negotiate contract?': 'Yes',   // asking the Director of Football to negotiate a renewal
  'Submit the current set of squad numbers?': 'Yes',   // squad numbers (assistant assigned them)
  'Submit completed squad list?': 'Confirm',           // squad registration
  'Enter contract negotiations?': 'Yes',   // renewing ourselves without the agent chat first (Franculino, 2030-07-17)
  'Cancel Negotiations': 'Cancel',   // never drop a deal by accident: keep talking (2028-06-27, Tanaka)
};

export function overlays(s) {
  const out = [], visible = n => n.visible && n.bounds[2] > 0;
  if (s.tree.nodes.some(n => n.type === 'Panel' && n.name === 'GenericModalDialog' && visible(n))) {
    const text = name => clean(s.tree.nodes.find(n => n.name === name && visible(n))?.text);
    out.push({kind: 'dialog', title: text('dialog-title'), description: text('dialog-description')});
  }
  if (s.tree.nodes.some(n => n.name === 'floating-element-root' && visible(n))) {
    const menu = s.tree.nodes.some(n => n.type === 'EntryElement' && visible(n));
    // A hover tooltip (e.g. an attribute description) also lives in the floating root: text only,
    // no rows or controls. closeDropdowns and Escape leave it open.
    const floating = s.floatingItems() || [];
    const tooltip = !menu && floating.length > 0 && floating.every(i => i.kind === 'text');
    out.push(tooltip ? {kind: 'tooltip', text: clean(s.floatingItems()?.find(i => i.kind === 'text')?.label).slice(0, 80)} : {kind: 'popup', menu});
  }
  // Card dialogs (Set Transfer Status, vacation, …) have named Cancel/Confirm buttons.
  if (s.buttons().some(b => b.name === 'CancelButton')) out.push({kind: 'panel'});
  // Only the global search card; pages such as Messages have their own search box.
  if (s.items.some(i => i.kind === 'text-field' && s.within(i.id, 'GlobalSearchCard'))) out.push({kind: 'search'});
  if (s.buttons('End Chat').length) out.push({kind: 'chat'});
  return out;
}

// Return to a page with nothing on top. Known dialogs are answered, menus/lists/search/chats
// closed, card dialogs cancelled. Unknown dialogs are never dismissed blindly.
export async function recover({attempts = 6} = {}) {
  for (let i = 0; i < attempts; i++) {
    const s = await Screen.read(), open = overlays(s);
    if (!open.length) return {clean: true, steps: i};
    // Hover tooltips come and go (FMPedia button, attributes) and only block what they cover:
    // one Portal click, then a page with only a tooltip counts as clean.
    if (open.every(o => o.kind === 'tooltip') && i > 0) return {clean: true, steps: i, tooltip: open[0].text};
    const has = k => open.find(o => o.kind === k);
    if (has('dialog')) {
      const d = has('dialog'), answer = KNOWN_DIALOGS[d.title] ?? KNOWN_DIALOGS[d.description];
      if (!answer) throw new NeedsAnalyst(`Unknown dialog: ${d.title}`, d);
      await click(answer, {recoverOnOcclusion: false});
    } else if (has('popup')?.menu) {
      // Escape does not close FM context menus; selecting the header entry (top-left) does.
      await act(x => {
        const head = x.tree.nodes.filter(n => n.type === 'EntryElement' && n.visible).sort((a, b) => a.bounds[0] - b.bounds[0] || a.bounds[1] - b.bounds[1])[0];
        if (!head) throw new Error('UI content changed');
        return ui.click(x.tree, head);
      }, {recoverOnOcclusion: false});
    } else if (has('popup')) await ui.closeDropdowns();          // dropdown/preset lists ignore Escape
    else if (has('tooltip')) await click('Portal', {recoverOnOcclusion: false}); // leaving the page closes it (2026-06-17)
    // The chat's End Chat can vanish or be disabled between reading and clicking (portfolio buys,
    // 2030-07-21: "Expected one button End Chat, found 0"): a gone button is not an error.
    else if (has('chat')) await click('End Chat', {recoverOnOcclusion: false}).catch(e => { if (!/Expected one button/.test(e.message)) throw e; });
    else if (has('panel')) await click('Cancel', {name: 'CancelButton', recoverOnOcclusion: false});
    else if (has('search')) await ui.closeSearch();                 // card's click-outside handler
    else await ui.key('Escape');                                   // last resort
    await settle(400);
  }
  throw new NeedsAnalyst('Could not clear overlays', overlays(await Screen.read()));
}
