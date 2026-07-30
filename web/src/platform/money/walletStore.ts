import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { motion } from '@/platform/motion/motionStore'
import { toast } from '@/platform/ui/toast/toastStore'
import { money } from './format'

/* ============================================================
   The wallet — the one global piece of state in Phase 0.

   Ported from js/core.js. Semantics kept identical because the agent
   measures every round as `getBalance()` before vs after:

     bet(n)     deducts, returns false if invalid or unaffordable
     payout(n)  credits; ignores non-positive amounts
     cheat.win() forces a favourable outcome when the rig is on

   ONE STATE, ONE WRITER (handoff §6.6): every mutation goes through this
   store. No component may hold its own copy of the balance.
   ============================================================ */

export const STARTING_BALANCE = 1000

/** Recommended default rig strength, from core.js. */
const DEFAULT_CHEAT_STRENGTH = 0.62

type WalletState = {
  balance: number
  /** Stake currently in the bet field. The agent writes this via #betInput. */
  bet: number
  /**
   * The stake of the most recent ACCEPTED bet — i.e. what a game actually
   * read out of #betInput and staked, as opposed to what the agent intended.
   * Those two numbers diverging is precisely the silent-failure this whole
   * migration risks, so it is worth recording rather than inferring.
   */
  lastStake: number
  cheatOn: boolean
  cheatStrength: number

  setBet: (n: number) => void
  /** Deduct a stake. Returns false (and changes nothing) if it can't be covered. */
  placeBet: (amount: number) => boolean
  /** Credit winnings / refunds / cash-outs. Non-positive amounts are ignored. */
  payout: (amount: number) => void
  setBalance: (amount: number) => void
  /** Simulated top-up -- ported from js/core.js:92-96's addFunds(). Unlike
   *  payout(), this never fires the win-celebration confetti (it isn't a
   *  win) and always toasts. */
  addFunds: (amount: number) => void
  setCheat: (on: boolean) => void
  reset: () => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      bet: 20,
      lastStake: 0,
      cheatOn: false,
      cheatStrength: DEFAULT_CHEAT_STRENGTH,

      setBet: (n) => {
        const v = Math.floor(Number(n))
        set({ bet: Number.isFinite(v) && v > 0 ? v : 0 })
      },

      placeBet: (amount) => {
        const v = Math.floor(Number(amount))
        if (!Number.isFinite(v) || v <= 0) return false
        if (v > get().balance) return false
        set((s) => ({ balance: s.balance - v, lastStake: v }))
        return true
      },

      payout: (amount) => {
        const v = Math.round(Number(amount))
        if (!Number.isFinite(v) || v <= 0) return
        // js/core.js:74-82 -- `before` is read BEFORE the credit, because the
        // tier ratio (amount / bankroll) is judged against what the win landed
        // on, not what it grew into. The burst lives inside payout() itself
        // (not in a component) for the same reason it did in core.js: every
        // game funnels winnings through this one function, so all 25 games
        // celebrate without a single game module knowing confetti exists.
        const before = get().balance
        set((s) => ({ balance: s.balance + v }))
        motion.celebrate(v, before)
      },

      setBalance: (amount) => set({ balance: Math.max(0, Math.round(amount)) }),

      addFunds: (amount) => {
        const v = Math.round(Number(amount))
        if (!Number.isFinite(v) || v <= 0) return
        set((s) => ({ balance: s.balance + v }))
        toast(`+${money(v)} added (simulated).`, 'info')
      },

      setCheat: (on) => set({ cheatOn: !!on }),

      reset: () => set({ balance: STARTING_BALANCE }),
    }),
    { name: 'royal_casino_wallet_v1' },
  ),
)

/** True when this outcome should be forced in the player's favour (the 😈 rig). */
export function cheatWin(): boolean {
  const { cheatOn, cheatStrength } = useWalletStore.getState()
  return cheatOn && Math.random() < cheatStrength
}

/** Non-reactive reads, for the agent bridge and game logic outside render. */
export const wallet = {
  getBalance: () => useWalletStore.getState().balance,
  getBet: () => useWalletStore.getState().bet,
  placeBet: (n: number) => useWalletStore.getState().placeBet(n),
  payout: (n: number) => useWalletStore.getState().payout(n),
}
