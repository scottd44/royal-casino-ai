import { chord, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Roulette's own themed pack — a polished European-wheel table, not the
   carnival ratchet Wheel/sounds.ts goes for. `tick` is a single wooden-ball
   click (bandpass noise, no sustain) rather than a mechanical peg-knock,
   since the ball skips smoothly across pockets instead of being flung by
   flappers. Wins lean elegant (triangle chords, a real reverb tail on the
   jackpot); `lose` stays a dull, felt-muffled thud — Crash's own `lose`
   is reserved for the genuinely BIG bust moment in this batch.
   ============================================================ */

const D5 = 587.33
const FS5 = 739.99
const A5 = 880
const D6 = 1174.66
const FS6 = 1479.98

export const rouletteSounds: SoundPack = {
  click: () => {
    tone(660, { dur: 0.05, type: 'triangle', gain: 0.1 })
    noise({ start: 0, dur: 0.02, gain: 0.08, freq: 3000, filterType: 'highpass', Q: 0.8 })
  },

  // A single wooden ball skip/click against a pocket divider — sharp and
  // short, no sustain, so a rapid caller reads as a real skittering ball
  // rather than a buzz.
  tick: () => noise({ dur: 0.026, gain: 0.22, freq: 2000, filterType: 'bandpass', Q: 5 }),

  win: () => chord([D5, FS5, A5], { dur: 0.22, stagger: 0.085, type: 'triangle', gain: 0.16, reverbSend: 0.14 }),

  bigwin: () => {
    chord([D5, FS5, A5, D6], { dur: 0.3, stagger: 0.08, type: 'triangle', gain: 0.19, reverbSend: 0.24 })
    tone(D6, { start: 0.4, dur: 0.5, type: 'sine', gain: 0.16, reverbSend: 0.3 })
    tone(FS6, { start: 0.46, dur: 0.4, type: 'triangle', gain: 0.12, reverbSend: 0.3 })
  },

  cashout: () => chord([A5, D6], { dur: 0.2, stagger: 0.09, type: 'triangle', gain: 0.16, reverbSend: 0.16 }),

  lose: () => {
    tone(200, { dur: 0.22, type: 'sawtooth', gain: 0.11, freqEnd: 140 })
    noise({ start: 0.02, dur: 0.16, gain: 0.1, freq: 500, filterType: 'lowpass', Q: 0.6 })
  },
}
