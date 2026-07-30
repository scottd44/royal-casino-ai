import { create } from 'zustand'

/* ============================================================
   Toast — plan §4. The real primitive for what legacy did with
   `Casino.toast(msg, type)` + `legacyBridge.ts:renderToast`'s raw DOM
   node (glass panel, colored by type, 3.6s auto-dismiss).

   This file owns state only: a list of toasts plus push/dismiss. The
   actual glass-panel styling, timers, and stacking live in Toast.tsx /
   ToastHost.tsx (a parallel agent's work) -- this store doesn't know
   about DOM, timeouts, or animation.

   `agentUi.ts` is framework-agnostic (ported from a classic script) and
   fires toasts from ~15 call sites deep inside game adapters, nowhere
   near a React render. It cannot call a hook. `toast()` below is the one
   non-reactive escape hatch, mirroring `wallet`/`motion` at the bottom of
   walletStore.ts/motionStore.ts.
   ============================================================ */

export type ToastType = 'info' | 'win' | 'lose'

export type ToastEntry = {
  id: string
  msg: string
  type: ToastType
}

type ToastState = {
  toasts: ToastEntry[]
  push: (msg: string, type?: ToastType) => void
  dismiss: (id: string) => void
}

// Toasts are short-lived and only ever exist client-side in one tab, so a
// monotonic counter is collision-safe here -- no need for a UUID dependency
// the plan explicitly says not to add.
let nextId = 0

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (msg, type = 'info') => {
    const id = String(nextId++)
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }))
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

/**
 * Non-reactive -- the ONE thing framework-agnostic code (agentUi.ts) is
 * allowed to call. Replaces every legacy `Casino.toast(msg, type)` site.
 */
export function toast(msg: string, type: ToastType = 'info'): void {
  useToastStore.getState().push(msg, type)
}
