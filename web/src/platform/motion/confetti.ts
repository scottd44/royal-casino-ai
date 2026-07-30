import confetti from 'canvas-confetti'
import { shouldAnimate } from './reducedMotion'

/* ============================================================
   Celebration bursts. Port of js/core.js:412-435 (`fx.burst`), verbatim
   on particle counts, colours, origins and the shared throttle.

   In the legacy build this lived inside `payout()` — the single funnel
   every one of the 25 games' winnings pass through — which is why every
   game celebrated without a single game module knowing about confetti.
   PHASE_1_MOTION_ICONS_PLAN.md §6 keeps that property: motionStore's
   `celebrate()` is wired to walletStore.payout, not to individual games.

   Cosmetic only: wrapped in try/catch everywhere, because a confetti
   failure (canvas unavailable, a hostile test environment, whatever)
   must never throw into game logic that just paid a player out.
   ============================================================ */

export type BurstTier = 'cashout' | 'big' | 'jackpot'

const GOLD = ['#f0c24f', '#ffdc86', '#ab7f16']
const NEON = ['#22e59a', '#a97bff', '#4d8cff', '#f0c24f']

/** Both `payout()` and the win sound can fire for the same win — throttle
    once here rather than at every call site. */
const THROTTLE_MS = 700
let lastBurst = 0

export function burst(tier: BurstTier = 'cashout'): void {
  // Belt and braces: `disableForReducedMotion: true` below is the belt,
  // this early return is the braces. Also covers document.hidden (§0) and
  // the explicit user override — none of those should spawn particles.
  if (!shouldAnimate()) return

  const now = Date.now()
  if (now - lastBurst < THROTTLE_MS) return
  lastBurst = now

  try {
    if (tier === 'jackpot') {
      confetti({
        particleCount: 160,
        spread: 100,
        startVelocity: 52,
        origin: { y: 0.62 },
        colors: NEON,
        disableForReducedMotion: true,
      })
      setTimeout(() => {
        try {
          confetti({
            particleCount: 90,
            angle: 60,
            spread: 66,
            origin: { x: 0, y: 0.7 },
            colors: GOLD,
            disableForReducedMotion: true,
          })
        } catch {
          /* confetti is cosmetic — must never throw into game logic */
        }
      }, 130)
      setTimeout(() => {
        try {
          confetti({
            particleCount: 90,
            angle: 120,
            spread: 66,
            origin: { x: 1, y: 0.7 },
            colors: GOLD,
            disableForReducedMotion: true,
          })
        } catch {
          /* confetti is cosmetic — must never throw into game logic */
        }
      }, 200)
    } else if (tier === 'big') {
      confetti({
        particleCount: 110,
        spread: 78,
        startVelocity: 44,
        origin: { y: 0.65 },
        colors: NEON,
        disableForReducedMotion: true,
      })
    } else {
      confetti({
        particleCount: 46,
        spread: 58,
        startVelocity: 34,
        scalar: 0.85,
        origin: { y: 0.68 },
        colors: GOLD,
        disableForReducedMotion: true,
      })
    }
  } catch {
    /* confetti is cosmetic — must never throw into game logic */
  }
}

/**
 * Tier a win, or `null` if it doesn't clear the bar. Thresholds verbatim
 * from `js/core.js:80-82`'s `payout()`. `bankroll` MUST be the balance
 * BEFORE the credit — "big" is judged against the bankroll the win
 * landed on, so it scales with the player instead of a fixed dollar
 * amount. `Math.max(bankroll, 1)` guards the same divide-by-zero the
 * legacy `Math.max(before, 1)` did (a zero balance winning anything would
 * otherwise be an infinite ratio).
 */
export function tierFor(amount: number, bankroll: number): BurstTier | null {
  const ratio = amount / Math.max(bankroll, 1)
  if (ratio >= 1.5 || amount >= 20000) return 'jackpot'
  if (ratio >= 0.4 || amount >= 4000) return 'big'
  if (ratio >= 0.15) return 'cashout'
  return null
}
