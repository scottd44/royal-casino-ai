import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ElementType } from 'react'
import { animate } from 'framer-motion'
import { fmt } from '@/platform/money/format'
import { isNumericContractId } from '@/platform/agent/contractIds'
import { EASE_OUT } from './durations'
import { shouldAnimate } from './reducedMotion'

/* ============================================================
   AnimatedNumber — the dangerous one.

   PHASE_1_MOTION_ICONS_PLAN.md §9 / §0 rule 2, restated: `agent-ui.js`
   `parseFloat`s a contract node's raw `textContent` at arbitrary times
   (`waitFor` polls every 60ms). A count-up tween on one of those nodes
   doesn't degrade the animation — it feeds the agent a WRONG NUMBER, and
   nothing throws. `Stat.tsx` carries the same warning for the same reason.

   So: on every render this component checks `isNumericContractId(id)`
   itself. It never trusts a caller to remember not to animate `#curMult`.
   If the id is a numeric contract id, the value is written straight to
   `textContent` on every change and the count-up path never runs — see the
   `isContractNumber` branch below.

   OWNERSHIP MODEL — deliberately different for the two kinds of node:

   * Contract node (`isNumericContractId(id)`): REACT owns the text. The
     live `value` is rendered as children, so the committed DOM holds the
     true number synchronously, at commit, before paint. No imperative
     write, no effect, no window. This matters: an effect-owned write
     lands AFTER paint, which would leave the node holding the previous
     round's number for a frame or more — and `waitFor` polls every 60ms,
     so "a frame or more" is long enough to hand the agent a stale
     multiplier. Same silent-failure class this file exists to prevent,
     just a narrower window.

   * Ordinary node (wallet balance, telemetry tile): the EFFECT owns the
     text imperatively, exactly like legacy `countTo(el, ...)`. React is
     handed a value once, at mount (`initialText`, frozen in a lazy
     `useState` initializer) and never again — if children stayed wired to
     the live prop, React's re-render would race the tween's `onUpdate`
     (a one-frame flash to the final number, then a jump back to a
     mid-tween one). Nothing parses these nodes, so imperative ownership
     is free of contract risk here.
   ============================================================ */

export interface AnimatedNumberProps {
  value: number
  /** Renders a number to text. Defaults to the shared `fmt` (1,234-style). */
  format?: (n: number) => string
  /** Set this to a contract id (e.g. `curMult`) and the count-up refuses to run. */
  id?: string
  as?: ElementType
  className?: string
  style?: CSSProperties
}

/** Warn once per contract id, not once per render/mount — a game re-mounting
    `AnimatedNumber` on every round shouldn't spam the console. */
const warnedContractIds = new Set<string>()

export function AnimatedNumber({ value, format = fmt, id, as: As = 'span', className, style }: AnimatedNumberProps) {
  const nodeRef = useRef<HTMLElement | null>(null)
  const prevValueRef = useRef(value)
  // Every run stamps the element with an incrementing token (ported from
  // js/core.js:371,378 `countToken` / `el.__fxCount`) so a stale watchdog
  // timer from a superseded run can never clobber a newer count's output.
  const tokenRef = useRef(0)
  const isContractNumber = isNumericContractId(id)

  // Rendered ONCE at mount — see the file-level comment. Deliberately not
  // re-derived from `value`/`format` on every render.
  const [initialText] = useState(() => format(value))

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return

    const from = prevValueRef.current
    const to = value
    prevValueRef.current = to
    const mine = ++tokenRef.current

    // Rule 2 (§0): a numeric contract id NEVER animates. React already
    // committed the true value as this node's children — synchronously,
    // before paint — so there is deliberately NO imperative write here.
    // Writing it again from a passive effect would only re-do, one frame
    // later, what the commit already did correctly.
    // Warn once in DEV so a misuse (reaching for AnimatedNumber on a
    // contract id instead of a plain Stat) is caught, not shipped.
    if (isContractNumber) {
      if (import.meta.env.DEV && id && !warnedContractIds.has(id)) {
        warnedContractIds.add(id)
        // eslint-disable-next-line no-console
        console.warn(
          `[AnimatedNumber] "#${id}" is a numeric contract id (see platform/agent/contractIds.ts) — ` +
            'count-up refused, value written instantly. Use a plain Stat/text node for contract numbers.',
        )
      }
      return
    }

    const diff = Math.abs(to - from)

    // Plan §9 rule 4: skip the tween entirely below/above the useful range,
    // or when the current motion policy says don't bother (reduced motion,
    // backgrounded tab, user override — reducedMotion.ts).
    if (!shouldAnimate() || diff < 1 || diff > 5_000_000) {
      node.textContent = format(to)
      return
    }

    // Duration curve verbatim from js/core.js:384.
    const duration = Math.min(1.1, 0.28 + Math.log10(diff + 1) * 0.22)

    const controls = animate(from, to, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        // A newer run (this id got a fresh value before this one settled)
        // owns the node now; let it, don't stomp its output.
        if (tokenRef.current !== mine) return
        node.textContent = format(v)
      },
    })

    // Token + snap watchdog, ported in spirit from js/core.js:398-409. A
    // stalled tween would leave a WRONG number on screen — not a missing
    // animation, a correctness bug (§0/HANDOFF §6.3) — so once the
    // animation should be over, force the true value regardless of what
    // Framer's `onUpdate` last wrote (or failed to write, if rAF never
    // fired because the tab went to the background mid-tween).
    const snap = setTimeout(
      () => {
        if (tokenRef.current !== mine) return // superseded by a newer count
        const target = format(to)
        if (node.textContent === target) return
        controls.stop()
        node.textContent = target
      },
      duration * 1000 + 350,
    )

    return () => {
      clearTimeout(snap)
      controls.stop()
    }
    // `format`/`id` are read fresh above; the effect re-runs on `value`
    // change, which is the only trigger a re-count needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isContractNumber])

  return (
    /* Contract nodes render the LIVE value (React owns the text, committed
       before paint — zero staleness window for the agent's 60ms poll).
       Everything else renders the frozen mount-time text and hands the node
       over to the effect. See the OWNERSHIP MODEL note at the top. */
    <As ref={nodeRef} id={id} className={className} style={style}>
      {isContractNumber ? format(value) : initialText}
    </As>
  )
}
