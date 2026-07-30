import { chord, tone, noise } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Casino War — `tick` doubles as the card-slap for both the initial deal
   and the war round's burn-and-draw, so it's a slightly punchier highpass
   snap than its table-mates (this is the one card game with an actual
   "battle" beat). win is an F-major chime; bigwin (reserved for a big war
   win) is the same chord extended with a sustained bell and deeper
   reverb. cashout covers both a tie-going-to-war beat and a surrender —
   neutral, not celebratory. lose is a soft low thud.
   ============================================================ */

const F5 = 698.46
const A5 = 880.0
const C6 = 1046.5
const F6 = 1396.91

export const casinoWarSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.032, gain: 0.17, filterType: 'highpass', freq: 3000, Q: 0.65 })
    chord([2050, 2650], { dur: 0.05, type: 'triangle', gain: 0.09, stagger: 0.015 })
  },

  tick: () => {
    noise({ dur: 0.03, gain: 0.16, filterType: 'highpass', freq: 2800, Q: 0.65 })
    tone(2000, { dur: 0.04, type: 'triangle', gain: 0.07 })
  },

  win: () => chord([F5, A5, C6], { dur: 0.26, stagger: 0.09, type: 'triangle', gain: 0.18, reverbSend: 0.18 }),

  bigwin: () => {
    chord([F5, A5, C6, F6], { dur: 0.34, stagger: 0.08, type: 'triangle', gain: 0.21, reverbSend: 0.25 })
    tone(F6, { start: 0.42, dur: 0.5, type: 'sine', gain: 0.17, reverbSend: 0.3 })
  },

  cashout: () => chord([A5, F6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => {
    tone(178, { dur: 0.22, type: 'sine', gain: 0.14, freqEnd: 118 })
    tone(118, { start: 0.14, dur: 0.3, type: 'sine', gain: 0.11, freqEnd: 79 })
  },
}
