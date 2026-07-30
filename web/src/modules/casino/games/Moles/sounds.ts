import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Moles — a mallet/carnival identity. `tick` fires once per round (the
   board arming at Start); `win` fires on every mole whacked — a quick
   "boing" pop that has to stay satisfying on repeat; the empty trap is
   a real steel-jaw snap, not a joke sound.
   ============================================================ */

const F5 = 698.46
const A5 = 880
const C6 = 1046.5
const F6 = 1396.91

export const molesSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.02, gain: 0.13, freq: 1600, filterType: 'bandpass', Q: 1.2 })
    tone(420, { start: 0, dur: 0.03, type: 'triangle', gain: 0.06 })
  },

  tick: () => chord([F5, A5], { dur: 0.13, stagger: 0.035, type: 'triangle', gain: 0.15 }),

  win: () => {
    tone(520, { dur: 0.12, type: 'sine', freqEnd: 940, gain: 0.18 })
    tone(1180, { start: 0.05, dur: 0.09, type: 'triangle', gain: 0.1 })
  },

  bigwin: () => {
    chord([F5, A5, C6, F6], { dur: 0.3, stagger: 0.08, type: 'triangle', gain: 0.19, reverbSend: 0.22 })
    tone(F6, { start: 0.42, dur: 0.48, type: 'sine', gain: 0.16, reverbSend: 0.28 })
  },

  cashout: () => chord([A5, C6], { dur: 0.2, stagger: 0.085, type: 'triangle', gain: 0.17, reverbSend: 0.14 }),

  lose: () => {
    noise({ start: 0, dur: 0.05, gain: 0.2, freq: 2600, filterType: 'highpass', Q: 0.8 })
    impact({ start: 0.02, dur: 0.32, gain: 0.26, pitch: 90, reverbSend: 0.06 })
  },
}
