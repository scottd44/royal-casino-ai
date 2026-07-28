import { useWalletStore } from '@/platform/money/walletStore'
import { fmt, money, pick, randInt } from '@/platform/money/format'
import type { RoyalAgent } from './types'

/* ============================================================
   Loads js/agent/harness.js and js/agent/agent-ui.js BYTE-FOR-BYTE
   UNMODIFIED, straight out of the vanilla repo.

   That is the whole point of the spike. Porting the agent to TypeScript is
   Phase 2 work; if Phase 0 rewrote it, the spike would be testing the
   rewrite rather than answering the actual question — can a React build
   host the agent that already exists?

   web/public/legacy is a symlink to ../../js, so these are the same files
   the vanilla app loads. There is no copy to drift.

   THREE THINGS THIS HAS TO GET RIGHT
   ----------------------------------
   1. window.Casino must exist BEFORE the scripts run. DEVELOPMENT_GUIDE.md §1:
      `const Casino = ...` in a classic script is script-lexically scoped, not
      a window property — so the vanilla app's Casino is invisible to anything
      that isn't a classic script on the same page. We assign window.Casino
      explicitly and agent-ui.js picks it up off the global object.

   2. Load order is not optional. agent-ui.js:16 constructs `new OllamaAgent`
      at module-evaluation time, so harness.js must have finished first.

   3. The endpoint has to be redirected to the Vite proxy. harness.js:27
      hardcodes http://localhost:11434/api/chat, and `agent` is closed over
      inside the RoyalAgent IIFE — there is no setter for it. We patch
      OllamaAgent.prototype from an INLINE CLASSIC SCRIPT injected between the
      two files: inline classic scripts share the global lexical scope, so
      they can see `class OllamaAgent` where an ES module cannot.
   ============================================================ */

declare global {
  interface Window {
    Casino?: unknown
    RoyalAgent?: RoyalAgent
    __royalBridgeReady?: Promise<RoyalAgent>
  }
}

const OLLAMA_ENDPOINT = import.meta.env.VITE_OLLAMA_ENDPOINT || '/ollama/api/chat'

/** The exact Casino surface agent-ui.js reaches for — verified with:
 *  grep -oE 'Casino\.[a-zA-Z]+' js/agent/agent-ui.js | sort -u
 *  -> fmt getBalance money payout pick randInt toast                        */
function makeCasinoCompat() {
  return {
    getBalance: () => useWalletStore.getState().balance,
    payout: (n: number) => useWalletStore.getState().payout(n),
    fmt,
    money,
    pick,
    randInt,
    toast: (msg: string, type = 'info') => {
      console.info(`[casino:${type}]`, msg)
      renderToast(msg, type)
    },
  }
}

function renderToast(msg: string, type: string) {
  let host = document.getElementById('toastHost')
  if (!host) {
    host = document.createElement('div')
    host.id = 'toastHost'
    host.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:60;display:flex;flex-direction:column;gap:8px;pointer-events:none'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  el.style.cssText = `
    max-width:340px;padding:10px 14px;border-radius:10px;font-size:13px;
    background:var(--glass-panel);backdrop-filter:var(--glass-blur);
    border:1px solid var(--glass-line);box-shadow:var(--lift-2);
    color:${type === 'lose' ? 'var(--color-red)' : type === 'win' ? 'var(--color-green)' : 'var(--color-text)'};`
  host.appendChild(el)
  setTimeout(() => el.remove(), 3600)
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = false // preserve execution order
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

/** Inline classic script — shares the global lexical scope, so it can reach
 *  `class OllamaAgent` from harness.js. An ES module cannot. */
function patchEndpointInline(endpoint: string): Promise<void> {
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.textContent = `
      (function () {
        if (typeof OllamaAgent === "undefined") return;
        Object.defineProperty(OllamaAgent.prototype, "endpoint", {
          get() { return ${JSON.stringify(endpoint)}; },
          set() { /* the constructor's assignment is deliberately ignored */ },
          configurable: true,
        });
      })();`
    document.head.appendChild(s)
    resolve()
  })
}

/**
 * Boot the legacy agent once per page. Idempotent — React StrictMode mounts
 * effects twice in dev and a second injection would construct a second
 * OllamaAgent and double every telemetry event.
 */
export function bootLegacyAgent(): Promise<RoyalAgent> {
  if (window.__royalBridgeReady) return window.__royalBridgeReady

  const ready = (async () => {
    window.Casino = makeCasinoCompat()

    await loadScript('/legacy/agent/harness.js')
    await patchEndpointInline(OLLAMA_ENDPOINT)
    await loadScript('/legacy/agent/agent-ui.js')

    const agent = window.RoyalAgent
    if (!agent) throw new Error('agent-ui.js loaded but window.RoyalAgent is missing')

    return agent
  })()

  window.__royalBridgeReady = ready
  return ready
}

/* ============================================================
   WHY THERE IS NO applyBet PATCH HERE
   ----------------------------------
   applyBet lives inside the RoyalAgent IIFE (agent-ui.js:292) and is not
   reachable from outside it. The obvious workaround — intercept the click
   the agent fires right after writing, and re-drive each field through
   setNativeValue on the capture phase — DOES NOT WORK, and the reason is
   worth writing down because it looks like it should.

   The agent's raw `el.value = v` goes through React's tracker setter, which
   updates the tracker's cached value as a side effect. Re-writing the SAME
   value through the prototype setter leaves cache and node equal, so the
   re-dispatched event is discarded exactly like the original one. Measured
   in tests/tracker-probe.spec.ts: state stays at the stale value.

   So the mechanism is the one the plan chose up front — every field the
   agent writes is UNCONTROLLED, and each game reads it from the DOM at
   action time rather than from React state:

     #betInput    components/BetField.tsx  -> readBet(ref)
     #slider      Dice/DiceGame.tsx        -> readTarget(ref)
     #mineSelect  Mines/MinesGame.tsx      -> mineSelectRef.current.value

   setNativeValue remains the required way for OUR code to write these
   fields, and Phase 2's TypeScript port of applyBet must use it.
   ============================================================ */
