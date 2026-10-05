# Bridge

A Frida agent inside Football Manager 26 that reads the Unity UI Toolkit tree and calls the
same methods a real click calls, plus the game's own Continue. A small Python host exposes it
on a private Unix socket; `client.mjs` talks to it.

**Tested on:** macOS 15+ (Apple Silicon), FM26 Steam build 23583635 (IL2CPP metadata v31),
Frida 17.19.0. Other builds may need class/field names adjusted (`agent/10-classes.js`).

## Setup (once)
macOS blocks attaching to signed apps, so the bridge attaches to a **re-signed copy** of the
game. The Steam installation is not modified.
```bash
bridge/setup-macos.sh        # copies to ~/fm26-debug/fm.app, signs it, creates ~/fm26-debug/venv
```
Environment overrides: `FM26_STEAM_APP`, `FM26_GAME_COPY`, `FM26_VENV`. The copy uses your
normal saves and settings. Entitlements: `debug.entitlements.plist` (get-task-allow,
disable-library-validation, allow-unsigned-executable-memory). Your terminal may need permission
to attach (Developer Tools in System Settings → Privacy & Security).

## Run
```bash
open ~/fm26-debug/fm.app                                   # the copy, not Steam's
mkdir -p /tmp/fm26-bridge
~/fm26-debug/venv/bin/python bridge/server.py > /tmp/fm26-bridge/bridge.log 2>&1 &
node cli/fm.mjs status                                     # → state, actionReady
node cli/fm.mjs click Continue                             # once per game launch
```
`FM26_BRIDGE_DIR` (default `/tmp/fm26-bridge`) holds the socket, locks and log. One bridge
per game: a second one fails with "unable to intercept function". Stop it with Ctrl-C/`kill -INT`.

## Agent files (`agent/*.js`, concatenated in name order)
| File | Purpose |
|---|---|
| `00-il2cpp.js` | IL2CPP API, class/method/field lookup, `call()` |
| `10-classes.js` | which game classes are discovered (add new controls here) |
| `20-continue.js` | Continue manager: state, Continue, open the required action |
| `30-ui-tree.js` | read the UI tree; snapshot of actionable elements |
| `40-ui-actions.js` | `ELEMENT_ACTIONS` (click, menu, hover, text, number, toggle, dropdown, preset, row) and checks |
| `50-input.js` | virtual keyboard (Escape/Enter/Tab) |
| `60-recorder.js` | record FM UI calls while a person clicks (to map new controls) |
| `90-main.js` | UI-thread job queue (UpdatePanels hook), discovery, RPC exports |

After editing: `node cli/fm.mjs reload` (keeps the Continue state).

## Protocol
One JSON request per connection: `{"op": "status" | "uitree" | "ui" | "advance" |
"open-required-action" | "reload" | "inspect" | "uimetadata", ...}` → `{"ok": true, "result": …}`.
`ui` requests: `{"op":"ui","action":"click","snapshot":…,"id":…,"expectedName":…,"expectedLabel":…}`
(element actions need the snapshot from the latest `uitree`), or element-free actions
`key`, `closeDropdowns`, `removeVirtual`, `inputInfo`, `recordStart`, `recordStop`.

## Safety model
- Every action is checked against a fresh tree: same object, label, bounds, enabled, visible,
  and on top (hit test). Snapshots are single-use, so an uncertain action is never repeated.
- Continue only runs in `CanContinue`; the in-flight latch prevents double Continues.
- No virtual mouse (see `docs/ui-notes.md`). `fm input-reset` removes virtual devices.
