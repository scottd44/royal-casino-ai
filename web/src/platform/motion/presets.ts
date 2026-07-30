import type { Variants } from 'framer-motion'
import { DUR, EASE_BRAND, MAX_STAGGER_TOTAL } from './durations'
import { shouldAnimate } from './reducedMotion'

/* ============================================================
   Framer variant factories.

   PHASE_1_MOTION_ICONS_PLAN.md §7 / HANDOFF §6.4: every factory here
   collapses to a zero-duration transition itself when `!shouldAnimate()`
   (reduced motion, a backgrounded tab, or the user's explicit override —
   see reducedMotion.ts). Callers — including Reveal/Stagger — never branch
   on reduced motion themselves; they just ask for a preset and render it.

   `transition: all` is banned (HANDOFF §6.4) — every animated property is
   named explicitly below, and no factory ever sets `repeat: Infinity`
   (watchdog.ts can only force a FINITE tween to its resting state).
   ============================================================ */

/** Read once per call, not reactively — these are plain factory functions,
    not hooks. Reveal/Stagger re-invoke them on every render, which is how
    a live `document.hidden` flip or a settings toggle takes effect. */
function instantTransition() {
  return { duration: 0 } as const
}

export interface FadeUpOptions {
  y?: number
  dur?: number
  delay?: number
}

/** Opacity 0->1, y->0. The default entrance for panels and game mounts. */
export function fadeUp({ y = 10, dur = DUR.panel, delay = 0 }: FadeUpOptions = {}): Variants {
  if (!shouldAnimate()) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: instantTransition() },
    }
  }
  return {
    hidden: { opacity: 0, y },
    visible: {
      opacity: 1,
      y: 0,
      transition: { opacity: { duration: dur, ease: EASE_BRAND, delay }, y: { duration: dur, ease: EASE_BRAND, delay } },
    },
  }
}

export interface FadeInOptions {
  dur?: number
  delay?: number
}

/** Opacity only — overlays, status messages, anything that shouldn't shift layout. */
export function fadeIn({ dur = DUR.ui, delay = 0 }: FadeInOptions = {}): Variants {
  if (!shouldAnimate()) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: instantTransition() },
    }
  }
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: dur, ease: EASE_BRAND, delay } },
  }
}

export interface ScaleInOptions {
  from?: number
  dur?: number
  delay?: number
}

/** Opacity + scale — modals, result cards. */
export function scaleIn({ from = 0.96, dur = DUR.panel, delay = 0 }: ScaleInOptions = {}): Variants {
  if (!shouldAnimate()) {
    return {
      hidden: { opacity: 0, scale: 1 },
      visible: { opacity: 1, scale: 1, transition: instantTransition() },
    }
  }
  return {
    hidden: { opacity: 0, scale: from },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { opacity: { duration: dur, ease: EASE_BRAND, delay }, scale: { duration: dur, ease: EASE_BRAND, delay } },
    },
  }
}

export interface CascadeOptions {
  stagger?: number
}

/**
 * Parent orchestration variants for a staggered list (lobby grid, stat rows).
 * `count` is the number of children the caller is about to render; the
 * per-item stagger is capped at `MAX_STAGGER_TOTAL / count` so a 25-card
 * lobby can never keep its tail invisible for more than
 * `MAX_STAGGER_TOTAL` seconds (plan §2 / DEVELOPMENT_GUIDE §3 rule 2 — the
 * legacy 1.3s cap read as visibly slow and was tightened to 0.6s here).
 * Pair with a child preset (typically `fadeUp`) for the item variants —
 * `Stagger.tsx` does exactly that.
 */
export function cascade(count: number, { stagger = 0.035 }: CascadeOptions = {}): Variants {
  if (!shouldAnimate() || count <= 0) {
    return {
      hidden: {},
      visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
    }
  }
  const capped = Math.min(stagger, MAX_STAGGER_TOTAL / count)
  return {
    hidden: {},
    visible: { transition: { staggerChildren: capped, delayChildren: 0 } },
  }
}

export interface FlipFaceOptions {
  dur?: number
}

/**
 * `rotateY` 0 <-> 180, meant for a dedicated `preserve-3d` CHILD only
 * (HANDOFF §6.7). Keep any drop-shadow / glow on the non-rotating wrapper
 * and pre-rotate the back face 180deg with `backface-visibility: hidden` —
 * a shadow riding the rotating face renders as a hard slice at ~90deg.
 * Apply the `front` variant to the face showing value-down, `back` to the
 * face showing value-up (or vice versa); toggle the parent's `animate`
 * prop between `'front'` and `'back'`.
 */
export function flipFace({ dur = DUR.panel }: FlipFaceOptions = {}): Variants {
  if (!shouldAnimate()) {
    return {
      front: { rotateY: 0, transition: instantTransition() },
      back: { rotateY: 180, transition: instantTransition() },
    }
  }
  return {
    front: { rotateY: 0, transition: { rotateY: { duration: dur, ease: EASE_BRAND } } },
    back: { rotateY: 180, transition: { rotateY: { duration: dur, ease: EASE_BRAND } } },
  }
}

/**
 * `boxShadow` keyframes, two full cycles, then it stops — NOT
 * `repeat: Infinity` (HANDOFF §6.4 / plan §7: an infinite tween can never
 * be watchdogged, so it can never be proven safe against a stalled rAF).
 * Trigger by animating to the `'pulse'` variant once; it settles back to
 * transparent on its own and the caller can re-trigger for a repeat win.
 */
export function pulseGlow(color: string): Variants {
  if (!shouldAnimate()) {
    return {
      pulse: { boxShadow: '0 0 0px 0px transparent', transition: instantTransition() },
    }
  }
  const dim = `0 0 0px 0px ${color}`
  const lit = `0 0 24px 6px ${color}`
  return {
    pulse: {
      boxShadow: [dim, lit, dim, lit, dim],
      transition: {
        boxShadow: {
          duration: DUR.reveal * 2,
          ease: EASE_BRAND,
          times: [0, 0.25, 0.5, 0.75, 1],
        },
      },
    },
  }
}
