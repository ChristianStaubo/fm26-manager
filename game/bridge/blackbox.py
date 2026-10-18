"""Black box: the last screens and requests the bridge served, kept in memory only.

The bridge is the one long-lived process every `fm` command goes through, so it sees everything
that led up to a failure. Nothing is written here: `fm` asks for a dump (op "blackbox") when
something fails, and telemetry/incidents.mjs saves it under local/runs/incidents/<id>/.

A screen is stored once per change (same content read again only bumps `seen`), trimmed to what
is on screen (the test fixtures' format) and gzipped: about 90 KB each, 20 kept.
"""
import base64
import gzip
import hashlib
import json
import time
from collections import deque


def _on_screen(n, w, h):
    b = n.get('bounds') or [0, 0, 0, 0]
    return bool(n.get('visible')) and b[2] > 0 and b[3] > 0 and 0 <= b[0] < w and 0 <= b[1] < h


def trim(tree):
    """Visible, on-screen nodes and their ancestors (same rule as cli/friction.mjs trimTree)."""
    nodes = tree.get('nodes') or []
    by_id = {n['id']: n for n in nodes}
    root = next((n for n in nodes if n.get('parent') is None), None)
    w, h = (root['bounds'][2], root['bounds'][3]) if root else (1680, 1050)
    keep = set()
    for n in nodes:
        if _on_screen(n, w, h):
            a = n
            while a is not None and a['id'] not in keep:
                keep.add(a['id'])
                a = by_id.get(a.get('parent'))
    return {**tree, 'nodes': [n for n in nodes if n['id'] in keep]}


def screen_key(tree):
    """Content hash: the same page read twice has the same key (snapshot ids and bounds ignored)."""
    h = hashlib.sha1()
    for n in tree.get('nodes') or []:
        h.update(f"{n.get('parent')}|{n.get('type')}|{n.get('name')}|{n.get('text') or ''}|"
                 f"{n.get('label') or ''}|{n.get('visible')}|{n.get('enabled')}\n".encode())
    return h.hexdigest()[:12]


class BlackBox:
    def __init__(self, screens=20, events=300):
        self.screens = deque(maxlen=screens)
        self.events = deque(maxlen=events)
        self._state = None

    def request(self, request, ms, result=None, error=None):
        op = request.get('op')
        ev = {'t': round(time.time(), 3), 'op': op, 'ms': ms}
        if op == 'status':
            state = 'error' if error else (result or {}).get('stateName')
            if state == self._state:
                return  # polled every few seconds: keep changes only
            self._state = state
            ev['state'] = state
        if op == 'ui':
            ev['action'] = request.get('action')
            target = ' | '.join(x for x in (request.get('expectedName'), request.get('expectedLabel')) if x)
            if target:
                ev['target'] = target[:80]
        if error:
            ev['error'] = str(error).split('\n')[0][:200]
        if op == 'uitree' and result:
            key = screen_key(result)
            ev['screen'], ev['nodes'] = key, len(result.get('nodes') or [])
            last = self.screens[-1] if self.screens else None
            if last and last['key'] == key:
                last['seen'] += 1
                last['last'] = ev['t']
            else:
                gz = gzip.compress(json.dumps(trim(result)).encode(), 5)
                self.screens.append({'key': key, 't': ev['t'], 'last': ev['t'], 'seen': 1, 'gz': gz})
        self.events.append(ev)

    def dump(self):
        screens = [{**{k: v for k, v in s.items() if k != 'gz'}, 'gz': base64.b64encode(s['gz']).decode()}
                   for s in self.screens]
        return {'screens': screens, 'events': list(self.events)}
