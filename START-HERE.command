#!/usr/bin/env bash
# ============================================================
#  Royal Casino — one-click setup & launch  (macOS)
#
#  Double-click this file in Finder. It will:
#    1. install Ollama (if needed)
#    2. allow your browser to talk to Ollama (CORS)
#    3. download the AI model
#    4. install Node (if needed) and all app dependencies
#    5. start the React app and open it in your browser
#
#  Keep the window that opens running while you play.
#  Press Ctrl+C in it to stop.
#
#  NOTE: the casino is now a React + Vite app that lives in web/.
#  It is served by Vite's dev server on port 5173 — NOT the old
#  python serve.py on port 8000, which only served the legacy
#  static build at the repo root. serve.py and the files it served
#  are kept for reference but are no longer what you play.
# ============================================================

set -u
cd "$(dirname "$0")" || exit 1

MODEL="qwen2.5:7b"
PORT="5173"
APP_DIR="web"

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
# Vite proxies /ollama -> localhost:11434 (web/vite.config.ts), so the app
# itself is same-origin. This stays set anyway so anything talking to Ollama
# directly still works.
export OLLAMA_ORIGINS="*"
launchctl setenv OLLAMA_ORIGINS "*" 2>/dev/null || true

echo "  → Starting Ollama (with browser access allowed)..."
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

# --- 4) Node + app dependencies -------------------------------
# The React app needs Node 20+ (Vite 8 requires it) and its npm packages.
if ! command -v node >/dev/null 2>&1; then
  echo "  → Node.js isn't installed. Installing it now..."
  if command -v brew >/dev/null 2>&1; then
    brew install node || echo "  ✗ brew install node failed."
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "  → Opening the Node.js download page. Install the LTS build,"
    echo "    then double-click this file again."
    open "https://nodejs.org/en/download"
    read -r -p "  Press Return to close..." _
    exit 1
  fi
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  ⚠ Node $(node -v) is too old — Vite 8 needs Node 20 or newer."
  echo "    Upgrade with 'brew upgrade node' (or install the LTS from nodejs.org)"
  echo "    and run this again."
  read -r -p "  Press Return to close..." _
  exit 1
fi
echo "  ✓ Node $(node -v) is installed."

if [ ! -d "$APP_DIR" ]; then
  echo "  ✗ Can't find the app folder ($APP_DIR/). Is this the repo root?"
  read -r -p "  Press Return to close..." _
  exit 1
fi

cd "$APP_DIR" || exit 1

echo "  → Installing app dependencies (first run takes a minute)..."
# `npm ci` is the reproducible install, but it hard-fails if the lockfile and
# package.json have drifted — fall back so a first-time player never gets
# stuck on a dependency error they can't read.
if [ -f package-lock.json ]; then
  npm ci || { echo "  ⚠ npm ci failed, falling back to npm install..."; npm install; }
else
  npm install
fi

if [ ! -d node_modules ]; then
  echo "  ✗ Dependencies failed to install. Check the errors above."
  read -r -p "  Press Return to close..." _
  exit 1
fi
echo "  ✓ Dependencies ready."

# --- 5) Serve the casino and open it --------------------------
if command -v macmon >/dev/null 2>&1; then
  echo "  📊 macmon detected — live system stats available."
else
  echo "  ℹ️  Tip: 'brew install macmon' for live CPU/GPU/power readings."
fi

# Free the port if a previous run is still holding it, or Vite will silently
# pick 5174 and the browser tab we open lands on nothing.
if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "  → Port $PORT is busy; stopping the old dev server..."
  lsof -ti tcp:"$PORT" | xargs kill -9 >/dev/null 2>&1 || true
  sleep 1
fi

echo ""
echo "  ✅  Opening the casino at http://localhost:$PORT"
echo "      (keep this window open while you play — Ctrl+C to stop)"
echo ""

# Open the browser once the dev server is actually answering, rather than
# racing it with a fixed sleep.
(
  for i in $(seq 1 40); do
    if curl -s "http://localhost:$PORT" >/dev/null 2>&1; then
      open "http://localhost:$PORT" 2>/dev/null || true
      exit 0
    fi
    sleep 0.5
  done
) &

npm run dev -- --port "$PORT" --strictPort
