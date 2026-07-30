import { useCallback, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { fadeIn, fadeUp, scaleIn } from './presets'
import { DUR } from './durations'
import { motionPolicy } from './reducedMotion'
import { useWatchdog } from './watchdog'

/* ============================================================
   Reveal — a single-element entrance, watchdogged.

   IMPORTANT: this component renders its OWN element. It must never be
   placed on a persistent mount container (HANDOFF §6.1 / plan §0 rule 3) —
   e.g. never wrap `#view` or a game's root panel in a `<Reveal>` that stays
   mounted across rounds. A stalled tween on a node that is never replaced
   leaves inline opacity/transform on it forever and the whole subtree
   renders invisible. Reveal is for content that itself mounts and unmounts
   (a route's root panel the first time it appears, a result card, a modal
   body) — not for a container games render into repeatedly.

   Under `instant` policy (reduced motion, backgrounded tab, or the user's
   override — reducedMotion.ts) this renders a PLAIN element with no Framer
   wrapper at all, per plan §8 — fewer moving parts is the point, not a
   zero-duration animation that still pays Framer's mount/measure cost.
   ============================================================ */

export type RevealPreset = 'fadeUp' | 'fadeIn' | 'scaleIn'

/** Kept to the tag names we actually style as flex/grid items and reach for
    in game markup. Restricting `as` keeps the ref type (and therefore the
    watchdog's `Element` handle) simple to reason about; extend if a real
    call site needs another tag. */
export type RevealAs = 'div' | 'span' | 'li' | 'section' | 'article' | 'header' | 'footer'

const PRESET_DEFAULT_DUR: Record<RevealPreset, number> = {
  fadeUp: DUR.panel,
  fadeIn: DUR.ui,
  scaleIn: DUR.panel,
}

export interface RevealProps {
  preset?: RevealPreset
  /** Seconds before the entrance starts. */
  delay?: number
  /** Seconds the entrance itself takes. Defaults per-preset (see table above). */
  duration?: number
  /** `fadeUp` only: starting y-offset in px. */
  y?: number
  /** `scaleIn` only: starting scale (1 = no scale). */
  from?: number
  as?: RevealAs
  className?: string
  id?: string
  style?: CSSProperties
  children?: ReactNode
}

/**
 * `<Reveal preset="fadeUp" delay={0} as="div" className="...">{children}</Reveal>`
 *
 * Arms `useWatchdog` for `(delay + duration) * 1000` ms — plan §8: if the
 * tween never fires `onAnimationComplete` (rAF suspended in a backgrounded
 * tab, or Framer never mounts the animation for some other reason), the
 * watchdog strips the inline styles at `expectedMs + WATCHDOG_GRACE_MS` and
 * the content is forced visible regardless. That force is Track B repairing
 * itself — nothing here ever feeds a completion callback back into Track A
 * state (plan §0 rule 1).
 */
export function Reveal({
  preset = 'fadeUp',
  delay = 0,
  duration,
  y = 10,
  from = 0.96,
  as = 'div',
  className,
  id,
  style,
  children,
}: RevealProps) {
  /* LATCHED AT MOUNT, deliberately not reactive.
     `useMotionPolicy()` would re-render this component when the policy flips
     — and the policy flips on `visibilitychange`, which every backgrounded
     tab triggers. Because the two branches below render DIFFERENT ELEMENT
     TYPES (`motion.div` vs `div`), a live flip would make React unmount and
     remount the whole subtree, silently destroying any component state the
     children hold mid-round. Reading the policy once per mount keeps the
     tree shape stable for this instance's lifetime; the next thing to mount
     picks up the new policy. */
  const [policy] = useState(motionPolicy)
  const nodeRef = useRef<Element | null>(null)
  const setNode = useCallback((node: Element | null) => {
    nodeRef.current = node
  }, [])

  const dur = duration ?? PRESET_DEFAULT_DUR[preset]
  useWatchdog(nodeRef, (delay + dur) * 1000)

  if (policy === 'instant') {
    const As = as
    return (
      <As ref={setNode} id={id} className={className} style={style}>
        {children}
      </As>
    )
  }

  const variants =
    preset === 'fadeIn'
      ? fadeIn({ dur, delay })
      : preset === 'scaleIn'
        ? scaleIn({ from, dur, delay })
        : fadeUp({ y, dur, delay })

  const MotionTag = motion[as]
  return (
    <MotionTag
      ref={setNode}
      id={id}
      className={className}
      style={style}
      initial="hidden"
      animate="visible"
      variants={variants}
    >
      {children}
    </MotionTag>
  )
}
