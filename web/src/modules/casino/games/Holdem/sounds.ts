import { chord, tone, noise } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Texas Hold'em — a card snap + chip clink for click/tick (not currently
   wired to a call site in HoldemGame.tsx, but implemented per the
   SoundPack contract). win is a B-major chime for taking down a hand;
   bigwin (a big pot — 20 big blinds or more) is the same chord extended
   an octave with a sustained bell and a deep reverb tail. cashout is the
   neutral double-chime (unused at a current call site, same reasoning as
   click/tick). lose is a soft, low thud for folding away a pot.
   ============================================================ */

const B5 = 987.77
const Ds6 = 1244.51
const Fs6 = 1479.98
const B6 = 1975.53

export const holdemSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.03, gain: 0.16, filterType: 'highpass', freq: 3300, Q: 0.7 })
    chord([1950, 2550], { dur: 0.05, type: 'triangle', gain: 0.09, stagger: 0.015 })
  },

  tick: () => {
    noise({ dur: 0.025, gain: 0.13, filterType: 'highpass', freq: 3000, Q: 0.7 })
    tone(2050, { dur: 0.04, type: 'triangle', gain: 0.07 })
  },

  win: () => chord([B5, Ds6, Fs6], { dur: 0.26, stagger: 0.09, type: 'triangle', gain: 0.18, reverbSend: 0.18 }),

  bigwin: () => {
    chord([B5, Ds6, Fs6, B6], { dur: 0.34, stagger: 0.08, type: 'triangle', gain: 0.21, reverbSend: 0.25 })
    tone(B6, { start: 0.42, dur: 0.5, type: 'sine', gain: 0.17, reverbSend: 0.3 })
  },

  cashout: () => chord([Ds6, B6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => {
    tone(179, { dur: 0.22, type: 'sine', gain: 0.13, freqEnd: 119 })
    tone(119, { start: 0.14, dur: 0.3, type: 'sine', gain: 0.1, freqEnd: 80 })
  },
}
