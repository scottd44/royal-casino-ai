import { useCallback, useEffect, useRef, useState } from 'react'
import { ANTICIPATION } from './durations'
import { motionPolicy } from './reducedMotion'

/* ============================================================
   useAnticipation — the ~600-1200ms tension window, as a state machine.

   HANDOFF §7 / PHASE_1_MOTION_ICONS_PLAN.md §10: "never resolve instantly."
   A round's outcome should feel like it was decided by *something*, not
   snapped into place the instant a button is pressed.

   This is Track A, not Track B (§0): the phase transition that follows the
   delay is real application state (a card flips, a cash-out becomes final),
   so it is driven by `setTimeout`, never `requestAnimationFrame` — the
   same reasoning as watchdog.ts, and for the same "a backgrounded tab must
   still make progress" reason.

   Crucially, the OUTCOME is computed up front, before the delay starts —
   `begin(payload)` takes the already-decided result. The delay is theatre
   layered on top of a decided value; it is never itself part of computing
   that value. Callers must resist the temptation to decide the outcome
   inside the `setTimeout` callback.
   ============================================================ */

export type AnticipationPhase = 'idle' | 'building' | 'resolved'

export interface UseAnticipationOptions<T> {
  /** Tension window, ms. Defaults to ANTICIPATION.default (850ms). */
  ms?: number
  /** Fired once the window elapses (or resolveNow() is called), with the payload passed to begin(). */
  onResolve?: (payload: T) => void
}

export interface UseAnticipationApi<T> {
  phase: AnticipationPhase
  /** Arms the window. `payload` is the ALREADY-DECIDED outcome — compute it before calling this. */
  begin: (payload: T) => void
  /** Cancels the timer and resolves immediately. Wired to a click so an impatient
      player (or a fast agent) can skip the animation. No-op outside 'building'. */
  resolveNow: () => void
}

export function useAnticipation<T = void>(options: UseAnticipationOptions<T> = {}): UseAnticipationApi<T> {
  const { ms = ANTICIPATION.default, onResolve } = options
  const [phase, setPhase] = useState<AnticipationPhase>('idle')

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const payloadRef = useRef<T | undefined>(undefined)
  // Keep the latest callback without making `begin`/`resolve` depend on it —
  // a caller passing an inline arrow function every render must not rearm anything.
  const onResolveRef = useRef(onResolve)
  onResolveRef.current = onResolve

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resolve = useCallback(() => {
    clearTimer()
    setPhase('resolved')
    onResolveRef.current?.(payloadRef.current as T)
  }, [clearTimer])

  const begin = useCallback(
    (payload: T) => {
      clearTimer()
      payloadRef.current = payload
      setPhase('building')
      // Plan §10: under `instant` policy the window collapses to 0ms, but it
      // still goes through a REAL timer tick (setTimeout(fn, 0), not a
      // synchronous call) so the disabled -> enabled edge the agent's
      // `waitFor` polls for actually happens as an observable transition.
      const delay = motionPolicy() === 'instant' ? 0 : ms
      timerRef.current = setTimeout(resolve, delay)
    },
    [ms, resolve, clearTimer],
  )

  const resolveNow = useCallback(() => {
    if (timerRef.current === null) return
    resolve()
  }, [resolve])

  // A resolved-after-unmount callback is a stale-state bug — clear on unmount.
  useEffect(() => clearTimer, [clearTimer])

  return { phase, begin, resolveNow }
}
