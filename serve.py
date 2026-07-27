#!/usr/bin/env python3
"""
Royal Casino local server + system-monitor feed.

Normal mode:      python3 serve.py
  - serves the static site on PORT (default 8000)
  - serves /api/sysmon on that same port (same-origin)
  - ALSO serves /api/sysmon on MON_PORT (default 11435) with CORS, so the
    monitor works even if you serve the site some other way.

Monitor-only:     python3 serve.py --monitor-only
  - just the /api/sysmon feed on MON_PORT (use this if you serve the site
    yourself, e.g. `python3 -m http.server`).

Metrics come from `macmon` (Apple Silicon, no sudo). If it's missing the feed
reports {"available": false} and the site works exactly as before.
"""
import json
import os
import subprocess
import sys
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler, BaseHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8000"))
MON_PORT = int(os.environ.get("MON_PORT", "11435"))

_latest = {"available": False, "error": "starting up"}
_lock = threading.Lock()


def _macmon_reader():
    global _latest
    try:
        proc = subprocess.Popen(
            ["macmon", "pipe", "-i", "1000"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
    except FileNotFoundError:
        with _lock:
            _latest = {"available": False, "error": "macmon not installed"}
        return
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        mem = d.get("memory", {}) or {}
        temp = d.get("temp", {}) or {}
        gpu = d.get("gpu_usage") or [0, 0]
        with _lock:
            _latest = {
                "available": True,
                "cpu": float(d.get("cpu_usage_pct", 0) or 0),
                "gpu": float(gpu[1] if len(gpu) > 1 else 0),
                "power": float(d.get("all_power", 0) or 0),
                "cpu_power": float(d.get("cpu_power", 0) or 0),
                "gpu_power": float(d.get("gpu_power", 0) or 0),
                "ane_power": float(d.get("ane_power", 0) or 0),
                "ram_used": int(mem.get("ram_usage", 0) or 0),
                "ram_total": int(mem.get("ram_total", 0) or 0),
                "cpu_temp": float(temp.get("cpu_temp_avg", 0) or 0),
                "gpu_temp": float(temp.get("gpu_temp_avg", 0) or 0),
            }


def _write_sysmon(handler):
    with _lock:
        body = json.dumps(_latest).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class SiteHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split("?")[0] == "/api/sysmon":
            return _write_sysmon(self)
        return super().do_GET()


class MonitorHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split("?")[0] == "/api/sysmon":
            return _write_sysmon(self)
        self.send_response(404)
        self.end_headers()


def _serve(server):
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    threading.Thread(target=_macmon_reader, daemon=True).start()

    # Dedicated CORS monitor endpoint (bound to localhost only).
    try:
        monitor = ThreadingHTTPServer(("127.0.0.1", MON_PORT), MonitorHandler)
    except OSError:
        monitor = None  # already running elsewhere — fine

    if "--monitor-only" in sys.argv:
        if monitor is None:
            print(f"Monitor already running on http://localhost:{MON_PORT}")
        else:
            print(f"System monitor on http://localhost:{MON_PORT}/api/sysmon  (Ctrl+C to stop)")
            _serve(monitor)
    else:
        if monitor is not None:
            threading.Thread(target=_serve, args=(monitor,), daemon=True).start()
        site = ThreadingHTTPServer(("", PORT), SiteHandler)
        print(f"Royal Casino at http://localhost:{PORT}   (monitor: same-origin + :{MON_PORT})")
        _serve(site)
