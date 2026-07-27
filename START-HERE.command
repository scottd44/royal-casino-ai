#!/usr/bin/env bash
# ============================================================
#  Royal Casino — one-click setup & launch  (macOS)
#  Double-click this file in Finder. It will:
#    1. install Ollama (if needed)
#    2. allow your browser to talk to Ollama (CORS)
#    3. download the AI model
#    4. serve the casino and open it in your browser
#  Keep the window that opens running while you play.
#  Press Ctrl+C in it to stop.
# ============================================================

cd "$(dirname "$0")" || exit 1

MODEL="qwen2.5:7b"
PORT="8000"

echo ""
echo "  🎰  ROYAL CASINO — setup"
echo "  ========================="
echo ""

# --- 1) Ollama ------------------------------------------------
if ! command -v ollama >/dev/null 2>&1; then
  echo "  → Ollama isn't installed. Installing it now..."
  if command -v brew >/dev/null 2>&1; then
    brew install ollama || { echo "  ✗ brew install failed."; }
  fi
  if ! command -v ollama >/dev/null 2>&1; then
    echo "  → Opening the Ollama download page. Install the app,"
    echo "    then double-click this file again."
    open "https://ollama.com/download"
    read -r -p "  Press Return to close..." _
    exit 1
  fi
fi
echo "  ✓ Ollama is installed."

# --- 2) Allow the browser (page origin) to call Ollama --------
# Ollama blocks cross-origin requests unless OLLAMA_ORIGINS allows them.
export OLLAMA_ORIGINS="*"
launchctl setenv OLLAMA_ORIGINS "*" 2>/dev/null || true

echo "  → Starting Ollama (with browser access allowed)..."
# Restart any running server so the origin setting takes effect.
pkill -f "ollama serve" >/dev/null 2>&1 || true
sleep 1
OLLAMA_ORIGINS="*" nohup ollama serve >/tmp/royal-ollama.log 2>&1 &

# wait until it answers (up to ~30s)
for i in $(seq 1 30); do
  if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then break; fi
  sleep 1
done
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "  ✓ Ollama is running on http://localhost:11434"
else
  echo "  ⚠ Ollama didn't respond — check /tmp/royal-ollama.log. Games still work manually."
fi

# --- 3) Model -------------------------------------------------
echo "  → Downloading the AI model ($MODEL)."
echo "    First time only — it's a few GB, grab a coffee..."
ollama pull "$MODEL" && echo "  ✓ Model ready." || echo "  ⚠ Model download failed — you can retry later with: ollama pull $MODEL"

# --- 4) Serve the casino and open it --------------------------
if command -v macmon >/dev/null 2>&1; then
  echo "  📊 Live system monitor enabled — watch it in the AI Lab (bottom of any game)."
else
  echo "  ℹ️  Tip: 'brew install macmon' to see live CPU/GPU/power in the AI Lab."
fi
echo ""
echo "  ✅  Opening the casino at http://localhost:$PORT"
echo "      (keep this window open while you play — Ctrl+C to stop)"
echo ""
sleep 1
open "http://localhost:$PORT" 2>/dev/null || true

# serve.py serves the site AND the /api/sysmon monitor feed. Fallbacks keep the
# site working (just without the embedded monitor) if python3 isn't available.
if command -v python3 >/dev/null 2>&1; then
  PORT="$PORT" python3 serve.py
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer "$PORT"
else
  echo "  ✗ Python not found — install it, or serve this folder any other way."
  read -r -p "  Press Return to close..." _
fi
