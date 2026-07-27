#!/usr/bin/env bash
# ============================================================
#  Royal Casino — live system monitor
#  Watch your Mac's CPU / GPU / power while the AI plays.
#  Double-click this file. Press q (or Ctrl+C) to quit.
# ============================================================
cd "$(dirname "$0")" || exit 1

if command -v macmon >/dev/null 2>&1; then
  # macmon: sleek Apple-Silicon monitor, no password needed.
  exec macmon
elif command -v asitop >/dev/null 2>&1; then
  echo "Launching asitop — it needs your password to read power metrics."
  exec sudo asitop
else
  echo "No system monitor found. Install one of these, then try again:"
  echo "  brew install macmon      # sleek, no password needed (recommended)"
  echo "  pipx install asitop      # classic Apple-Silicon 'top'"
  read -r -p "Press Return to close..." _
fi
