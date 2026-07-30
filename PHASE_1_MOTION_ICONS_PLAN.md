# Phase 1 — Motion Presets & Icon Registry

Follows `PHASE_0_SPIKE_PLAN.md`. Implements the two remaining `platform/` concerns from
HANDOFF §3: `platform/motion/` and `platform/icons/`.

Authority for every rule below: HANDOFF §6 (hard-won rules 1–4, 7, 8, 9), §7 (feel),
DEVELOPMENT_GUIDE §2 (icons) and §3 (`Casino.fx` + its three failure-mode rules).

---

## 0. The law this whole phase exists to enforce

> **Motion may never sit on the critical path of state.**

`js/agent/agent-ui.js:262-270` is the reason:

```js
const settle  = () => sleep(Math.max(80, settings.delayMs));
async function waitFor(pred, timeoutMs = 8000, stepMs = 60) { ... }
```

The agent polls a predicate every **60 ms** for **4–20 s**, and every predicate reads raw DOM:
`!$("#rollBtn").disabled`, `$("#crashStage").dataset.state === "idle"`,
`$("#bjResult").textContent.length > 0`, `parseFloat($("#curMult").textContent)`.

`requestAnimationFrame` — which Framer Motion, GSAP and CountUp all drive from — is **fully
suspended in a backgrounded tab** and throttled under headless Chromium. So:

| If you do this | What the agent sees |
|---|---|
| `onAnimationComplete={() => setPhase('idle')}` | `#rollBtn` never re-enables → `waitFor` burns its full timeout → round aborted |
| Tween a `#curMult` counter | `parseFloat` reads a **mid-tween number** → cash-out at the wrong multiplier |
| `<AnimatePresence>` exit-gating a contract node | node stays mounted forever → `detect()` matches a dead screen |

### The two-track rule

- **Track A — truth.** State transitions, `disabled` flags, contract `textContent`.
  Driven **only** by `setTimeout` / event handlers. Never by rAF, never by an animation callback.
- **Track B — feel.** `opacity`, `transform`, `filter`, confetti. Framer Motion / CSS.
  Track B *observes* Track A. It never reports back into it.

Concretely, three bans:

1. **Never** call `setState` from `onAnimationComplete`, `onTransitionEnd`, `rAF`, or a tween's
   `onComplete`. Those are decoration hooks only.
2. **Never** put a count-up on a node carrying a contract id (`NUMERIC_CONTRACT_IDS`).
3. **Never** animate a persistent mount container (HANDOFF §6.1). Animate children that unmount.

---

## 1. File tree

```
web/src/platform/
  agent/
    contractIds.ts        ← already written by the orchestrator; DO NOT EDIT
  motion/
    durations.ts          tokens: seconds, ms, easings, anticipation window
    reducedMotion.ts      framework-agnostic motion policy + useMotionPolicy()
    watchdog.ts           the safety net: armWatchdog / flushAll / visibility flush
    confetti.ts           canvas-confetti wrapper — tiering + 700ms throttle
    motionStore.ts        zustand: user override, celebration tier, live counters
    presets.ts            Framer variant factories
    Reveal.tsx            single-element entrance, watchdogged
    Stagger.tsx           list cascade, capped, watchdogged
    AnimatedNumber.tsx    count-up that REFUSES to run on a contract id
    useAnticipation.ts    setTimeout-driven 600–1200ms tension window
    index.ts              barrel
  icons/
    registry.ts           name -> component. Static imports only.
    Icon.tsx              <Icon name size className strokeWidth />
    gameIcons.ts          game id -> IconName (ported from js/app.js GAMES)
    raw/RcSnake.tsx  raw/RcRock.tsx  raw/RcPaper.tsx  raw/RcScissors.tsx
    index.ts              barrel
```

---

## 2. `motion/durations.ts`

Mirrors the CSS custom properties already in `web/src/index.css:82-87` — one source of truth,
two consumers. If you change a number here, change it there.

```ts
export const MS = { tap: 90, ui: 180, panel: 320, reveal: 520 } as const
export const DUR = { tap: 0.09, ui: 0.18, panel: 0.32, reveal: 0.52 } as const

/** css/styles.css --ease, as a Framer cubic-bezier array. */
export const EASE_BRAND = [0.22, 0.8, 0.28, 1] as const
export const EASE_OUT   = [0.16, 1, 0.3, 1] as const

/** HANDOFF §7: never resolve instantly — 600-1200ms of tension. */
export const ANTICIPATION = { min: 600, max: 1200, default: 850 } as const

/**
 * Hard cap on a staggered cascade, seconds. A cascade HIDES its targets first,
 * so this is the maximum time any content may be invisible. DEVELOPMENT_GUIDE §3
 * rule 2 specifies 0.6s; js/core.js shipped 1.3s. 0.6 wins — the doc states the
 * intent and a 25-card lobby at 1.3s is visibly slow to fill.
 */
export const MAX_STAGGER_TOTAL = 0.6

/** Grace after a tween's expected end before the watchdog forces the final state. */
export const WATCHDOG_GRACE_MS = 250
```

---

## 3. `motion/reducedMotion.ts` — the policy

Three inputs collapse into one boolean. Framework-agnostic module + a React hook over
`useSyncExternalStore`, so imperative code (`confetti.ts`) and components share one answer.

```ts
export type MotionPolicy = 'full' | 'instant'

/** Non-reactive read. Safe outside React, safe during SSR. */
export function motionPolicy(): MotionPolicy
export function shouldAnimate(): boolean          // motionPolicy() === 'full'
export function subscribeMotion(cb: () => void): () => void
export function useMotionPolicy(): MotionPolicy   // useSyncExternalStore
export function setMotionOverride(v: 'full' | 'instant' | null): void
```

`instant` when **any** of:

1. `matchMedia('(prefers-reduced-motion: reduce)').matches` — the user's OS setting.
2. **`document.hidden`** — a backgrounded tab is exactly where rAF dies and exactly where the
   agent runs unattended. Don't animate what nobody is looking at. Re-check on
   `visibilitychange`; the same listener calls `flushAll()` from `watchdog.ts`.
3. `motionStore`'s explicit user override is `'instant'` (a settings toggle, and the escape
   hatch Playwright uses).

Rules:
- Listen with `addEventListener('change')`, not the deprecated `addListener`.
- Guard `typeof window === 'undefined'` and `!window.matchMedia` — the legacy `fx` did.
- **Decision: motion stays ON while the agent plays.** HANDOFF §7 calls watching the agent the
  app's most distinctive hook; degrading it would gut the feature. Safety comes from the
  two-track rule, not from disabling motion.

---

## 4. `motion/watchdog.ts` — the safety net

Port of `js/core.js:437-497`, generalised. Every hide-then-reveal arms one. Normally a no-op.

```ts
/**
 * Force `nodes` to their resting visible state after `expectedMs + grace`.
 * Returns a cancel fn. Idempotent; safe to call on unmounted nodes.
 */
export function armWatchdog(nodes: Element | Element[] | null, expectedMs: number): () => void

/** Fire every pending watchdog NOW. Called on `visibilitychange -> hidden`. */
export function flushAll(): void

/** React binding: arms on mount/dep-change, cancels on unmount. */
export function useWatchdog(ref: RefObject<Element | null>, expectedMs: number, deps?: unknown[]): void
```

Implementation notes:

- The forced state is `style.opacity = ''; style.transform = ''` — i.e. **strip the inline
  styles and let CSS decide**, exactly as `unhide()` did. Do not set `opacity: 1`; that would
  fight a legitimate later animation.
- Timers are `setTimeout` only. A backgrounded tab clamps `setTimeout` to ~1 Hz but **never
  suspends it**, which is the entire reason this works where rAF doesn't.
- Keep a module-level `Set` of pending entries so `flushAll()` can drain them.
- Expose `window.__royalMotion = { flushAll, pending: () => count }` **in dev/test builds only**
  (`import.meta.env.DEV`). `web/tests/motion.spec.ts` asserts on `pending()`.
- Self-healing check: if a stalled Framer tween resumes after we stripped styles, it animates to
  its final state, which is the state we forced. No conflict.

---

## 5. `motion/confetti.ts` — celebration

Port of `js/core.js:412-435`. Wraps the `canvas-confetti` npm package (already a dependency).

```ts
export type BurstTier = 'cashout' | 'big' | 'jackpot'
export function burst(tier?: BurstTier): void
/** Tier a win, or null if it doesn't clear the bar. Thresholds from core.js payout(). */
export function tierFor(amount: number, bankroll: number): BurstTier | null
```

- Same 700 ms throttle shared across all call sites — `payout()` and the win sound both fire for
  one win and must not double-burst.
- Same particle counts / colours / origins as `core.js`. Pass `disableForReducedMotion: true`
  **and** early-return on `!shouldAnimate()` — belt and braces.
- Thresholds, verbatim from `js/core.js:80-82`:
  `ratio >= 1.5 || amount >= 20000` → jackpot; `>= 0.4 || >= 4000` → big; `>= 0.15` → cashout.
- Wrap every call in `try {}` — confetti is cosmetic and must never throw into game logic.

---

## 6. `motion/motionStore.ts` — zustand

Small by design. Only what genuinely needs to be global.

```ts
type MotionState = {
  override: 'full' | 'instant' | null   // persisted user setting; null = follow the OS
  lastTier: BurstTier | null            // drives an optional screen-level flourish
  lastTierAt: number
  setOverride(v: 'full' | 'instant' | null): void
  celebrate(amount: number, bankroll: number): void   // tiers, bursts, records
}
```

- `persist` middleware, key `royal_casino_motion_v1`, **partialize to `override` only** —
  never rehydrate a stale celebration.
- `setOverride` also calls `setMotionOverride()` in `reducedMotion.ts` so the imperative path
  agrees with the store. One state, one writer (HANDOFF §6.6).
- **Wire `walletStore.payout` → `celebrate`.** In `js/core.js` the burst lives inside `payout()`,
  which is why all 25 games celebrate without a single game module being edited. Keep that
  property: compute the bankroll ratio from the balance *before* the credit.

---

## 7. `motion/presets.ts` — Framer variants

Every export is a **factory returning `Variants`**, and every factory collapses to a zero-duration
transition when `!shouldAnimate()`. Callers never branch on reduced motion themselves.

| Preset | Shape | Used by |
|---|---|---|
| `fadeUp({ y = 10, dur = DUR.panel })` | opacity 0→1, y→0 | panels, game mounts |
| `fadeIn({ dur = DUR.ui })` | opacity only | overlays, messages |
| `scaleIn({ from = 0.96 })` | opacity + scale | modals, result cards |
| `cascade(count, { stagger = 0.035 })` | parent `staggerChildren`, capped by `MAX_STAGGER_TOTAL / count` | lobby grid, stat rows |
| `flipFace({ dur = DUR.panel })` | `rotateY` 180 on a **`preserve-3d` child only** | cards, coin |
| `pulseGlow(color)` | `boxShadow` keyframes, 2 cycles, never infinite | win highlight |

Rules:
- **`transition: all` is banned** (HANDOFF §6.4). Name every property.
- `flipFace` gets a comment restating HANDOFF §6.7: rotate a dedicated `preserve-3d` child, keep
  the shadow/glow on the wrapper, back face pre-rotated 180° with `backface-visibility: hidden`.
  A shadow on a rotating face renders as a hard slice at ~90°.
- No `repeat: Infinity` anywhere. An infinite tween can never be watchdogged.

---

## 8. `motion/Reveal.tsx`, `Stagger.tsx`

```tsx
<Reveal preset="fadeUp" delay={0} as="div" className="...">{children}</Reveal>
<Stagger className="grid ...">{items.map(...)}</Stagger>   // children get the item variant
```

- Both render a **real element they own**, and both are documented as *never* to be placed on a
  persistent mount container. `Stagger` computes its cap from `Children.count`.
- Both call `useWatchdog(ref, expectedMs)` where `expectedMs = (delay + duration + stagger*n) * 1000`.
- Under `instant` policy they render a plain element with **no** Framer wrapper at all — not a
  zero-duration animation. Fewer moving parts is the point.
- `Stagger` sets the watchdog on the container **and** its children (a stalled child keeps
  `opacity: 0` even if the parent finished).

---

## 9. `motion/AnimatedNumber.tsx` — the dangerous one

This is where the contract dies if we get it wrong. The Phase-0 discovery, restated:

> Contract-id numbers **must never tween**. `agent-ui.js` `parseFloat`s raw `textContent` at
> arbitrary times; a mid-tween read is a wrong number, not a missing animation.

```tsx
<AnimatedNumber value={balance} format={fmt} />          // fine — no id
<AnimatedNumber value={mult} id="curMult" />             // MUST render instantly
```

Required behaviour:

1. On mount, and on every `id` change, check `isNumericContractId(id)` from
   `@/platform/agent/contractIds`. If true → **never animate**; write `format(value)` directly on
   every change, and in DEV `console.warn` once naming the id.
2. Otherwise animate with Framer's `animate()` from `motion`, `onUpdate` writing
   `node.textContent = format(v)`.
3. **Token + snap watchdog, ported verbatim in spirit from `js/core.js:374-410`:** stamp the
   element with an incrementing token; `setTimeout(duration + 350ms)` → if the token is still
   ours and the text isn't the target, **stop the animation and write the true value**. A stalled
   counter shows a *wrong number* (HANDOFF §6.3). This is a correctness guarantee, not polish.
4. Skip the animation when `|to - from| < 1` or `> 5_000_000`, or when `!shouldAnimate()`.
5. Duration curve from core.js: `min(1.1, 0.28 + log10(diff+1) * 0.22)` seconds.
6. **Never start the counter inside `requestAnimationFrame`** (DEVELOPMENT_GUIDE §3 rule 4).

---

## 10. `motion/useAnticipation.ts`

HANDOFF §7: "Never resolve instantly — ~600–1200ms of tension." That tension window is a state
machine, so it is Track A: **`setTimeout`, not rAF.**

```ts
const { phase, begin, resolveNow } = useAnticipation({ ms: ANTICIPATION.default })
// phase: 'idle' | 'building' | 'resolved'
```

- `begin(payload)` arms a `setTimeout`; on fire it transitions to `resolved` and invokes the
  callback with the payload. The **outcome is computed up front**, before the delay — the delay
  is theatre over a decided result, never a dependency of it.
- `resolveNow()` cancels the timer and resolves immediately. Wired to a click so an impatient
  player (or a fast agent) can skip the animation.
- Under `instant` policy the window collapses to `0 ms` — but still goes through a real timer tick
  so the `disabled → enabled` edge the agent's `waitFor` polls for actually happens.
- Cleanup clears the timer on unmount. A resolved-after-unmount callback is a stale-state bug.

---

## 11. `platform/icons/` — one registry, never a guess

HANDOFF §6.8 / DEVELOPMENT_GUIDE §2. Guessing produced a **swimmer** for `snake` and a **coffee
mug** for `rock`, and both shipped.

```ts
// registry.ts — STATIC imports. A typo is a TypeScript error, not a wrong picture.
import { Dices, Bomb, Spade, Crown, /* … */ } from 'lucide-react'
import { RcSnake, RcRock, RcPaper, RcScissors } from './raw'

export const ICONS = {
  dices: Dices, bomb: Bomb, spade: Spade, crown: Crown,
  'rc:snake': RcSnake, 'rc:rock': RcRock, /* … */
} as const
export type IconName = keyof typeof ICONS
```

- **No dynamic lookup, no string→component map built at runtime.** The whole defence is that
  `<Icon name="snek" />` fails to compile. This replaces the legacy UMD build + `MutationObserver`
  entirely (`PHASE_0_SPIKE_PLAN.md:91`).
- `raw/*.tsx`: the four `rc:` marks ported **verbatim** from `RAW_SVG` in `js/core.js:170-186` —
  same paths, `fill="none"`, `stroke="currentColor"`, `strokeWidth={2}`, `aria-hidden`. Any mark
  Lucide lacks gets drawn here; nothing gets approximated.
- `Icon.tsx` keeps the legacy `.ico` class for stylesheet parity, defaults `size={16}`,
  `strokeWidth={2}`, `absoluteStrokeWidth` so scaling doesn't thin the line, and inherits
  `currentColor` — an icon must behave like text as far as the design system is concerned.
  `aria-hidden` by default; an optional `title` makes it labelled instead.
- `gameIcons.ts` ports the `icon:` field of every entry in `js/app.js` `GAMES` (all 25, so
  Phase 3 has nothing to look up) plus the three section icons. `modules/casino/games/registry.ts`
  gains `icon: IconName` so sidebar, lobby card and page title cannot drift apart.
- **Emoji stay banned in chrome** (HANDOFF §6.9). Allowed only: card suits `♠♥♦♣`, dice pips `⚀–⚅`.

---

## 12. Verification

```bash
cd web && npx tsc -b --noEmit && npm run lint
npx playwright test tests/dom-contract.spec.ts tests/motion.spec.ts tests/icons.spec.ts
```

New tests to land with this phase:

1. **`motion.spec.ts` — the rAF-kill test.** The centrepiece.
   `page.addInitScript(() => { window.requestAnimationFrame = () => 0 })`, then play a full round
   of Dice and Mines. Assert `#rollBtn` re-enables, contract text updates, and every contract node
   holds its final value. This is a direct executable test of the two-track rule, and it fails
   loudly the day someone gates state on `onAnimationComplete`.
2. **Reduced-motion pass.** Playwright context `reducedMotion: 'reduce'` → same round, same
   assertions, plus `window.__royalMotion.pending() === 0` when idle.
3. **No mid-tween contract read.** Poll `#curMult` (Mines) every 30 ms through a round; every
   sampled value must be a value the game actually held, never an interpolation artefact.
4. **`icons.spec.ts` — emoji audit.** Port of the legacy audit: render every route, fail on any
   emoji in the app shell outside the `♠♥♦♣ ⚀-⚅` allowlist. Plus: every `IconName` resolves to a
   defined component (catches a Lucide rename on upgrade).

## 13. Out of scope

Modal / Toast / Sheet / Tabs (still deferred to Phase 2 — no real call sites yet), sound design,
`layoutId` lobby→game shared-element transitions (needs the Phase 2 router work), GSAP (not
installed; Framer Motion covers everything here).
