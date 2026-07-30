import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { fadeUp } from '@/platform/motion'
import { cn } from '../cn'
import { useToastStore } from './toastStore'
import type { ToastEntry } from './toastStore'

/* ============================================================
   Toast — one card. Styling ported from the legacy inline styles this
   formalizes (`platform/agent/legacyBridge.ts:renderToast`): a `.glass`
   panel, colored by `type` — red for 'lose', green for 'win', the default
   text color for 'info' — auto-dismissing after ~3.6s.

   The 3.6s timer is a plain `setTimeout`, matching legacy exactly. PHASE_2
   §4: this is a UI nicety with no agent-contract implication — toasts don't
   appear in `platform/agent/contractIds.ts`, nothing polls a toast's
   presence — so it doesn't need the watchdog machinery `Reveal`/`Stagger`
   use for entrances the agent's `waitFor` might be blocked on.
   ============================================================ */

const TONE_COLOR: Record<ToastEntry['type'], string | undefined> = {
  info: undefined,
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
}

const AUTO_DISMISS_MS = 3600

export type ToastProps = ToastEntry

/**
 * Rendered by `ToastHost` inside its `AnimatePresence` — the exit animation
 * plays because `ToastHost` removes this entry from the `toasts` array
 * (either via this timer or a caller-triggered `dismiss`), not because this
 * component unmounts itself directly.
 */
export function Toast({ id, msg, type }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => useToastStore.getState().dismiss(id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [id])

  return (
    <motion.div
      variants={fadeUp({ y: 12 })}
      initial="hidden"
      animate="visible"
      exit="hidden"
      className={cn('toast glass max-w-[340px] rounded-[10px] px-3.5 py-2.5 text-[13px]')}
      style={{ pointerEvents: 'auto', color: TONE_COLOR[type] }}
    >
      {msg}
    </motion.div>
  )
}
