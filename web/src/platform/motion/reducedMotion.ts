import { useSyncExternalStore } from 'react'
import { flushAll } from './watchdog'

/* ============================================================
   The motion policy — one boolean, three inputs, one writer.

   PHASE_1_MOTION_ICONS_PLAN.md §3: framework-agnostic module + a React
   hook over useSyncExternalStore, so imperative code (confetti.ts) and
   components read the exact same answer. Nothing else in platform/motion
   is allowed to re-derive this decision.

   `instant` when ANY of:
     1. matchMedia('(prefers-reduced-motion: reduce)').matches — the OS setting.
     2. document.hidden — a backgrounded tab is exactly where rAF dies and
        exactly where the AI Lab agent runs unattended (§0). Don't animate
        what nobody is looking at.
     3. The explicit user override (wired from motion/motionStore.ts) is
        'instant' — a settings toggle, and the escape hatch Playwright's
        `reducedMotion: 'reduce'` context / manual overrides use.

   Decision, restated from the plan: motion stays ON while the AI Lab agent
   plays. HANDOFF §7 calls watching the agent the app's most distinctive
   hook; degrading it would gut the feature. Safety comes from the
   two-track rule (Track A truth via setTimeout, Track B feel via rAF/CSS)
   and the watchdog in watchdog.ts, not from disabling motion outright.
   ============================================================ */

export type MotionPolicy = 'full' | 'instant'

/** The explicit user override. `null` means "follow the OS setting." */
let override: 'full' | 'instant' | null = null

type Listener = () => void
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

/** Non-reactive read. Safe outside React, safe during SSR. */
export function motionPolicy(): MotionPolicy {
  if (override === 'instant') return 'instant'

  // No `window` (SSR / a non-DOM test runner): nothing to read, and nothing
  // is on screen to animate either way. Default to 'full' — the browser
  // re-evaluates on hydrate/mount, same as legacy `fx.reduced()` guarded
  // against a missing `window.matchMedia`.
  if (typeof window === 'undefined') return 'full'

  // §0: a backgrounded tab is where rAF is fully suspended and where the
  // agent plays unattended. Counts as instant regardless of OS preference.
  if (document.hidden) return 'instant'

  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'instant'
  }

  return 'full'
}

/** `motionPolicy() === 'full'` — the boolean callers actually branch on. */
export function shouldAnimate(): boolean {
  return motionPolicy() === 'full'
}

/** Subscribe to policy changes (OS setting flips, tab visibility, override). */
export function subscribeMotion(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React binding over the same source imperative code reads. */
export function useMotionPolicy(): MotionPolicy {
  return useSyncExternalStore(subscribeMotion, motionPolicy, () => 'full')
}

/**
 * Set (or clear, with `null`) the explicit user override. Called from
 * motion/motionStore.ts's `setOverride` so the imperative path here and
 * the persisted zustand state agree — one state, one writer (HANDOFF §6.6).
 */
export function setMotionOverride(v: 'full' | 'instant' | null): void {
  override = v
  notify()
}

/* ------------------------------------------------------------
   Wire the two reactive inputs once, at module load.

   Rule from the plan: listen with addEventListener('change'), never the
   deprecated MediaQueryList.addListener. Guarded the same way
   motionPolicy() is: no window, no matchMedia, no listener.
   ------------------------------------------------------------ */
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    mq.addEventListener('change', notify)
  }

  // The same listener that re-checks the policy also flushes the watchdog
  // when the tab goes into the background — the exact moment rAF-driven
  // tweens stop making progress, so any pending entrance should snap to
  // its resting state immediately rather than wait out its own timer.
  document.addEventListener('visibilitychange', () => {
    notify()
    if (document.hidden) flushAll()
  })

  /* Dev/test-only: let web/tests/motion.spec.ts assert on the POLICY rather
     than re-deriving it from matchMedia. The distinction matters — the
     policy folds in document.hidden and the user override too, so testing
     the media query alone would pass even if this module ignored it.
     watchdog.ts creates the object; this adds the one field it owns. */
  if (import.meta.env.DEV && window.__royalMotion) {
    window.__royalMotion.policy = motionPolicy
  }
}
