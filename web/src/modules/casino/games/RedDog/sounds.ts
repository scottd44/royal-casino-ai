import { chord, tone, noise } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Red Dog — card snap + chip clink for click/tick (tick fires once per
   deal, before the spread/trips reveal). win is a G-major chime for a
   normal spread hit; bigwin covers the richer payouts — a wide-spread
   raise landing or trip-of-a-kind at 11:1 — same chord extended an
   octave with a sustained bell and a deeper reverb tail. cashout is the
   neutral push chime (a pair-no-trips or consecutive-cards push). lose
   is a soft low thud.
   ============================================================ */

const G5 = 783.99
const B5 = 987.77
const D6 = 1174.66
const G6 = 1567.98

export const redDogSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.03, gain: 0.16, filterType: 'highpass', freq: 3300, Q: 0.7 })
    chord([2150, 2750], { dur: 0.05, type: 'triangle', gain: 0.09, stagger: 0.015 })
  },

  tick: () => {
    noise({ dur: 0.025, gain: 0.13, filterType: 'highpass', freq: 3100, Q: 0.7 })
    tone(2300, { dur: 0.04, type: 'triangle', gain: 0.07 })
  },

  win: () => chord([G5, B5, D6], { dur: 0.26, stagger: 0.09, type: 'triangle', gain: 0.18, reverbSend: 0.18 }),

  bigwin: () => {
    chord([G5, B5, D6, G6], { dur: 0.34, stagger: 0.08, type: 'triangle', gain: 0.21, reverbSend: 0.25 })
    tone(G6, { start: 0.42, dur: 0.5, type: 'sine', gain: 0.17, reverbSend: 0.3 })
  },

  cashout: () => chord([B5, G6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => {
    tone(182, { dur: 0.22, type: 'sine', gain: 0.14, freqEnd: 121 })
    tone(121, { start: 0.14, dur: 0.3, type: 'sine', gain: 0.11, freqEnd: 81 })
  },
}
