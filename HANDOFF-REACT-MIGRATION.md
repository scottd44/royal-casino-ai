# Handoff — Royal Casino → React Platform Migration

**Paste everything below the line into a fresh Claude Code thread, in the repo root.**

---

## 0. Recommended model & effort

| | |
|---|---|
| **Model** | **Opus 5** — do not use a smaller model for this |
| **Thinking** | **Ultrathink / maximum** for Phases 0–2 (architecture, the shim, the agent contract). Normal-high is fine for Phases 3+ (mechanical game ports). |
| **Mode** | Start in **plan mode**. Make it produce the Phase 0 spike plan and get sign-off before it writes a single component. |
| **Session shape** | Do **not** attempt this in one session. It is 5 phases; land and push each one separately. |

Why: the migration's hard parts are not the 25 game ports — those are mechanical. The hard parts are
(a) the native-setter shim, (b) preserving a DOM contract that an autonomous LLM agent depends on,
and (c) a state architecture that has to outlive the casino. Those are judgment-heavy and expensive
to get wrong; a cheaper model will produce something that looks done and silently breaks the agent.

---

# MISSION

You are taking over **Royal Casino**, a working 25-game play-money casino with a built-in autonomous
LLM agent ("AI Lab") that plays the games by reading the live DOM and clicking real buttons.

The owner has **explicitly revoked** the previous "zero-build, vanilla JS" constraint. Your job is to
migrate it to a modern React stack and make it look like a tier-one product designed with an
unlimited budget — while keeping the AI agent fully functional.

**This is not just a casino.** The owner intends to grow it into a *mega-site hosting many AI
projects*. Architect accordingly: the casino must become **one module among many**, not the root of
the app. If your structure would make adding a second, unrelated AI product awkward, it is wrong.

---

## 1. Current state (read this before touching anything)

- **Repo**: this directory. Branch `feat/premium-ui-overhaul`, HEAD `fc3ad97`. `main` is the old
  pre-overhaul version — do not target it.
- **Runs with zero build**: `python3 serve.py` (also serves `/api/sysmon`), then `localhost:8000`.
- **Size**: ~8,700 lines JS + ~3,500 lines CSS.
  - `index.html` — shell markup
  - `css/styles.css` — the entire stylesheet, token-driven
  - `js/core.js` — `Casino` API: wallet, bet/payout, sound, rigged-odds, `fx` (GSAP/CountUp/confetti wrappers), icon registry, shared UI factories
  - `js/app.js` — router, sidebar, lobby, VIP, Live Support, AI Guide
  - `js/games/*.js` — 25 games, one IIFE each (~6,400 lines total)
  - `js/agent/harness.js` — Ollama client, `make_move` tool-calling, retry + fallback
  - `js/agent/agent-ui.js` — **1,890 lines**. The agent brain: 25 per-game DOM adapters, run loop, tilt/emotion model, bankroll logic, telemetry
  - `js/agent/agent-report.js` — session report modal
  - `js/agent/agent-lab.js` — the Lab control deck + in-game HUD
  - `js/vendor/` — GSAP 3.12.5, CountUp 2.8.0, canvas-confetti 1.9.2, Lucide 0.469.0 (all UMD)
  - `tools/smoke-test.html` — 64 headless assertions
  - `tools/fx-test.html` — 13 presentation assertions
  - `DEVELOPMENT_GUIDE.md` — **read this in full first.** Design tokens, the DOM contract, and a
    "failure modes learned the hard way" section that will save you from repeating real bugs.

**Read `DEVELOPMENT_GUIDE.md` before writing code.** It documents bugs that already shipped once.

---

## 2. THE CRITICAL CONSTRAINT — the AI agent contract

`js/agent/agent-ui.js` contains 25 **adapters**. Each has `detect()` (is this game on screen?) and
`play(ctx)` (read state → ask the model → click buttons). **The agent never imports game code. The
DOM *is* the API.**

### 2a. The silent-failure trap

```js
// agent-ui.js:292
function applyBet(requested) {
  const v = clampBet(requested);
  const input = $("#betInput");
  if (input) input.value = v;   // ← raw DOM write
  return v;
}
```

React controlled inputs **ignore** direct `.value` assignment. Without a fix, every AI bet across all
25 games silently uses stale state instead of the agent's chosen stake. Nothing throws. Telemetry
looks fine. The numbers are just wrong.

**Required shim** (write this in Phase 0, test it in Phase 0, never hand-wave it):

```js
// Drive React's own value setter, then dispatch the event React listens for.
export function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
```

Then either patch `applyBet` to use it, or — **preferred** — make every bet field an *uncontrolled*
input (`defaultValue` + `ref`), which sidesteps the whole problem. Decide once, apply everywhere,
document the decision.

**Also verify**: `.click()` on React-rendered buttons works (it does — React uses delegated listeners
at the root), and `.textContent` reads still return what the adapters expect.

### 2b. Selectors that must survive verbatim

Every one of these is load-bearing. Grep `agent-ui.js` before changing any markup.

**Element IDs** — `#betInput` `#autoInput` `#targetInput` `#slider` `#board` `#grid` `#reels`
`#rollBtn` `#spinBtn` `#startBtn` `#dealBtn` `#drawBtn` `#hitBtn` `#standBtn` `#doubleBtn`
`#cashBtn` `#cashVal` `#curMult` `#nextMult` `#maxMult` `#runMult` `#bustChance` `#ballsLive`
`#placeBetBtn` `#crashStage` `#plinkoStage` `#dropBtn` `#limboBtn` `#limboMsg` `#minesMsg`
`#mineSelect` `#diffSelect` `#higherBtn` `#hiloCard` `#hiloMsg` `#towerGrid` `#towerStart`
`#towerMsg` `#rowsClimbed` `#wheelBtn` `#wheelStage` `#chkCross` `#chkStage` `#chkStart` `#chkCash`
`#chkDiff` `#chkMsg` `#laneNum` `#hcControls` `#bacDeal` `#bacResult` `#tcpDeal` `#tcpPlay`
`#tcpPlayer` `#warDeal` `#warGo` `#warP` `#warResult` `#warWarRow` `#rdDeal` `#rdCards` `#rdActRow`
`#rdPays` `#rdResult` `#rdSpreadV` `#bsDeal` `#bsGrid` `#bsStatus` `#molGrid` `#molStart`
`#molSelect` `#molMsg` `#cfCoins` `#cfMsg` `#rpsTrack` `#rpsMsg` `#snBoard` `#snMsg` `#knBoard`
`#knMsg` `#gemGrid` `#gemSpinBtn` `#vpCards` `#vpResult` `#bjResult` `#playerScore`
`#playerCards` `#dealerCards`

**Data attributes** — `[data-nav]` (navigation), `[data-side]` (Baccarat), `[data-risk]`,
`[data-rows]` (Plinko), `[data-idx]` (Video Poker hold slots), `[data-bet]` (½/2×/Max), `[data-move]`
(RPS), `[data-compute]`, `[data-brain]`

**Compound selectors** — `#grid .tile`, `.tile.gem`, `#playerCards .card`,
`#dealerCards .card:not(.back)`, `#vpCards .vp-slot`, `#vpCards .vp-slot[data-idx="N"]`,
`#tcpPlayer .card .rank-top`, `#towerGrid .tower-row.active`, `.rank-top`

**Global objects** — `window.HoldemAPI` `window.RouletteAPI` `window.BattleshipAPI`
`window.MolesAPI` `window.SnakesAPI` `window.CoinflipAPI` `window.RPSAPI` `window.KenoAPI`

**Navigation** — `switchToGame()` does
`document.querySelector('[data-nav="dice"]').click()`. A `[data-nav]` element for **every game must
be mounted at all times**, including when the sidebar is collapsed. React Router must not unmount
them. Its fallback is `location.hash = id`, so keep hash routing working too.

**Panel structure** — `agent-lab.js` injects the "Let AI play" button into
`view.querySelectorAll(".panel")[1]`. Either keep the two-panel game layout or replace that injection
with an explicit mount point (cleaner — do that).

**`#aiStatus`** — written directly by `agent-ui.js`'s `setStatus()`. Must exist and never be
unmounted while the agent runs.

### 2c. `RoyalAgent` public surface (keep or deliberately re-design)

```
settings, adapters, play, stop, toggle, forceNewGame, stopAndReport,
generateReportNow, isRunning, currentGameId, hasAdapter, getStats, getLog,
getRounds, resetStats, clearSessionLog, exportJSON, exportCSV,
setOnUpdate, setOnReport, setModel, setBrain, setCompute, setEmotions
```

`settings` fields: `aggression delayMs model runN profitTargetPct stopLossPct agentic brain
brainTokens brainTemp compute emotions sessionMinutes breakEvery breakFor`

**Strong recommendation:** keep `agent-ui.js` and `harness.js` as **framework-agnostic modules**.
Port them to TypeScript, but do *not* rewrite them as React. They are 2,100 lines of working,
tuned logic (tilt model, bankroll escalation, fallback heuristics, per-game strategy). Let React
subscribe to them via `setOnUpdate`. Rewriting them declaratively is a large risk for zero user gain.

---

## 3. Target architecture

The casino is **module one of many**. Do not root the app at the casino.

```
src/
  app/                    shell, routing, theme, providers
    layout/               AppShell, Sidebar, TopBar, CommandPalette
    routes.tsx
  platform/               SHARED — everything a future AI project also needs
    ui/                   Button, Panel, Stat, Modal, Toast, Sheet, Tabs …
    money/                wallet store, formatting, bet primitives
    motion/               shared transitions, springs, reduced-motion
    icons/                one registry; NEVER guess an icon name (see §6)
    agent/                harness + agent-ui ported to TS, framework-agnostic
  modules/
    casino/               ← the current product, now a module
      games/              25 game components
      lobby/
      lab/                AI Lab control deck + HUD
    <future-project>/     drops in beside casino with zero shell changes
```

**Stack** (owner-approved): Vite + React 18 + TypeScript + Tailwind + Framer Motion.
Add: Zustand (state), TanStack Router **or** React Router, Radix UI primitives (a11y), `clsx` +
`tailwind-merge`. Keep `canvas-confetti`. Keep GSAP **only** where Framer Motion is weaker
(long physics-y timelines like the Wheel spin); prefer Framer Motion elsewhere. Replace CountUp with
Framer Motion's `animate`/`useMotionValue` or `react-countup`.

### State

Currently the UI *is* the state — game logic reads values back out of the DOM. Invert this:

- `useWalletStore` — balance, bet, payout, rigged-odds toggle, persistence
- `useSessionStore` — per-game streaks, history, last results
- `useAgentStore` — a thin React mirror of `RoyalAgent`, fed by `setOnUpdate`
- Each game owns local state; **only** money and cross-game telemetry are global.

The DOM contract in §2b then becomes a *rendering obligation*: state is the source of truth, and
those IDs/attributes are the public interface you must still emit.

---

## 4. Phases — land and push each one

**Phase 0 — Spike (do this before anything else).** Scaffold Vite+React+TS+Tailwind. Port the shell
and **exactly three games**: Dice (simple + `#betInput`), Mines (grid + `.tile` reads), Holdem
(`window.HoldemAPI`). Wire the real `agent-ui.js`. **Run the actual agent against all three via
Ollama.** Do not proceed until an LLM-chosen bet lands correctly through the shim. This de-risks
the entire migration in one day.

**Phase 1 — Platform.** Design system in Tailwind (tokens in §5), `platform/ui` primitives, shell,
routing, wallet store, icon registry, motion presets.

**Phase 2 — Agent.** Port `harness.ts` + `agentUi.ts` to TypeScript with types for adapters/settings/
telemetry. Rebuild the Lab control deck and HUD as React. Keep every control writing to the same
settings.

**Phase 3 — Games.** Port the remaining 22. Group by shape: card games (Blackjack, VP, Baccarat,
3-Card, War, Red Dog, Hilo) share a `<Card>`/`<Felt>`; grid games (Mines, Tower, Keno, Battleship,
Moles, Snakes) share a `<TileGrid>`; canvas games (Plinko, Crash, Wheel, Chicken) keep their canvas/
DOM renderers inside `useEffect` + `useRef`. **After each game, run its adapter's `detect()` and one
real agent round.**

**Phase 4 — Polish & the "billion-dollar" pass.** See §6.

**Phase 5 — Second module.** Prove the architecture: stub a non-casino AI project route sharing the
shell, wallet-free, using `platform/ui`. If that is awkward, the architecture failed.

---

## 5. Design system (carry these over — they are already tuned)

Deep-dark casino palette, glassmorphism, neon accents. Port to Tailwind theme tokens.

```
bg-0 #05070c   bg-1 #090d14   bg-2 #0e131d   panel #121824   panel-2 #182031
line #232d40   text #eaf0fa   muted #8792a8   faint #58627a
gold #f0c24f   gold-2 #ffdc86   gold-deep #ab7f16
green #22e59a  red #ff4d6d     blue #4d8cff    purple #a97bff
glass  rgba(255,255,255,.045)   glass-line rgba(255,255,255,.10)
glass-panel rgba(19,25,38,.62)  blur(12px) saturate(150%)
ease cubic-bezier(.22,.8,.28,1)
```

**Type:** Inter for language, **JetBrains Mono for every number** (balances, multipliers, bets,
odds, telemetry) with `tabular-nums` and a faint `text-shadow` bloom. Never put mono on prose.

**Depth:** three-layer elevation — tight contact shadow + wide ambient + inset top highlight.

**Non-obvious but important:** glass only reads if something luminous sits behind it. The current
build has a fixed aurora layer (`body::before`) plus SVG grain (`body::after`). Over a near-black
page, `backdrop-filter` blurs nothing and panels look flat. Keep that.

---

## 6. Hard-won rules — violating these reproduces shipped bugs

1. **Never animate a persistent mount container.** A stalled tween on the route container left
   inline `opacity` on it and rendered the *entire app blank*. Animate children, which unmount.
2. **Every hide-then-reveal needs a watchdog.** Entrance animations hide targets first; if the tween
   stalls (throttled rAF, background tab), content stays invisible forever. Framer Motion's
   `AnimatePresence` is safer, but verify.
3. **A stalled counter shows a *wrong number*, not a missing animation.** Snap to the true value
   after the expected duration. Never start counters inside `requestAnimationFrame`.
4. **Never `transition: all`.** Animating the sidebar width made 25 cards each run a nested layout
   animation; the toggle took ~1s and felt dead. Explicit, compositor-friendly properties only.
5. **Never make the sidebar `position: sticky`.** Any `overflow` on `html`/`body` promotes body to
   the scroll container and the sidebar scrolls away mid-page. Current shell is a full-height CSS
   grid where `.app-main` is the only scroller. **Keep that model.**
6. **One state, one writer.** Two functions mutating sidebar classes caused a desync that froze the
   toggle after ~5 clicks. Zustand makes this easy — enforce it.
7. **3D transforms:** rotate a dedicated `preserve-3d` child, never the styled box, and keep
   shadows/glows on the wrapper. A shadow on a rotating face renders as a hard slice at ~90°.
8. **Never guess an icon name.** Lucide has no snake and no rock; guessing produced a *swimmer* and
   a *coffee mug* in production. If the set lacks the mark, draw raw SVG in the icon registry.
9. **Emoji are banned from chrome.** They ignore `color`, ignore stroke weight, and differ per OS.
   Only card suits (`♠♥♦♣`) and dice pips (`⚀`–`⚅`) remain, deliberately.
10. **Play money only.** No real payments, no external network beyond local Ollama. VIP/Live Support
    are cosmetic simulations. Keep it that way.

---

## 7. Make it addictive (the owner's explicit ask)

Ethically — this is a play-money sandbox, so "addictive" means *satisfying feedback*, not dark
patterns. No loss-chasing nudges, no fake scarcity, no manipulative streak pressure.

- **Instant, tactile feedback.** Every action answers within 100ms: press-scale, haptic-feeling
  easing, sound, number roll. Latency is the enemy of feel.
- **Anticipation before resolution.** The pleasure is in the *build* — the wheel slowing, the ball
  cascading, the card turning. Never resolve instantly; ~600–1200ms of tension.
- **Escalating celebration.** Tiered by win size: subtle glow → confetti → screen-wide moment.
  Already wired to `payout()` — keep the tiering.
- **Visible progress.** Streaks, session P&L, personal bests, per-game stats. Make the AI Lab's
  telemetry a first-class feature; watching the agent play is the app's most distinctive hook.
- **Zero-friction loop.** Rebet/repeat on one key. Never make a player re-enter a stake.
- **Motion continuity.** Shared-element transitions between lobby card → game (Framer Motion
  `layoutId`). This alone reads as "expensive".
- **Sound design.** Current audio is a tiny Web Audio synth in `core.js`. Consider real samples with
  a proper mixer, still mute-persisted.

---

## 8. Testing — non-negotiable

The existing headless harness caught real bugs and **must be ported**, not dropped.

- `tools/smoke-test.html` (64 assertions) — control wiring, routing, rigged odds, a **live Ollama
  agent run**, telemetry, HUD, agentic roaming. Port to Playwright.
- `tools/fx-test.html` (13) — fonts, glass, shadow layers, aurora/grain, press depth, cascade timing.
- **Add: a DOM-contract test** that asserts every selector in §2b exists on its game's route. Run it
  in CI. This is the single highest-value test in the project.
- Assert *computed visibility*, not just DOM presence — the "app is blank" bug passed a DOM-only
  suite.

Requires Ollama running with `qwen2.5:7b` for agent tests. Under Chrome's virtual time an awaited
sleep can skip past a whole animation; drive timelines explicitly with `seek()`.

---

## 9. Definition of done

- [ ] All 25 games playable, visually equal or better than current
- [ ] Agent plays **every** game; DOM-contract test green in CI
- [ ] A real LLM-chosen bet lands correctly through the shim (verified, not assumed)
- [ ] AI Lab: start/stop, model, brainpower, GPU/CPU, tilt, telemetry, report, JSON/CSV export
- [ ] Rigged-odds toggle still swings outcomes
- [ ] Lighthouse ≥ 90 perf, no CLS on route change
- [ ] `prefers-reduced-motion` fully respected
- [ ] Keyboard accessible; visible focus everywhere
- [ ] A second, non-casino module route exists and shares the shell
- [ ] `DEVELOPMENT_GUIDE.md` rewritten for the new stack, keeping §6 above

---

## 10. Working agreement

- Branch `feat/react-migration` off `feat/premium-ui-overhaul`. **Never** force-push or rewrite
  history on the vanilla branch — it is the working fallback.
- Commit per phase with a real message. Push each phase.
- **Verify before claiming.** Screenshot or assert; do not report success from inference. Several
  bugs in this project shipped because "the DOM was correct" was mistaken for "the user can see it."
- If the owner's request conflicts with the agent contract, **say so and propose an alternative**
  rather than silently breaking the agent.
