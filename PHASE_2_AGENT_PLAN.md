# Phase 2 — Agent

Follows `PHASE_1_MOTION_ICONS_PLAN.md`. Implements HANDOFF §4 Phase 2: port `harness.js` +
`agent-ui.js` to TypeScript, rebuild the Lab control deck + HUD as React, "keep every control
writing to the same settings."

Source of truth for what must not change: HANDOFF §2b (selectors), §2c (`RoyalAgent` public
surface — already typed in `platform/agent/types.ts` and it matches the legacy return object
field-for-field, confirmed by reading `js/agent/agent-ui.js:1864-1886`).

---

## 0. Scope and the one rule that bounds risk

`js/agent/agent-ui.js` is 1890 lines with **25 game adapters**, of which **3 have a live DOM
today** (dice, mines, holdem — the rest are Phase 3). This phase does **not** rewrite any game
logic, any adapter's strategy, or any prompt text. It is a **mechanical TypeScript port**:

- Same functions, same order, same behavior, same `localStorage` key (`royal_casino_session_log_v1`
  — existing users' persisted logs must still load).
- The only substantive changes are the ones that were previously worked around because the code
  ran as a classic `<script>` tag and now doesn't have to:
  1. `Casino.fmt/money/pick/randInt/getBalance/payout/toast` → real ES imports from
     `@/platform/money/format`, `@/platform/money/walletStore`, and a new `@/platform/ui/toast`
     (§4 below), instead of reaching through `window.Casino`.
  2. `OllamaAgent`'s endpoint is passed through its own constructor `opts.endpoint`, instead of
     the classic-script prototype-patch in `legacyBridge.ts:patchEndpointInline` — that hack
     existed only because `harness.js` couldn't see an ES module's `import.meta.env`. A real
     module doesn't need it. **Retire `legacyBridge.ts` and its script-injection path** (§1) once
     this lands — its whole job (get `window.Casino` up before the scripts run, preserve load
     order, patch the endpoint after the fact) evaporates when the agent is just imported.
  3. `window.RoyalAgent = RoyalAgent` at module end → the singleton is still assigned to
     `window.RoyalAgent` in **DEV only** (parity with `platform/motion/watchdog.ts`'s
     `window.__royalMotion` — a genuinely useful console/debugging handle on "watch the agent
     play," costs nothing, never ships to prod). Production code reaches the agent through
     `useAgentStore`, not the global.

**None of the Lab UI's own element ids are part of the agent's DOM contract.** Grepped and
confirmed: `#aggr #speed #brainSlider #emotions #modelSelect #runN #profit #loss #sessionMin
#breakEvery #breakFor #agentic #aiLabResizer #aiLabHandle #hudGame #hudLat #hudTool #hudNet
#hudRun #hudNew #hudDeck` etc. never appear in `agent-ui.js`'s own selector list (§2b) — nothing
external reads them. The React rebuild in §5 has a free hand on structure/ids/classnames there.
The **one** Lab-adjacent id that *is* contract is `#aiStatus`, and it's already a static node in
`AppShell.tsx:71` with a comment explaining why — no change needed, just keep `setStatus()`
writing to it exactly as before (raw `document.getElementById`, Track A, never React state).

---

## 1. File tree

```
web/src/platform/agent/
  harness.ts          NEW — ported OllamaAgent class, typed, zero DOM/window references
  agentUi.ts           NEW — ported RoyalAgent factory + all 25 adapters, typed
  types.ts             EDIT — add GameAdapter, PlayContext (both below); RoyalAgent stays as-is,
                        it already matches
  contractIds.ts        unchanged
  useAgent.ts           EDIT — import agentUi.ts directly, drop the async script-load boot
  legacyBridge.ts        DELETE once nothing imports it (grep first — see §1a)

web/src/platform/ui/
  Modal.tsx             NEW — the deferred primitive from Phase 1, real call site now (LabReportModal)
  toast/
    toastStore.ts        NEW — zustand, imperative toast() + React-facing state
    Toast.tsx             NEW — one toast, AnimatePresence-safe (see §4 on why this is allowed to unmount)
    ToastHost.tsx          NEW — the fixed-position stack, mounted once in AppShell
    index.ts

web/src/modules/casino/lab/
  labUiStore.ts          NEW — zustand: drawer open/collapsed/height, HUD dismissed. UI-only —
                          nothing RoyalAgent itself owns lives here (one state, one writer: the
                          agent's own settings/stats stay owned by agentUi.ts).
  LabDrawer.tsx           NEW — the control deck (§5)
  LabHud.tsx              NEW — floating mini status (§5)
  LabStats.tsx            NEW — stat tile grid
  LabTiltMeter.tsx        NEW — tilt gauge
  LabChart.tsx            NEW — canvas net-over-time chart
  LabLog.tsx              NEW — event log list
  LabReportModal.tsx      NEW — port of agent-report.js, inside platform/ui/Modal
  index.ts

web/src/modules/casino/components/AgentMount.tsx   EDIT — render the real "Let AI play" control
web/src/app/AppShell.tsx                             EDIT — mount LabDrawer/LabHud/ToastHost,
                                                      apply drawer clearance to .app-main
```

---

## 1a. Before deleting `legacyBridge.ts`

`grep -rn "legacyBridge" web/src` first. If `ShimTestPage.tsx` (`web/src/dev/`) or anything else
still imports `bootLegacyAgent`/`makeCasinoCompat`, either update those call sites to the new
module or leave the file in place with a comment explaining it's dev-only scaffolding — don't
delete something still wired to a working dev page without checking.

---

## 2. `platform/agent/harness.ts`

Straight port of `js/agent/harness.js`'s `OllamaAgent` class (257 lines, zero DOM/window
references already — this is the easy half). Preserve:

- Constructor options and defaults exactly (`model="qwen2.5:7b"`, `temperature=0.4`,
  `numPredict=null`, `numGpu=null`, `timeoutMs=30000`, `onLog`).
- `decideMove({...})`'s full signature, retry logic, and the tool-call JSON schema sent to Ollama
  — this is tuned prompt engineering, not something to "clean up" while porting.
- `abort()`, and whatever internal fetch/AbortController plumbing exists.

Type the public surface (constructor opts, `decideMove` args/return) with real interfaces; leave
`gameState`/`extraArgs` as `Record<string, unknown>` — they're intentionally free-form per game
and inventing a closed shape for them here would be exactly the premature abstraction the plan
elsewhere warns against. Export the class as a named export, no default export, no side effects
at module scope (unlike the original, which relied on being a classic script global — here
`agentUi.ts` does `new OllamaAgent(...)`, not the module itself).

---

## 3. `platform/agent/agentUi.ts`

Port of `js/agent/agent-ui.js`'s `RoyalAgent` IIFE (1890 lines). Structure:

```ts
export function createRoyalAgent(): RoyalAgent { /* the whole ported IIFE body */ }
export const royalAgent: RoyalAgent = createRoyalAgent()   // matches legacy's module-eval-time
                                                             // singleton construction
if (import.meta.env.DEV) window.__royalAgentDebug = royalAgent   // see §0.3
```

`createRoyalAgent` exists (rather than only the bare singleton) so a test can construct an
isolated instance without fighting shared module state — the app itself only ever imports
`royalAgent`.

**Preserve, unchanged:**
- The full `GAMBLER_PERSONA` string and `IMPROV` array verbatim — this is tuned prompt content,
  not code to refactor.
- `settings` object shape and every default value (§2b/§2c — this is `AgentSettings`, already
  typed in `types.ts` and it matches).
- All 25 adapters, in file order, `detect()`/`play(ctx)` bodies untouched except for the
  Casino-import substitution in §0.3.1 and typing `ctx: PlayContext` /
  `mines: { type: 'integer', ... }` -style JSON-schema literals (these can stay loosely typed —
  they're data passed to Ollama, not consumed by TypeScript).
- `$` stays `const $ = (sel: string) => document.querySelector(sel)` — do not swap in
  `querySelector<HTMLElement>` generics per call site; that's 200+ call-site edits for no
  behavioral gain and meaningfully raises transcription-error risk in this pass.
- `sleep`/`pace`/`settle`/`waitFor` (§0 of the Phase 1 plan — this is literally the function the
  whole two-track motion rule was designed around). Do not "improve" the polling loop.
- `setStatus()` — raw `document.getElementById("aiStatus").textContent = msg`. Do not wrap this
  in React state; it's written from outside React's render cycle by design.
- `LOG_KEY` and the `localStorage` read/write in `loadLog`/`saveLog`, verbatim.
- The `hashchange` listener that stops a non-agentic run when the user navigates away.
- The public API object at the end — it already matches `types.ts`'s `RoyalAgent`, so this is a
  direct typing exercise, not a redesign.

**Add types for, in `types.ts`:**

```ts
export type PlayContext = {
  shouldStop: () => boolean
  setStatus: (msg: string) => void
}

export type GameAdapter = {
  detect: () => boolean
  play: (ctx: PlayContext) => Promise<void>
}
```

Change `RoyalAgent['adapters']` from `Record<string, { detect; play }>` to
`Record<string, GameAdapter>` — same shape, now named.

---

## 4. `platform/ui/toast/` — the real Toast primitive

DEVELOPMENT_GUIDE/HANDOFF deferred Toast in Phase 1 pending a real call site. `agent-ui.ts`'s
~15 `Casino.toast(...)` calls (desperate-measures financing, session events) are that call site.

- `toastStore.ts`: zustand, `{ toasts: { id, msg, type }[] }` + `push`/`dismiss` actions, and a
  **non-reactive `toast(msg, type = 'info')` export** for use outside React — same pattern as
  `wallet`/`motion` at the bottom of `walletStore.ts`/`motionStore.ts`. `agentUi.ts` imports this
  function directly; it never touches React.
- `ToastType = 'info' | 'win' | 'lose'` (matches the three cases the legacy Phase-0
  `legacyBridge.ts:renderToast` already branched on).
- `Toast.tsx`: one toast card, styled per the legacy inline styles in
  `legacyBridge.ts:renderToast` (glass panel, colored by type). Auto-dismiss after ~3.6s
  (`setTimeout`, matching legacy — this is a UI nicety, not agent-contract, so a plain timer is
  fine here; it doesn't gate any state the agent polls).
- `ToastHost.tsx`: fixed-position stack (`bottom-right`, matches legacy `#toastHost`/
  `#toastWrap` positioning), wrapped in Framer Motion `AnimatePresence`. **This is a legitimate
  use of exit animations** — unlike a persistent mount container (HANDOFF §6.1), each toast is a
  genuinely ephemeral node that mounts and unmounts once, so `AnimatePresence` un-mounting it on
  exit is exactly the case Reveal/Stagger's doc comments say to reserve it for. Use
  `@/platform/motion`'s `fadeUp`/`scaleIn` presets rather than hand-rolled variants.
- Mount **one** `<ToastHost />` in `AppShell.tsx`, outside `.app-main` (fixed positioning, must
  survive route changes — same reasoning as `#aiStatus`).

`Modal.tsx`: the other deferred primitive. Standard composable `Modal`/`ModalHeader`/`ModalBody`
built on the `glass`/`glass-panel` tokens already in `index.css`, closes on backdrop click and
Escape, focus-trapped. `LabReportModal` in §5 is its first real call site — keep the component
itself generic (no report-specific markup baked in).

---

## 5. `modules/casino/lab/` — the control deck + HUD, in React

Legacy reference: `js/agent/agent-lab.js` (854 lines) + `js/agent/agent-report.js` (216 lines).
**None of this module's own element ids are contract** (§0) — full freedom on structure. What
*is* fixed: it must read/write the **same** `royalAgent.settings` object `agentUi.ts` owns (one
state, one writer — HANDOFF §6.6) and the **same** `royalAgent` stats/log via `useAgentStore`
(already exists, pull-only per its own doc comment — don't change that direction).

### Control inventory (verbatim from `js/agent/agent-lab.js`, ids are new/free)

| Control | Legacy id | Writes |
|---|---|---|
| Aggression slider (0-100) | `#aggr` | `royalAgent.settings.aggression = v/100` |
| Speed/delay slider (0-1500ms) | `#speed` | `royalAgent.settings.delayMs` |
| Brainpower dial (0-100 → tokens+temp) | `#brainSlider` | `royalAgent.setBrain(tokens, temp, label)` — exponential mapping, port `applyBrain`'s curve verbatim |
| Emotions toggle | `#emotions` | `royalAgent.setEmotions(bool)` |
| Model select (populated from Ollama's `/api/tags`) | `#modelSelect` | `royalAgent.setModel(name)` |
| Compute (gpu/cpu segmented control) | `#computeSeg` | `royalAgent.setCompute(mode)` — **locked while running**, same as legacy |
| Run N (0 = ∞) | `#runN` | `royalAgent.settings.runN` |
| Profit target % | `#profit` | `royalAgent.settings.profitTargetPct` |
| Stop-loss % | `#loss` | `royalAgent.settings.stopLossPct` |
| Session timer (min) | `#sessionMin` | `royalAgent.settings.sessionMinutes` |
| Break every (min) | `#breakEvery` | `royalAgent.settings.breakEvery` |
| Break length (min) | `#breakFor` | `royalAgent.settings.breakFor` |
| Agentic toggle | `#agentic` | `royalAgent.settings.agentic` |
| Start/Stop | — | `royalAgent.toggle()` |
| New Game | — | `royalAgent.forceNewGame()` |
| Stop & Report | — | `royalAgent.stopAndReport()` |

`royalAgent.settings` is a **plain mutable object, not reactive** — exactly like legacy. Sliders
write straight into it and call `royalAgent.play()`'s next tick picks it up; they do not need
`useAgentStore` re-renders to take effect (the agent reads its own settings object live). Local
`useState` for each control's own displayed value is fine and expected — just make sure the
`onChange`/`onInput` handler writes through to `royalAgent.settings.x` on every event, not on
blur/submit, matching the legacy `input` listeners.

### Components

- **`LabDrawer.tsx`** — bottom sheet, `position: fixed`, resizable height via pointer drag
  (`pointermove`/`pointerup` on a resizer handle, port verbatim from
  `js/agent/agent-lab.js:363-377`), collapse/expand via `labUiStore`. Houses the control table
  above plus the Start/Stop/New/Report buttons.
  **Drawer clearance, ported from `agent-lab.js:175-180`:** legacy already targets `.app-main`
  for `paddingBottom` (`"Clearance belongs to the scrolling pane; body no longer scrolls"` — its
  own comment, meaning the React shell's `.app-main`-is-the-only-scroller model is not new here,
  legacy already assumed it). Store the drawer's current height in `labUiStore` (set on
  drag-end and on collapse/expand, not on every drag `pointermove` frame — avoid a render storm),
  and have `AppShell.tsx` read `labUiStore`'s height to set `.app-main`'s inline
  `paddingBottom`. **One state, one writer**: `labUiStore` owns the number, `AppShell` only reads it.
- **`LabHud.tsx`** — floating mini-status shown while the drawer is collapsed/closed
  (`positionHud`/`syncHudVisibility` from `agent-lab.js:440-452` — hide it if the viewport is too
  short to fit both). Shows current game, latency, tool-call success, net, plus Stop/New/Deck
  buttons (`hudRun`/`hudNew`/`hudDeck` — "Deck" opens `LabDrawer`).
- **`LabStats.tsx`** — stat tile grid using `platform/ui/Stat` + `platform/motion/AnimatedNumber`.
  **None of these values are agent-contract ids** (net/ROI/win-rate/etc. are Lab telemetry, not
  in `NUMERIC_CONTRACT_IDS` — confirmed against `contractIds.ts`), so ticking them with
  `AnimatedNumber` is safe and is exactly the kind of node that primitive exists for.
- **`LabTiltMeter.tsx`** — port `renderTilt`'s 0-100 gauge + emoji/label mapping
  (`tiltState()`/`riskLabel()` in `agent-ui.ts`).
- **`LabChart.tsx`** — canvas net-over-time line, ported from `renderChart()`
  (`agent-lab.js:577-679`). Canvas imperative drawing lives inside `useEffect` + `useRef`,
  redrawing on new rounds — same pattern the target architecture already prescribes for canvas
  games in Phase 3. Not a Framer Motion concern; it's a plain canvas repaint, not a tween, so
  none of the watchdog/motion-policy machinery applies here.
- **`LabLog.tsx`** — scrolling list from `royalAgent.getLog()`, virtualization not required at
  this list length (matches legacy's plain DOM list).
- **`LabReportModal.tsx`** — port of `agent-report.js` inside `platform/ui/Modal`. Opens via
  `royalAgent.setOnReport(...)` (already wired for by the existing `RoyalAgent` type — a callback
  slot, not a new mechanism). Includes its own canvas PNL chart (`rChart`) — same treatment as
  `LabChart.tsx`.
- **`labUiStore.ts`** — `{ drawerOpen, drawerCollapsed, drawerHeight, hudDismissed }` +
  setters. This is genuinely React-owned UI state with no legacy-agent equivalent to preserve
  (legacy tracked the same things as DOM classes/inline styles); a small zustand store is the
  natural home, not `useAgentStore` (which stays a pure read mirror of `RoyalAgent` per its own
  file-level comment — don't blur that boundary).

### `AgentMount.tsx` (edit, not new)

Currently an empty placeholder div (Phase 0/1). Render the actual "Let AI play" control here:
a compact button that opens `LabDrawer` (via `labUiStore`) scoped to the current table — it does
not need a game id prop; `royalAgent.currentGameId()` already reads `location.hash`.

### Wiring into `AppShell.tsx`

Add `<LabDrawer />`, `<LabHud />`, `<ToastHost />` as fixed-position siblings of `<main>`, outside
`.app-main`'s scroll region — same reasoning as `#aiStatus`: these must persist across route
changes, never be part of a route's mount/unmount cycle. Read `labUiStore`'s `drawerHeight` /
`drawerCollapsed` to set `.app-main`'s `paddingBottom` inline style, per §5 clearance note.

---

## 6. `useAgent.ts` — simplify now that the port is real

```ts
import { royalAgent } from './agentUi'

export const useAgentStore = create<AgentUiState>((set) => {
  royalAgent.setOnUpdate(() => set({ stats: royalAgent.getStats() }))
  return { agent: royalAgent, ready: true, stats: royalAgent.getStats(), error: null }
})
```

No more `boot()`/async script loading — the module import itself is the boot. Check
`AppShell.tsx`'s `useEffect(() => { void boot() }, [boot])` call site and update it (likely
deletable entirely once `ready` starts `true`). `bootLegacyAgent`'s three "has to get right"
concerns from `legacyBridge.ts`'s own doc comment (`window.Casino` timing, script load order, the
endpoint patch) all evaporate — a real ES module doesn't have any of those problems. Worth a
one-line comment noting why the file got so much simpler, for whoever reads this next.

---

## 7. Verification

```bash
cd web && npx tsc -b --noEmit && npx oxlint src/
npx playwright test tests/dom-contract.spec.ts tests/shim.spec.ts tests/motion.spec.ts tests/icons.spec.ts
```

**Must still pass unchanged:** every existing spec, especially `dom-contract.spec.ts`'s
`#aiStatus` and `#agentMount` assertions — those are the two points of contact between this
phase's new Lab UI and the pre-existing contract.

New, this phase:
- **`agent-live.spec.ts` already exists** (Phase 0) and drives a real Ollama round through the
  vanilla-script bridge. Once `agentUi.ts` replaces that bridge, re-run it against the *ported*
  module — this is the definitive proof the TS port didn't change agent behavior. Needs Ollama
  running locally; not part of the default fast suite.
- A settings round-trip test: move `#aggr` (or its React equivalent — grab the slider by
  `role=slider`/label, not a legacy id, since none of these are contract), assert
  `royalAgent.settings.aggression` changed via `page.evaluate(() => window.__royalAgentDebug
  .settings.aggression)` (the DEV-only debug handle from §0.3/§3).
- `#aiStatus` still updates during a live round (unchanged assertion, new code path).

## 8. Out of scope

The remaining 22 game adapters get their DOM the moment each game is ported in Phase 3 — nothing
here changes their code, so nothing here needs to re-verify them individually. Sound design,
`layoutId` lobby→game shared-element transitions, and GSAP remain out of scope per Phase 1 §13.
