import { chord, tone, noise } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Video Poker — `tick` fires once per replacement card during the
   staggered draw reveal, so it stays a quick card snap with a light chip
   accent. win is an A-major chime for any paying hand; bigwin (quads,
   straight/royal flush) is the same chord extended an octave with a
   sustained bell and a deep reverb tail — the jackpot moment at this
   machine. cashout is the neutral "lucky refund" double-chime, distinct
   from a real win. lose is a soft low thud.
   ============================================================ */

const A5 = 880.0
const Cs6 = 1108.73
const E6 = 1318.51
const A6 = 1760.0

export const videoPokerSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.03, gain: 0.16, filterType: 'highpass', freq: 3400, Q: 0.7 })
    chord([2200, 2800], { dur: 0.05, type: 'triangle', gain: 0.09, stagger: 0.015 })
  },

  tick: () => {
    noise({ dur: 0.025, gain: 0.13, filterType: 'highpass', freq: 3100, Q: 0.7 })
    tone(2400, { dur: 0.04, type: 'triangle', gain: 0.07 })
  },

  win: () => chord([A5, Cs6, E6], { dur: 0.26, stagger: 0.09, type: 'triangle', gain: 0.18, reverbSend: 0.18 }),

  bigwin: () => {
    chord([A5, Cs6, E6, A6], { dur: 0.34, stagger: 0.08, type: 'triangle', gain: 0.22, reverbSend: 0.25 })
    tone(A6, { start: 0.42, dur: 0.5, type: 'sine', gain: 0.18, reverbSend: 0.3 })
  },

  cashout: () => chord([Cs6, A6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => {
    tone(176, { dur: 0.22, type: 'sine', gain: 0.13, freqEnd: 116 })
    tone(116, { start: 0.14, dur: 0.3, type: 'sine', gain: 0.1, freqEnd: 78 })
  },
}
