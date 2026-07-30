import { chord, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Coinflip — sound identity: bright metallic coin ring. A flip resolves
   instantly and a streak chains call after call, so every cue stays
   snappy — a coin-clink click, a quick metallic "ting" for a correct
   call, nothing with a lingering tail except the light reverb dusting on
   bigwin/cashout.
   ============================================================ */

const D5 = 587.33
const FS5 = 739.99
const A5 = 880
const D6 = 1174.66

export const coinflipSounds: SoundPack = {
  click: () => noise({ dur: 0.03, gain: 0.15, freq: 3200, filterType: 'bandpass', Q: 3 }),

  // Not on Coinflip's own call sites today, kept in-theme: a light coin-spin tick.
  tick: () => tone(1200, { dur: 0.025, type: 'square', gain: 0.06 }),

  // Quick bright metallic ting — fast attack, very short.
  win: () => chord([D5, A5], { dur: 0.1, stagger: 0.04, type: 'triangle', gain: 0.2, attack: 0.004 }),

  // Same ting, richer 3-note stack + a light reverb tail for the streak's biggest moment.
  bigwin: () =>
    chord([D5, A5, D6], {
      dur: 0.13,
      stagger: 0.045,
      type: 'triangle',
      gain: 0.21,
      attack: 0.004,
      reverbSend: 0.13,
    }),

  // Quick, sharp, descending whomp — deflating but light, since a wrong call is routine.
  lose: () => {
    noise({ dur: 0.05, gain: 0.14, freq: 900, freqEnd: 300, filterType: 'lowpass', Q: 0.8 })
    tone(260, { dur: 0.12, type: 'sawtooth', gain: 0.12, freqEnd: 150 })
  },

  // Clean "locked it in" chime for banking a streak, distinct from win.
  cashout: () => chord([FS5, D6], { dur: 0.17, stagger: 0.07, type: 'triangle', gain: 0.19, reverbSend: 0.1 }),
}
