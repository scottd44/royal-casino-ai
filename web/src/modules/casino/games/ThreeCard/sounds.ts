import { chord, tone, noise } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Three Card Poker — card snap + chip clink for click/tick (tick fires
   once, on deal). win is an E-major chime for a Play win; bigwin is the
   same chord stretched an octave with a sustained bell and a deeper
   reverb tail for a straight-flush-grade hand or a big ante bonus.
   cashout is the neutral push double-chime. lose covers both a fold and
   a losing Play hand — a soft, low thud either way, never harsh.
   ============================================================ */

const E5 = 659.25
const Gs5 = 830.61
const B5 = 987.77
const E6 = 1318.51

export const threeCardSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.03, gain: 0.16, filterType: 'highpass', freq: 3300, Q: 0.7 })
    chord([1900, 2500], { dur: 0.05, type: 'triangle', gain: 0.09, stagger: 0.015 })
  },

  tick: () => {
    noise({ dur: 0.025, gain: 0.13, filterType: 'highpass', freq: 3000, Q: 0.7 })
    tone(2100, { dur: 0.04, type: 'triangle', gain: 0.07 })
  },

  win: () => chord([E5, Gs5, B5], { dur: 0.26, stagger: 0.09, type: 'triangle', gain: 0.18, reverbSend: 0.18 }),

  bigwin: () => {
    chord([E5, Gs5, B5, E6], { dur: 0.34, stagger: 0.08, type: 'triangle', gain: 0.21, reverbSend: 0.25 })
    tone(E6, { start: 0.42, dur: 0.5, type: 'sine', gain: 0.17, reverbSend: 0.3 })
  },

  cashout: () => chord([Gs5, E6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => {
    tone(180, { dur: 0.22, type: 'sine', gain: 0.13, freqEnd: 120 })
    tone(120, { start: 0.14, dur: 0.3, type: 'sine', gain: 0.1, freqEnd: 80 })
  },
}
