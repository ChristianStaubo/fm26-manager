"""FM26 bridge host: one Frida attachment to the game behind a private Unix socket.

Usage:
    python bridge/server.py [--resume STATE.json]

Environment:
    FM26_BRIDGE_DIR   runtime directory for the socket, lock and resume state (default /tmp/fm26-bridge)
    FM26_PROCESS      game process name (default "Football Manager 26")

The agent is every bridge/agent/*.js file concatenated in name order. Protocol: one JSON
request per connection, {"op": ...}, answered by one JSON line {"ok": bool, "result"|"error"}.
"""
import argparse
import fcntl
import json
import os
import socket
import threading
import time
from pathlib import Path

import frida

from blackbox import BlackBox

HERE = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('FM26_BRIDGE_DIR', '/tmp/fm26-bridge'))
PROCESS = os.environ.get('FM26_PROCESS', 'Football Manager 26')
OPS = {'status', 'inspect', 'uimetadata', 'uitree', 'ui', 'reload', 'advance', 'open-required-action', 'blackbox'}


def agent_source():
    return '\n'.join(p.read_text() for p in sorted((HERE / 'agent').glob('*.js')))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--resume', help='state from `anchor` in this same game process (development)')
    args = parser.parse_args()
    RUNTIME.mkdir(parents=True, exist_ok=True)
    sock_path = RUNTIME / 'bridge.sock'
    lock = open(RUNTIME / 'bridge.lock', 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('Another bridge already holds the lock')
    stopped = threading.Event()
    session = script = listener = None
    box = BlackBox()  # the last screens and requests, for incident reports (blackbox.py)

    def on_detached(reason, crash):
        print(json.dumps({'kind': 'detached', 'reason': reason}), flush=True)
        stopped.set()

    def on_message(message, data):
        print(json.dumps(message), flush=True)
        if message.get('type') == 'error':
            stopped.set()

    def load_agent():
        s = session.create_script(agent_source())
        s.on('message', on_message)
        s.load()
        if stopped.is_set():
            raise RuntimeError('Agent initialisation failed (see log)')
        return s

    try:
        pid = frida.get_local_device().get_process(PROCESS).pid
        session = frida.attach(pid)
        session.on('detached', on_detached)
        script = load_agent()
        if args.resume:
            state = json.loads(Path(args.resume).read_text())
            if state['pid'] != pid:
                raise RuntimeError('Resume state belongs to a different game process')
            script.exports_sync.seed(state['managerAddress'], state['manualTimer'])
        sock_path.unlink(missing_ok=True)
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(str(sock_path))
        os.chmod(sock_path, 0o600)
        listener.listen(4)
        listener.settimeout(0.5)
        print(json.dumps({'kind': 'listening', 'socket': str(sock_path), 'pid': pid}), flush=True)
        while not stopped.is_set():
            try:
                conn, _ = listener.accept()
            except socket.timeout:
                continue
            with conn:
                conn.settimeout(5)
                request, started, result, failure = {}, time.monotonic(), None, None
                try:
                    raw = b''
                    while b'\n' not in raw:
                        part = conn.recv(4096)
                        if not part:
                            raise ValueError('Incomplete request')
                        raw += part
                        if len(raw) > 8192:
                            raise ValueError('Request too large')
                    request = json.loads(raw.split(b'\n', 1)[0])
                    op = request.get('op')
                    if op not in OPS:
                        raise ValueError(f'Unsupported operation: {op}')
                    exports = script.exports_sync
                    if op == 'blackbox':
                        result = box.dump()
                    elif op == 'reload':
                        # Replace the agent in the same session, keeping the manager and timer.
                        if exports.status().get('actionInFlight'):
                            raise RuntimeError('Cannot reload during a Continue action')
                        anchor, timer = exports.anchor(), exports.status().get('manualTimer')
                        replacement = load_agent()
                        if anchor:
                            replacement.exports_sync.seed(anchor, timer)
                        exports.dispose()
                        script.unload()
                        script = replacement
                        result = {'reloaded': True}
                    elif op == 'ui':
                        result = exports.ui(request)
                    else:
                        result = getattr(exports, op.replace('-', ''))()
                    response = {'ok': True, 'result': result}
                except Exception as e:  # report every failure to the client
                    response, failure = {'ok': False, 'error': str(e)}, e
                if request.get('op') != 'blackbox':
                    try:
                        box.request(request, round((time.monotonic() - started) * 1000), result, failure)
                    except Exception:  # the black box never breaks the bridge
                        pass
                try:
                    conn.sendall((json.dumps(response) + '\n').encode())
                except (BrokenPipeError, ConnectionResetError):
                    pass
    except KeyboardInterrupt:
        pass
    finally:
        if listener:
            listener.close()
        sock_path.unlink(missing_ok=True)
        if session:
            try:
                if script and not stopped.is_set():
                    script.exports_sync.dispose()
                session.detach()
            except frida.InvalidOperationError:
                pass
        lock.close()


if __name__ == '__main__':
    main()
