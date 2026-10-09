# FM26 UI notes: controls, how we drive them, known quirks

FM26 (Steam build 23583635, macOS arm64) uses Unity **UI Toolkit**. The bridge reads the live
visual tree and calls the same methods a real click calls. The table below is the source of
truth for "how do I press X". Everything here was verified live in October 2026 unless marked.

## Control types

| What you see | Element (type) | `fm` / bridge action | How it works |
|---|---|---|---|
| Buttons, tabs, menu entries | `Button`/`SIButton`/`EntryElement` | `click` | `Clickable.SimulateSingleClick` |
| Player "Actions" and other right-click style menus | `PluginContextMenuBindings` | `menu` (`openMenu`) | `ContextMenuDescriptionManipulator.OpenOnShortcutEvent` |
| Submenus (Actions → Transfer → …) | `EntryElement` | `hover` | `EntryElement.HandleMouseEnter`; submenu entries appear to the right |
| Dropdowns (transfer status, …) | `SIDropdown` | `dropdown open/select/close` (`choose`) | `ShowDropdown`; select = `TriggerSelectionEvent(index)` (what a click calls); `HideDropdown` |
| Money boxes (fee, asking price, payoff) | `FMCombobox` (money button ↔ `SILongField`) | `preset` + `+`/`−` buttons (`setFee`) | see "Fee boxes" below |
| Search box | `TextField` in `GlobalSearchCard` | `text` (`type`) | `set_value`; search runs immediately |
| Plain number fields (vacation days) | `IntegerField` | `number` | `set_value` |
| Checkboxes | `Toggle`/`SICheckBox` | `toggle` | `set_value` (ChangeEvent updates bindings). Label = the NEXT text item. |
| Radio buttons | `SIRadioButton` | `toggle` (true only) | `OnClickedOrSubmitted()` |
| List rows | `*Row*` `NavigatableVisualElement` | `row` | `OnClickedOrSubmitted` — **does not select FM table rows** (club selection): do those by hand |
| Escape key | — | `key Escape` | temporary virtual keyboard via Input System (unreliable while the game is unfocused; last resort) |

**Not used:** a virtual mouse. It registered clicks only intermittently, and a virtual mouse
stuck with its button down swallowed the player's real clicks. If real clicks stop working:
`fm input-reset`.

## Fee boxes (FMCombobox)
Typing a number does **not** stick on every screen (asking price → £1K; agent payoff → £0).
What works, recorded from a player's click:
1. Click the money button → the preset list opens (`floating-element-root` covers the page).
2. Select the largest preset ≤ target: `SIDropdown.TriggerSelectionEvent(index)` on the
   combobox's `m_dropdown`. **The choice index is the visible row index + 1** (an extra first
   choice); `setFee` verifies and corrects.
3. Step with the `+`/`−` buttons next to the box. Step size grows with the value
   (£100 at £1K … £1M at £60M), so £64.8M becomes £64M with `mode: 'atMost'`.

## Overlays (things on top of the page)
`fm overlays` reports them; `fm recover` clears them:

| Overlay | Detected by | Cleared by |
|---|---|---|
| Modal dialog | `GenericModalDialog` panel; title in `dialog-title` | Known titles answered from `KNOWN_DIALOGS` (game/ui/overlays.mjs); **unknown → stop and ask** |
| Context menu | `floating-element-root` + `EntryElement`s | click the header entry (Escape does NOT close it) |
| Dropdown / preset list | `floating-element-root` | `closeDropdowns` (Escape does NOT close it) |
| Hover tooltip (attribute description…) | `floating-element-root` holding text only | click `Portal` (Escape and `closeDropdowns` do NOT close it) |
| Card dialog (Set Transfer Status, vacation) | button named `CancelButton` | click Cancel |
| Global search | `TextField` inside `GlobalSearchCard` | `closeSearch` (the card's `BaseCardTemplateImpl.OnClicked`, i.e. click outside) |
| Agent chat | "End Chat" button | End Chat |

## Quirks
- **Search shows only Messages** on the first try sometimes. Clear and retype (`openPlayer` does it).
  Search results also depend on the page; `openPlayer` searches from the Portal.
- **The Search button toggles** its popup and is covered by it while open: close search with `closeSearch`.
- **Two buttons with the same label** (e.g. two "Accept Payoff"): pick by element name
  (`fm click "Accept Payoff" --name StandardButton`). The negotiation panel's button is the one
  that accepts the negotiated amount.
- **Continue can be ignored** by the game right after processing. The agent releases its
  in-flight latch after 8 s; the loop retries.
- **NewsAggregator / OnHoliday** states pass by themselves; treated as busy.
- **Node ids are tree positions** and change between snapshots: always pick targets from the
  snapshot you act on (the `game/ui/` helpers do this).
- **Hit test**: an action is refused if something covers the element. The helpers run
  `recover()` once and retry; a second refusal means an overlay we don't know — look at it.
- Player search result rows are buttons labelled "Player"; the name is in a menu element right
  after it (the helper matches name + club).

## Mapping a new control
1. `fm record start`, do the action by hand in the game, `fm record stop trace.json`.
2. Find the entry point in the trace (filter out `CloseSelfAndAllChildren`/`HideDropdown` noise):
   the first meaningful call after `SIClickable.ProcessUpEvent`.
3. Add the class to `game/bridge/agent/10-classes.js` and an action to `ELEMENT_ACTIONS` in
   `game/bridge/agent/40-ui-actions.js`; `fm reload`; document it here.
