import { Children, isValidElement, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cascade, fadeUp } from './presets'
import { DUR, MAX_STAGGER_TOTAL } from './durations'
import { motionPolicy } from './reducedMotion'
import { armWatchdog, useWatchdog } from './watchdog'
import type { RevealAs } from './Reveal'

/* ============================================================
   Stagger — a list cascade, capped, watchdogged.

   IMPORTANT, same rule as Reveal: this renders its OWN container element
   and must never be the persistent mount point itself (HANDOFF §6.1 /
   plan §0 rule 3). Wrap the grid/list that appears once per mount (a lobby
   page, a fresh set of stat rows) — never a container games keep re-using
   across rounds.

   Each child is wrapped in its own `motion.div` carrying the item variant
   (plan §7/§8: "children get the item variant"). That inner wrapper is
   deliberately unstyled (no size/layout classes of its own) so it drops
   into a CSS grid/flex parent as the effective grid item without fighting
   the caller's layout — the caller's own classes stay on the child it
   passed in.

   Under `instant` policy this renders a plain element with no Framer
   wrapper and no extra per-item wrapper divs at all (plan §8) — the
   cheapest possible path when nobody is watching the cascade animate.
   ============================================================ */

export interface StaggerProps {
  as?: RevealAs
  className?: string
  id?: string
  style?: CSSProperties
  /** Per-item delay, seconds. Capped at `MAX_STAGGER_TOTAL / count` — see cascade(). */
  stagger?: number
  /** Per-item entrance duration, seconds. */
  duration?: number
  /** Per-item starting y-offset, px (fadeUp item variant). */
  y?: number
  children?: ReactNode
}

export function Stagger({
  as = 'div',
  className,
  id,
  style,
  stagger = 0.035,
  duration = DUR.panel,
  y = 16,
  children,
}: StaggerProps) {
  /* LATCHED AT MOUNT — same reasoning as Reveal.tsx, and it bites harder
     here. The two branches differ by more than the container's element
     type: the animated path also wraps every child in its own `motion.div`.
     A live policy flip would therefore restructure the grid's direct
     children as well as remount them, so a backgrounded tab could reshuffle
     a lobby's layout and wipe child state at the same time. One read, one
     tree shape, for this instance's lifetime. */
  const [policy] = useState(motionPolicy)
  const containerRef = useRef<Element | null>(null)
  const setContainerNode = useCallback((node: Element | null) => {
    containerRef.current = node
  }, [])

  const itemNodesRef = useRef<(Element | null)[]>([])
  const setItemNode = useCallback((index: number, node: Element | null) => {
    itemNodesRef.current[index] = node
  }, [])

  const count = Children.count(children)
  const cappedStagger = count > 0 ? Math.min(stagger, MAX_STAGGER_TOTAL / count) : stagger
  const expectedMs = (duration + cappedStagger * count) * 1000

  // Watchdog on the container — plan §8. A stalled `staggerChildren`
  // orchestration would otherwise leave the whole cascade at opacity: 0.
  useWatchdog(containerRef, expectedMs)

  // Watchdog on each child individually — plan §8: "a stalled child keeps
  // opacity: 0 even if the parent finished." `armWatchdog` (the imperative
  // primitive `useWatchdog` is built on) accepts an array, and re-arms
  // whenever the item count or timing changes.
  useEffect(() => {
    if (policy === 'instant') return
    const nodes = itemNodesRef.current.filter((n): n is Element => n != null)
    return armWatchdog(nodes, expectedMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy, expectedMs, count])

  if (policy === 'instant') {
    const As = as
    return (
      <As ref={setContainerNode} id={id} className={className} style={style}>
        {children}
      </As>
    )
  }

  const container = cascade(count, { stagger })
  const item = fadeUp({ y, dur: duration })
  const Container = motion[as]

  return (
    <Container
      ref={setContainerNode}
      id={id}
      className={className}
      style={style}
      initial="hidden"
      animate="visible"
      variants={container}
    >
      {Children.map(children, (child, index) => {
        const key = isValidElement(child) && child.key != null ? child.key : index
        return (
          <motion.div key={key} variants={item} ref={(node) => setItemNode(index, node)}>
            {child}
          </motion.div>
        )
      })}
    </Container>
  )
}
