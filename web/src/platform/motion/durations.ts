/* ============================================================
   Motion tokens — the single source of truth for every duration,
   easing curve and cap used by platform/motion/.

   These MIRROR the CSS custom properties in web/src/index.css:82-87
   (--dur-tap/--dur-ui/--dur-panel/--dur-reveal). Two consumers, one
   set of numbers: CSS transitions read the custom properties, Framer
   variants read these exports. If you change a number here, change
   it there too — PHASE_1_MOTION_ICONS_PLAN.md §2.
   ============================================================ */

/** Milliseconds, for setTimeout / watchdog math. */
export const MS = { tap: 90, ui: 180, panel: 320, reveal: 520 } as const

/** Seconds, for Framer Motion `transition.duration`. */
export const DUR = { tap: 0.09, ui: 0.18, panel: 0.32, reveal: 0.52 } as const

/** css/styles.css --ease, as a Framer cubic-bezier array. */
export const EASE_BRAND = [0.22, 0.8, 0.28, 1] as const
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

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
