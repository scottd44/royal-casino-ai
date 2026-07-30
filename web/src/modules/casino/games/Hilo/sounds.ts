import { chord, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Hilo — sound identity: crisp card-table snap. A call resolves the
   instant the next card lands and a correct streak keeps climbing fast,
   so wins stay quick and bright; a bust reads as a light card-slap
   deflate rather than a heavy loss stinger, since most rounds end in
   exactly that.
   ============================================================ */

const E5 = 659.25
const G5 = 783.99
const B5 = 987.77
const E6 = 1318.51

export const hiloSounds: SoundPack = {
  click: () => noise({ dur: 0.03, gain: 0.14, freq: 2600, filterType: 'highpass', Q: 1 }),

  // Not on Hilo's own call sites today, kept in-theme: a light card-flick tick.
  tick: () => tone(1046.5, { dur: 0.03, type: 'square', gain: 0.06 }),

  // Punchy, immediate 2-note rise — fast attack, very short dur.
  win: () => chord([E5, B5], { dur: 0.1, stagger: 0.045, type: 'triangle', gain: 0.2, attack: 0.004 }),

  // Brighter/richer 3-note stack + a touch of reverb for runMult>=10.
  bigwin: () =>
    chord([E5, G5, E6], {
      dur: 0.13,
      stagger: 0.05,
      type: 'triangle',
      gain: 0.21,
      attack: 0.004,
      reverbSend: 0.14,
    }),

  // Quick, sharp, deflating card-slap — a short noise snap over a low thud tail.
  lose: () => {
    noise({ dur: 0.045, gain: 0.15, freq: 1600, freqEnd: 350, filterType: 'lowpass', Q: 0.8 })
    tone(200, { start: 0.02, dur: 0.11, type: 'sawtooth', gain: 0.11, freqEnd: 130 })
  },

  // Clean "locked it in" chime for a bank, distinct from win.
  cashout: () => chord([G5, E6], { dur: 0.16, stagger: 0.06, type: 'triangle', gain: 0.19, reverbSend: 0.1 }),
}
