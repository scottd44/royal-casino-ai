#!/usr/bin/env bash
# ============================================================
#  Royal Casino — system monitor feed (standalone)
#  Use this if you serve the site yourself (e.g. python -m http.server).
#  Double-click it and leave it running; the AI Lab's System monitor
#  will light up. Ctrl+C (or close the window) to stop.
# ============================================================
cd "$(dirname "$0")" || exit 1

if ! command -v macmon >/dev/null 2>&1; then
  echo "macmon isn't installed. Install it, then try again:"
  echo "  brew install macmon"
  read -r -p "Press Return to close..." _
  exit 1
fi

echo "Starting the CPU/GPU/power feed on http://localhost:11435 ..."
echo "Keep this window open while you play. Ctrl+C to stop."
exec python3 serve.py --monitor-only
