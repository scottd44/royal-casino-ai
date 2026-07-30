import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Chicken Road — a playful arcade-chiptune identity (square-wave
   chirps for the token's hops) riding over a genuinely hard car-impact
   thump the instant traffic catches it — the one moment this game
   isn't allowed to be cute.
   ============================================================ */

const G5 = 783.99
const B5 = 987.77
const D6 = 1174.66
const G6 = 1567.98

export const chickenSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.025, gain: 0.12, freq: 2400, filterType: 'highpass', Q: 1 })
    tone(700, { start: 0, dur: 0.03, type: 'square', gain: 0.05 })
  },

  tick: () => tone(760, { dur: 0.09, type: 'square', freqEnd: 1180, gain: 0.15 }),

  win: () => chord([G5, B5, D6], { dur: 0.22, stagger: 0.07, type: 'triangle', gain: 0.17, reverbSend: 0.12 }),

  bigwin: () => {
    chord([G5, B5, D6, G6], { dur: 0.3, stagger: 0.08, type: 'triangle', gain: 0.19, reverbSend: 0.22 })
    tone(G6, { start: 0.42, dur: 0.48, type: 'sine', gain: 0.16, reverbSend: 0.28 })
  },

  cashout: () => chord([B5, D6], { dur: 0.2, stagger: 0.085, type: 'triangle', gain: 0.16, reverbSend: 0.14 }),

  lose: () => {
    noise({ start: 0, dur: 0.1, gain: 0.2, freq: 1800, freqEnd: 500, filterType: 'bandpass', Q: 1.6 })
    impact({ start: 0.03, dur: 0.34, gain: 0.26, pitch: 75, reverbSend: 0.06 })
  },
}
