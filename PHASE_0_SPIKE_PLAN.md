# Phase 0 — De-risking Spike

**Goal:** prove in one sitting that a React build can host the existing autonomous agent unchanged.
Scaffold Vite + React + TS + Tailwind, port the shell and **three** games (Dice, Mines, Holdem), wire
the **real, unmodified** `js/agent/agent-ui.js`, and watch an LLM-chosen bet land correctly.

**Not in scope:** the other 22 games, the Lab control deck, the report modal, visual polish, the
platform design system. Phase 0 is allowed to look rough. It is not allowed to fake the agent.

**Prereq reading:** `HANDOFF-REACT-MIGRATION.md` §2 (the agent contract) and `DEVELOPMENT_GUIDE.md`
§3 + §5. Both document bugs that already shipped once.

---

## 0. Exit criteria — the spike passes only when all five are true

| # | Criterion | How it is proven |
|---|---|---|
| 1 | `RoyalAgent.adapters.dice.detect()` / `.mines.detect()` / `.holdem.detect()` all return `true` on their React routes | Console, on each route |
| 2 | An **LLM-chosen** stake reaches the wallet | Log the model's `args.bet`, then assert `useWalletStore.getState().bet === that value` before the roll resolves |
| 3 | An **LLM-chosen** Dice `target` reaches the slider | `#slider.value` and the store agree after `applyBet`; the resolved roll uses it |
| 4 | `switchToGame("mines")` navigates via `[data-nav]`, and the hash fallback also works | Both paths, sidebar expanded *and* collapsed |
| 5 | A ≥5-round agentic run across all three games completes with correct `net` in `getStats()` | Compare `getStats().net` against actual balance delta |

**Stop the spike and re-plan if criterion 2 or 3 fails.** That is the whole point of Phase 0.

---

## 1. Preflight — verify the environment before scaffolding

```bash
cd /Users/scottdunlap/Desktop/royal-casino

# toolchain (expected: node ≥ 20, npm ≥ 10 — this machine has node 26.4.0 / npm 11.17.0)
node -v && npm -v

# Ollama must be up with the model the agent defaults to
curl -s http://localhost:11434/api/tags | grep -q 'qwen2.5:7b' && echo "OLLAMA OK" || \
  echo "MISSING — run: ollama pull qwen2.5:7b"

# the vanilla app must be working before we fork it (it is the fallback)
python3 serve.py &   # then load localhost:8000, open AI Lab, run one round, stop
```

Confirm the working tree is clean and branch off the vanilla branch — **never** target `main`, and
never rewrite history on `feat/premium-ui-overhaul`:

```bash
git status --porcelain          # must be empty
git checkout feat/premium-ui-overhaul
git checkout -b feat/react-migration
```

---

## 2. Scaffold

The app is created in a `web/` subdirectory so the vanilla build keeps running from the repo root
untouched for side-by-side comparison. Phase 1 decides whether to promote it to the root.

```bash
npm create vite@latest web -- --template react-ts
cd web
npm install
```

> **Note on React version.** The handoff says React 18; `create-vite` now scaffolds **React 19**.
> Take 19 — the agent contract is DOM-level and unaffected, and Phase 3+ benefits from the newer
> `ref`-as-prop handling. Record the decision in the Phase 0 commit message.

---

## 3. Dependencies

Run from `web/`. Grouped so each line has a single justification.

```bash
# state + routing + class merging
npm i zustand react-router-dom clsx tailwind-merge

# motion + celebration (canvas-confetti is kept per the handoff; GSAP is NOT installed in Phase 0 —
# none of the three spike games need a long physics timeline)
npm i framer-motion canvas-confetti
npm i -D @types/canvas-confetti

# icons — Lucide's React binding replaces the UMD build + MutationObserver entirely
npm i lucide-react

# Tailwind v4 — CSS-first config via the Vite plugin. There is no tailwind.config.js and no
# postcss.config.js in v4; do not run `npx tailwindcss init`.
npm i -D tailwindcss @tailwindcss/vite

# headless E2E for the ported smoke test (needed at step 10)
npm i -D @playwright/test
npx playwright install chromium
```

**Deliberately not installed in Phase 0:** Radix UI, TanStack Router, `react-countup`, GSAP. Each is
a Phase 1/2 decision and adding them now only widens the surface the spike has to explain.

---

## 4. Config files to create

| File | Purpose |
|---|---|
| `web/vite.config.ts` | Add `@tailwindcss/vite`; add the `/ollama` proxy (§5); set `resolve.alias` for `@/` → `src/` |
| `web/src/index.css` | `@import "tailwindcss";` + an `@theme` block carrying the tokens from `DEVELOPMENT_GUIDE.md` §4 verbatim (`--color-bg-0: #05070c` … `--color-gold: #f0c24f`, `--ease`); keep `body::before` aurora + `body::after` grain — glass reads as a flat rectangle without them |
| `web/tsconfig.app.json` | Add the matching `paths` entry for `@/*` |
| `web/index.html` | Shell only. **Must keep `<div id="root">` and nothing else load-bearing** — the agent scripts are injected at runtime (§9), not via `<script>` tags |
| `web/.env.local` | `VITE_OLLAMA_ENDPOINT=/ollama/api/chat` |
| `web/playwright.config.ts` | `webServer` → `npm run dev`, `baseURL: http://localhost:5173`, chromium only |

---

## 5. The Ollama origin problem

`js/agent/harness.js:27` hardcodes `this.endpoint = opts.endpoint || "http://localhost:11434/api/chat"`.
Vite serves on `:5173`, a different origin from the current `:8000`, so this is a fresh CORS surface.

**Do this:** add a dev proxy in `vite.config.ts` mapping `/ollama` → `http://localhost:11434`, and
pass the endpoint in from `import.meta.env.VITE_OLLAMA_ENDPOINT` when constructing `OllamaAgent`.
Same-origin from the browser's point of view, no Ollama env changes, and it survives being served
from anywhere later.

**Fallback if the proxy misbehaves:** `OLLAMA_ORIGINS='*' ollama serve`. Use it to unblock, then fix
the proxy — do not ship it.

`serve.py`'s `/api/sysmon` (the Lab's System monitor) is **out of scope for Phase 0.** Note it as a
Phase 2 proxy target; the three spike games do not touch it.

---

## 6. Files to create — spike source tree

Directory layout follows `HANDOFF-REACT-MIGRATION.md` §3 exactly, so Phase 1 extends rather than
reorganizes. Only the files Phase 0 actually needs are listed.

```
web/src/
  main.tsx                       mount + hash router (see below)
  index.css                      Tailwind v4 @theme tokens + aurora/grain layers

  platform/
    dom/
      setNativeValue.ts          ★ THE SHIM — see §7. Written and tested FIRST.
    money/
      walletStore.ts             Zustand: balance, bet, bet(n)/payout(n), rigged toggle, persist
      format.ts                  ports Casino.fmt / Casino.money verbatim
    agent/
      legacyBridge.ts            loads the untouched vanilla agent scripts + Casino compat shim
      types.ts                   hand-written types for the RoyalAgent surface (handoff §2c)

  app/
    AppShell.tsx                 full-height CSS grid; .app-main is the ONLY scroller
    Sidebar.tsx                  ★ every [data-nav] mounted at all times, incl. when collapsed
    routes.tsx                   /dice /mines /holdem + lobby

  modules/casino/
    games/
      Dice/DiceGame.tsx
      Mines/MinesGame.tsx
      Holdem/HoldemGame.tsx      + holdemApi.ts (re-exposes window.HoldemAPI)
    components/
      BetField.tsx               ★ uncontrolled: defaultValue + ref. Emits #betInput + [data-bet].
      AgentMount.tsx             explicit mount point replacing .panel[1] injection

web/tests/
  dom-contract.spec.ts           asserts every selector for the 3 games exists AND is visible
  agent-live.spec.ts             one real Ollama round per game; asserts the LLM's bet landed
```

**Routing:** `agent-ui.js:1856` is `currentGameId() { return location.hash.replace("#", "") }`, and
`switchToGame` falls back to `location.hash = gid`. **Phase 0 must use hash-based routing**
(`createHashRouter`) — a path router makes `currentGameId()` return `""` forever and the run loop
never recognizes a table. Revisit only in Phase 2, and only with a compatibility layer.

---

## 7. The shim — write and test this before any game component

This is the single highest-risk item in the whole migration. The handoff's version is **incomplete**;
use this specification instead.

**Why the naive write fails:** React installs a value *tracker* that overrides the `value` property
on the element instance. A plain `el.value = x` goes through that tracker, so when the synthetic
event fires React compares tracked-vs-current, sees no delta, and **discards the change**. Nothing
throws. The agent's telemetry looks perfect and the numbers are wrong.

`platform/dom/setNativeValue.ts` must handle **three** element types, not one:

| Element | Prototype whose setter to call | Event to dispatch |
|---|---|---|
| `<input>` (incl. `type="range"`) | `HTMLInputElement.prototype` | `input`, bubbles |
| `<textarea>` | `HTMLTextAreaElement.prototype` | `input`, bubbles |
| **`<select>`** | **`HTMLSelectElement.prototype`** | **`change`, bubbles** |

The three real call sites in `js/agent/agent-ui.js`:

| Line | Code | Element | Handoff covers it? |
|---|---|---|---|
| 296 | `if (input) input.value = v` in `applyBet()` | `#betInput` — `<input type="number">` | yes |
| 650 | `slider.value = target` (then dispatches `input`) | `#slider` — `<input type="range">` | **no — looks safe, is not** |
| 678 | `$("#mineSelect").value = String(mineCount)` | `#mineSelect` — `<select>` | **no — not mentioned at all** |

### Measured against React 19.2 — `web/tests/shim.spec.ts`, 8/8 green

The three call sites all break, but **not all for the same reason**, and one of them
is not the reason predicted above:

| Call site | Naive behaviour | Mechanism |
|---|---|---|
| `#betInput` — raw write + `input` | **swallowed** | value tracker |
| `#slider` — raw write + `input` | **swallowed** | value tracker |
| `#mineSelect` — raw write, *no event* | **never reaches React** | no event dispatched |

React installs its value tracker on `input`/`textarea` **only**. A `<select>` therefore
has nothing swallowing its event: a raw write *plus* a `change` event does reach React
state (pinned by a test so nobody "simplifies" the shim's select branch to match the
input branch). What actually breaks Mines is that `agent-ui.js:678` dispatches no event
at all — so the agent's chosen mine count silently stays at the default either way.

The fix is unchanged: route every agent-driven write through `setNativeValue`, and
prefer uncontrolled fields.

**Chosen strategy — do both, in this order:**

1. **Make every agent-writable field uncontrolled** (`defaultValue` + `ref`, push to Zustand on
   `change`). This sidesteps the tracker entirely and is the handoff's stated preference. Apply it in
   `BetField.tsx`, the Dice slider, and `#mineSelect`. **Decide once, apply everywhere, document it**
   at the top of `BetField.tsx`.
2. **Ship the shim anyway** and have the bridge patch `applyBet` to use it. Uncontrolled inputs are a
   convention that a future contributor will break without noticing; the shim is the belt to that
   pair of braces, and Phase 3's 22 games will need it.

**Unit-test the shim against a real React controlled input before writing a single game component.**
A test that only exercises an uncontrolled input proves nothing.

**Also verify in the spike (the handoff asserts these work — confirm, don't assume):**
- `.click()` on React-rendered buttons — should work, React delegates at the root container.
- `.textContent` reads still return what adapters expect: `#curMult`, `#nextMult`, `#cashVal`.
- `document.querySelectorAll("#grid .tile")` index order matches render order — Mines clicks by index.

---

## 8. Porting the three games — exact DOM obligations

Verified against the current source. State is the source of truth; **these IDs are a rendering
obligation**, and every one must be present *and computed-visible* (`display:none` passes a DOM-only
test and fails the agent).

**Dice** — `js/games/dice.js` → `DiceGame.tsx`
Adapter (`agent-ui.js:630`) requires: `#rollBtn` `#slider` (detect), `#underBtn` `#overBtn`,
`#betInput`, and `#rollBtn.disabled` toggling false when the roll settles (`waitFor`, 4 s).
Also render for parity: `#targetV` `#winChance` `#mult` `#profit` `#rollNum` `#rollMsg` `#history`
`#diceMarker` `#sliderTrack`.

**Mines** — `js/games/mines.js` → `MinesGame.tsx`
Adapter (`agent-ui.js:661`) requires: `#startBtn` `#grid` (detect), `#mineSelect`, `#betInput`,
`#grid .tile` with `.revealed` applied on reveal, `.tile.gem` for the found-gem count, `#curMult`
`#nextMult` as **text**, `#cashBtn`, and `#startBtn.disabled === true` while a round is live — the
adapter's `while` loop is gated on exactly that. Also: `#cashVal` `#gemsFound` `#minesMsg`.
`MINE_OPTIONS` is `[1,2,3,4,5,6,8,10,12,15,20,24]` — the `<select>` must offer these values.

**Holdem** — `js/games/holdem.js` → `HoldemGame.tsx`
Adapter (`agent-ui.js:1045`) requires `#hcControls` **and** `window.HoldemAPI` with all nine members:
`seated()` `handOver()` `humanTurn()` `sit()` `nextHand()` `cashOut()` `act(a)` `state()` and the
`state()` shape (`hole` `board` `pot` `toCall` `stack` `opponents` `bb` `equity` `potOdds`
`minRaiseTo` `maxRaiseTo` `legal`). Expose it from a `useEffect` in `holdemApi.ts` and **clean it up
on unmount** — a stale `window.HoldemAPI` makes `detect()` return true on the wrong route.

Every game's controls panel renders `<AgentMount />` in place of the old `.panel[1]` injection.

---

## 9. Wiring the real agent — do not port it in Phase 0

Phase 2 ports `agent-ui.js` to TypeScript. **Phase 0 loads it byte-for-byte unmodified** — that is
what makes the spike a real test. `legacyBridge.ts`:

1. Provides a `Casino` compat object backed by `walletStore`, exposing exactly what `agent-ui.js`
   calls: `getBalance` `fmt` `money` `pick` `randInt` `toast`. **Gotcha from `DEVELOPMENT_GUIDE.md`
   §1:** `const Casino = …` in a classic script is *script-lexical*, not on `window`. Assign
   `window.Casino` explicitly before the agent scripts load.
2. Injects `<script>` tags in order — `js/agent/harness.js` **then** `js/agent/agent-ui.js` — from the
   repo root, served via a Vite `publicDir` alias or a symlink into `web/public/legacy/`. Order is not
   optional: `agent-ui.js:16` news up `OllamaAgent` at module-evaluation time.
3. Passes the proxied endpoint into `OllamaAgent`.
4. Patches `applyBet` to route through `setNativeValue` (§7.2).
5. Subscribes React to the agent with `RoyalAgent.setOnUpdate(...)` → `useAgentStore`. One direction
   only: **the agent is the writer, React mirrors.** Never let React push state back into it.

`#aiStatus` must exist and stay mounted for the whole run — `setStatus()` writes to it directly.

---

## 10. Verification protocol

**Manual, in order — stop at the first failure:**
```bash
cd web && npm run dev            # → http://localhost:5173
```
1. `/#dice` loads → console: `RoyalAgent.adapters.dice.detect()` → `true`.
2. `RoyalAgent.settings.runN = 1; RoyalAgent.settings.agentic = false; RoyalAgent.play()`.
   Watch the network tab for the Ollama call, read the model's chosen `bet` and `target` out of
   `RoyalAgent.getLog()`, and confirm **both** landed. ← *this is the spike*
3. Repeat on `/#mines` (verify `#mineSelect` took the model's mine count — the `<select>` path) and
   `/#holdem` (verify `HoldemAPI.act()` fires).
4. Collapse the sidebar → `document.querySelector('[data-nav="dice"]')` still resolves and clicks.
5. `RoyalAgent.settings.agentic = true; RoyalAgent.settings.runN = 6; RoyalAgent.play()` → it roams
   all three tables and `getStats().net` matches the real balance delta.
6. `prefers-reduced-motion: reduce` → no motion, and **content is still visible** (handoff §6.2).

**Headless:**
```bash
cd web && npx playwright test
```
`dom-contract.spec.ts` asserts every §8 selector is present **and visible** (`toBeVisible()`, not
`toBeAttached()` — the "app is blank" bug passed a DOM-only suite). `agent-live.spec.ts` runs one
real Ollama round per game.

**Two harness gotchas carried over from `tools/smoke-test.html`:**
- Leave `profitTargetPct` / `stopLossPct` at `0`, or an auto-stop ends the session after one round
  and every later assertion looks like a bug.
- Assert on synchronous state **immediately** after an action. Under virtual time an awaited sleep
  can skip a whole agent session.

---

## 11. Risk register

| Risk | Signal | Mitigation |
|---|---|---|
| Controlled-input tracker eats the bet | Telemetry fine, stake is the default | §7 — shim + uncontrolled, unit-tested first |
| `<select>` written with the input setter | Mine count always the default | §7 — `HTMLSelectElement` + `change` |
| Path router breaks `currentGameId()` | Agent never detects a table | `createHashRouter` in Phase 0 |
| React Router unmounts `[data-nav]` | `switchToGame` no-ops | Sidebar always mounted; collapse is CSS-only |
| Stale `window.HoldemAPI` after unmount | `holdem.detect()` true on wrong route | Delete it in the `useEffect` cleanup |
| Ollama CORS on `:5173` | Fetch fails, run loop stops (transport = fatal) | Vite `/ollama` proxy |
| `.panel[1]` injection has no target | AI-play button vanishes | `<AgentMount />` |

---

## 12. Landing it

```bash
cd /Users/scottdunlap/Desktop/royal-casino
for f in js/*.js js/agent/*.js js/games/*.js; do node --check "$f" || echo "FAIL $f"; done
git add -A && git commit   # "Phase 0 spike: Vite+React+TS shell, 3 games, live agent verified"
git push -u origin feat/react-migration
```

The commit message records: the React 19 decision, the controlled-vs-uncontrolled decision, and the
**measured** result of exit criteria 1–5. Per the working agreement — verify before claiming; do not
report success from inference.
