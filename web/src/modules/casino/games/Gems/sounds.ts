import { chord, impact, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Gems' own themed pack — "Cosmic Gems", a starfield gem-case, deliberately
   NOT a reskin of Slots' brushed-metal cabinet (see GemsGame.tsx's own file
   header). `tick` fires once per column lock (GemsGame.tsx's 520/860/1200ms
   timers) — still a real mechanical thunk (a column of gem cells locking
   into place), but a lower pitch than Slots' reel-stop plus a bright
   crystalline overtone riding on top, so it reads as glass/gem rather than
   brushed metal. Wins lean cosmic/crystalline — sine-heavy stacked chords
   with a longer reverb tail, evoking gems chiming rather than a bell ringing.
   ============================================================ */

const A5 = 880
const CS6 = 1108.73
const E6 = 1318.51
const A6 = 1760

export const gemsSounds: SoundPack = {
  click: () => tone(700, { dur: 0.05, type: 'sine', gain: 0.1 }),

  // Column-lock thunk — lower and rounder than Slots' reel-stop, with a
  // thin crystalline shimmer riding the impact so it reads as gem/glass.
  tick: () => {
    impact({ dur: 0.16, gain: 0.19, pitch: 170 })
    tone(CS6, { start: 0.01, dur: 0.09, type: 'sine', gain: 0.06, reverbSend: 0.1 })
  },

  win: () => chord([A5, CS6, E6], { dur: 0.26, stagger: 0.09, type: 'sine', gain: 0.16, reverbSend: 0.2 }),

  // Several lines hitting at once / a big multiplier — a wider, longer
  // crystalline cascade with real reverb depth.
  bigwin: () => {
    chord([A5, CS6, E6, A6], { dur: 0.34, stagger: 0.09, type: 'sine', gain: 0.18, reverbSend: 0.3 })
    tone(A6, { start: 0.44, dur: 0.55, type: 'triangle', gain: 0.15, reverbSend: 0.32 })
    tone(E6, { start: 0.5, dur: 0.45, type: 'sine', gain: 0.11, reverbSend: 0.3 })
  },

  cashout: () => chord([E6, A6], { dur: 0.22, stagger: 0.1, type: 'sine', gain: 0.15, reverbSend: 0.2 }),

  lose: () => tone(230, { dur: 0.24, type: 'sawtooth', gain: 0.1, freqEnd: 150 }),
}
