/* ============================================================
   Barrel for platform/motion/. Callers do:

     import { Reveal, Stagger, AnimatedNumber, useAnticipation, fadeUp } from '@/platform/motion'

   rather than reaching into individual files — one door in, per
   PHASE_1_MOTION_ICONS_PLAN.md §1's file tree.
   ============================================================ */

// tokens, policy, safety net, celebration, store
export * from './durations'
export * from './reducedMotion'
export * from './watchdog'
export * from './confetti'
export * from './motionStore'

// this module's own surface
export * from './presets'
export * from './Reveal'
export * from './Stagger'
export * from './AnimatedNumber'
export * from './useAnticipation'
