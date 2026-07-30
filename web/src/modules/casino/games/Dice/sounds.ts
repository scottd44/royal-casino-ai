import { audioRandom, chord, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Dice's own pack — a digital probability console, not a physical table.
   The signature cue is `tick`: a real dice-rattle burst (filtered noise,
   not a tone) fired every TICK_MS during the anticipation spin, randomised
   a little in pitch each hit so a run of ticks reads as a clatter, not a
   metronome. Wins stay bright and quick (these rounds resolve in under a
   second); `bigwin` (mult >= 10) is the one moment that's allowed to
   linger, with a real reverb tail.
   ============================================================ */

export const diceSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.03, gain: 0.14, freq: 2400, filterType: 'bandpass', Q: 1.4 })
    tone(560, { start: 0, dur: 0.035, type: 'triangle', gain: 0.07 })
  },

  // A single die-knock: short bandpassed noise burst, mid-high freq, no
  // tonal pitch — this is the rattle-not-a-beep the brief calls for.
  tick: () =>
    noise({
      dur: 0.024,
      gain: 0.24,
      freq: 1900 + audioRandom() * 900,
      filterType: 'bandpass',
      Q: 4.5,
      attack: 0.001,
    }),

  win: () => chord([880, 1108.73, 1318.51], { dur: 0.16, type: 'triangle', stagger: 0.045, gain: 0.18, reverbSend: 0.06 }),

  bigwin: () => {
    chord([880, 1108.73, 1318.51, 1760], { dur: 0.22, type: 'triangle', stagger: 0.06, gain: 0.2, reverbSend: 0.24 })
    tone(1760, { start: 0.34, dur: 0.5, type: 'sine', gain: 0.17, freqEnd: 2217.46, reverbSend: 0.3 })
  },

  cashout: () => chord([1108.73, 1760], { dur: 0.18, stagger: 0.07, type: 'triangle', gain: 0.16, reverbSend: 0.12 }),

  lose: () => {
    noise({ dur: 0.05, gain: 0.15, freq: 700, freqEnd: 220, filterType: 'lowpass', Q: 0.8 })
    tone(260, { dur: 0.16, type: 'square', gain: 0.13, freqEnd: 110 })
  },
}
