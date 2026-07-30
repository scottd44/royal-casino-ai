import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { burst, tierFor } from '@/platform/motion/confetti'
import type { BurstTier } from '@/platform/motion/confetti'
import { setMotionOverride } from '@/platform/motion/reducedMotion'

/* ============================================================
   Motion preference + celebration tier — the other half of
   "one state, one writer" (handoff §6.6), mirroring walletStore.ts.

   Two things live here, deliberately kept small (plan §6):

   1. `override` — the user's explicit full/instant choice (a settings
      toggle, and the escape hatch Playwright uses). `null` means "follow
      the OS", which reducedMotion.ts resolves at read time from
      matchMedia + document.hidden. This store does NOT decide the final
      policy; it only remembers the override. reducedMotion.ts is the
      single source of truth for "should I animate right now".

   2. `lastTier` / `lastTierAt` — the most recent celebration tier, so an
      optional screen-level flourish (e.g. a jackpot banner) can react to
      it without every caller re-deriving the tier itself.

   IMPORTANT: this file must never import walletStore. walletStore imports
   `motion.celebrate` from here to wire payout() -> confetti (plan §6,
   "wire walletStore.payout -> celebrate"). If this file imported
   walletStore back, that would be a cycle. The dependency only runs one
   way: walletStore -> motionStore -> {confetti, reducedMotion}.
   ============================================================ */

type MotionState = {
  /** Persisted user setting; null = follow the OS. */
  override: 'full' | 'instant' | null
  /** Drives an optional screen-level flourish. Not persisted (see partialize below). */
  lastTier: BurstTier | null
  lastTierAt: number

  /**
   * Sets the override AND pushes it into reducedMotion.ts's imperative
   * policy. Two independent places tracking "is motion on" is exactly the
   * kind of drift handoff §6.6 bans -- so this is the only setter, and it
   * writes both.
   */
  setOverride: (v: 'full' | 'instant' | null) => void

  /**
   * Tiers a win against the bankroll it landed on and fires the burst.
   * Ported from js/core.js:71-83 `payout()`, where the tiering lived
   * inline. Splitting it out here (rather than duplicating the thresholds
   * in walletStore) keeps a single definition of "how big is big" in
   * confetti.ts's `tierFor`.
   */
  celebrate: (amount: number, bankroll: number) => void
}

export const useMotionStore = create<MotionState>()(
  persist(
    (set) => ({
      override: null,
      lastTier: null,
      lastTierAt: 0,

      setOverride: (v) => {
        setMotionOverride(v)
        set({ override: v })
      },

      celebrate: (amount, bankroll) => {
        const tier = tierFor(amount, bankroll)
        if (!tier) return
        burst(tier)
        set({ lastTier: tier, lastTierAt: Date.now() })
      },
    }),
    {
      name: 'royal_casino_motion_v1',
      // Never rehydrate a stale celebration (plan §6) -- lastTier/lastTierAt
      // describe a moment in time, not a durable preference.
      partialize: (s) => ({ override: s.override }),
    },
  ),
)

/** Non-reactive reads/actions, for use outside React (mirrors `wallet` in walletStore.ts). */
export const motion = {
  getOverride: () => useMotionStore.getState().override,
  setOverride: (v: 'full' | 'instant' | null) => useMotionStore.getState().setOverride(v),
  celebrate: (amount: number, bankroll: number) => useMotionStore.getState().celebrate(amount, bankroll),
}
