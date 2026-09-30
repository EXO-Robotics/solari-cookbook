#!/usr/bin/env python3
"""Explicit opt-in native probe; no production controller, lease, or Safari changes."""
import argparse
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--helper', required=True)
    parser.add_argument('--probe', required=True)
    args = parser.parse_args()
    token = secrets.token_urlsafe(40)
    ready = threading.Event()
    disarmed = threading.Event()
    readiness_lost = threading.Event()
    class Receiver(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            if self.headers.get('Authorization') != 'Bearer ' + token:
                self.send_error(401)
                return
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 <= length <= 100:
                self.send_error(400)
                return
            body = json.loads(self.rfile.read(length))
            if self.path == '/api/protection/heartbeat' and body == {'ready': True}:
                ready.set()
            elif self.path == '/api/protection/heartbeat' and body == {'ready': False}:
                readiness_lost.set()
            elif self.path == '/api/protection/disarm' and set(body) == {'requestId'} and isinstance(body['requestId'], str):
                disarmed.set()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', '2')
            self.end_headers()
            self.wfile.write(b'{}')
    server = ThreadingHTTPServer(('127.0.0.1', 0), Receiver)
    receiver = threading.Thread(target=server.serve_forever, daemon=True)
    receiver.start()
    helper = None
    with tempfile.TemporaryDirectory(prefix='aionguard-native-probe-') as directory:
        path = Path(directory, 'recovery-token')
        path.write_text(token)
        path.chmod(0o600)
        try:
            helper = subprocess.Popen([args.helper, '--token-file', str(path), '--port', str(server.server_port)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if not ready.wait(6):
                raise RuntimeError('Passive helper did not become ready; no keys will be posted.')
            if disarmed.is_set():
                raise RuntimeError('Unexpected readiness loss before probe; no keys will be posted.')
            result = subprocess.run([args.probe], capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                raise RuntimeError('Owned-window event probe failed: ' + result.stderr.strip())
            if not disarmed.wait(3):
                raise RuntimeError('Synthetic input did not produce a disarm request.')
            if readiness_lost.is_set():
                raise RuntimeError('Helper readiness changed during probe; disarm provenance is ambiguous.')
            print(json.dumps({'status': 'PASS', 'helperReadyHeartbeat': True, 'ownedWindowReceivedSynthetic0000': True,
                              'nativeEventTapDisarmPOST': True, 'physicalKeyboardVerified': False,
                              'realProtectionArmed': False, 'safariInterceptionVerified': False}))
        finally:
            if helper is not None and helper.poll() is None:
                helper.terminate()
                try:
                    helper.communicate(timeout=3)
                except subprocess.TimeoutExpired:
                    helper.kill()
                    helper.communicate(timeout=3)
            server.shutdown()
            server.server_close()

if __name__ == '__main__':
    main()
