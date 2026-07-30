import { useEffect } from 'react'
import type { RefObject } from 'react'
import { WATCHDOG_GRACE_MS } from './durations'

/* ============================================================
   The safety net. Port of js/core.js:437-497 (unhide / armWatchdog),
   generalised so any hide-then-reveal — Framer or not — can arm one.

   DEVELOPMENT_GUIDE §3 rule 2: "Every hide-then-reveal arms a watchdog."
   An entrance animation hides its targets first (opacity:0, transform),
   so a tween that stalls or never runs — rAF suspended in a backgrounded
   tab, the tab is closed mid-tween, Framer never mounts — would otherwise
   leave content invisible or a control permanently disabled forever.
   Normally this fires and finds nothing to do; it is the case where it
   DOES fire that keeps the AI Lab's `waitFor` (js/agent/agent-ui.js:262)
   from burning its full 4-20s timeout on a dead tween.

   Timers here are setTimeout ONLY — never requestAnimationFrame. A
   backgrounded tab clamps setTimeout to ~1Hz but never suspends it,
   which is the entire reason this mechanism works where rAF doesn't
   (PHASE_1_MOTION_ICONS_PLAN.md §0).
   ============================================================ */

type Entry = {
  /** The nodes this entry will force visible. */
  nodes: Element[]
  /** setTimeout handle backing the grace-period fire; cleared on cancel/flush. */
  timer: ReturnType<typeof setTimeout>
  /** Strip the inline styles now. Idempotent — safe to call more than once. */
  force: () => void
}

/** Every watchdog currently waiting on its grace period. flushAll() drains this. */
const pending = new Set<Entry>()

/**
 * The forced state strips the inline styles the entrance animation set
 * (`opacity`, `transform`) back to `''` — i.e. hands the property back to
 * CSS — exactly as legacy `unhide()` did. It deliberately does NOT set
 * `opacity: 1`: that would fight a legitimate animation that is merely
 * running slow (e.g. under a throttled background tab) rather than dead,
 * stomping its later frames with a flat value. Stripping the style is a
 * pure "get out of the way," never a competing write.
 */
function forceVisible(nodes: Element[]): void {
  for (const node of nodes) {
    // Only HTMLElement/SVGElement carry `.style`; guard rather than assume
    // every Element passed in is one (defensive, matches legacy `fx`).
    if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) continue
    node.style.opacity = ''
    node.style.transform = ''
  }
}

/**
 * Force `nodes` to their resting visible state after `expectedMs + grace`.
 * Returns a cancel fn. Idempotent; safe to call on unmounted nodes (the
 * forced write is a no-op strip on whatever the node currently holds).
 *
 * `customForce`, when given, REPLACES the default strip-to-`''` behaviour.
 * The default assumes a one-directional hide-then-reveal (Reveal/Stagger's
 * only use case: opacity/transform always relax TOWARD the visible resting
 * state when stripped). Card.tsx's 3D flip is bidirectional — stripping
 * `transform` unconditionally resolves to `rotateY(0)` (front), which is
 * WRONG whenever the card is legitimately supposed to be settled on its
 * back face for longer than one watchdog window (e.g. Video Poker's
 * staggered redraw leaves a slot face-down for well over a second) — the
 * card would go blank (front content suppressed by its own `faceDown`
 * prop, back face rotated out of view). A caller with a bidirectional
 * resting state must pass its own `force` that reads the CURRENT logical
 * state and writes the transform that actually matches it.
 */
export function armWatchdog(
  nodes: Element | Element[] | null,
  expectedMs: number,
  customForce?: () => void,
): () => void {
  const list = nodes == null ? [] : Array.isArray(nodes) ? nodes : [nodes]
  if (list.length === 0) return () => {}

  const entry: Entry = {
    nodes: list,
    // placeholder — replaced immediately below once `entry` exists to close over.
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
    force: customForce ?? (() => forceVisible(list)),
  }

  entry.timer = setTimeout(() => {
    pending.delete(entry)
    entry.force()
  }, expectedMs + WATCHDOG_GRACE_MS)

  pending.add(entry)

  return () => {
    clearTimeout(entry.timer)
    pending.delete(entry)
  }
}

/** Fire every pending watchdog NOW. Called on `visibilitychange -> hidden`. */
export function flushAll(): void {
  for (const entry of pending) {
    clearTimeout(entry.timer)
    entry.force()
  }
  pending.clear()
}

/** React binding: arms on mount/dep-change, cancels on unmount. */
export function useWatchdog(ref: RefObject<Element | null>, expectedMs: number, deps: unknown[] = []): void {
  useEffect(() => {
    const node = ref.current
    if (!node) return
    return armWatchdog(node, expectedMs)
    // `deps` lets callers key re-arming off more than the ref/expectedMs
    // (e.g. a `key` prop on the animated content). Deliberately spread
    // rather than a fixed-length array — see call sites in Reveal/Stagger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, expectedMs, ...deps])
}

/* ------------------------------------------------------------
   Dev/test-only escape hatch. `web/tests/motion.spec.ts` asserts on
   `pending()` to prove the app never leaves an entrance mid-flight —
   e.g. after a full round with `requestAnimationFrame` stubbed out.
   Gated on import.meta.env.DEV so this never ships in a prod bundle.
   ------------------------------------------------------------ */
declare global {
  interface Window {
    __royalMotion?: {
      flushAll: () => void
      pending: () => number
      /** Assigned by reducedMotion.ts, which owns the policy decision. */
      policy?: () => 'full' | 'instant'
    }
  }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__royalMotion = {
    flushAll,
    pending: () => pending.size,
  }
}
