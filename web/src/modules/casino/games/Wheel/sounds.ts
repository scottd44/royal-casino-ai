import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Wheel's own themed pack — a carnival prize wheel, not Roulette's polished
   felt table. `tick` fires once per passing peg (WheelGame.tsx's own
   `scheduleTick`, which thins the gap between calls as the wheel decelerates
   — see that file's comment), so each individual call is a short knock: a
   bandpass click plus a tiny low thump for the flapper's own body, distinct
   from Roulette's purely-noise ball click. `lose` (a bust segment wipes the
   WHOLE running multiplier) is a heavier hit than Roulette's dull thud —
   still short of Crash's reserved "biggest moment" boom.
   ============================================================ */

const E5 = 659.25
const GS5 = 830.61
const B5 = 987.77
const E6 = 1318.51
const GS6 = 1661.22

export const wheelSounds: SoundPack = {
  click: () => {
    tone(600, { dur: 0.055, type: 'triangle', gain: 0.1 })
    noise({ start: 0, dur: 0.022, gain: 0.09, freq: 2800, filterType: 'highpass', Q: 0.8 })
  },

  // A single peg-knock against the flapper — bandpass click for the
  // "snap", a hair of low body underneath so it reads as plastic hitting
  // plastic rather than a pure electronic blip.
  tick: () => {
    noise({ dur: 0.03, gain: 0.2, freq: 2300, filterType: 'bandpass', Q: 4 })
    tone(340, { dur: 0.03, type: 'triangle', gain: 0.05 })
  },

  win: () => chord([E5, GS5, B5], { dur: 0.22, stagger: 0.085, type: 'triangle', gain: 0.16, reverbSend: 0.14 }),

  // A jackpot segment — the biggest routine win in this game's own table.
  bigwin: () => {
    chord([E5, GS5, B5, E6], { dur: 0.3, stagger: 0.08, type: 'triangle', gain: 0.19, reverbSend: 0.25 })
    tone(E6, { start: 0.4, dur: 0.5, type: 'sine', gain: 0.16, reverbSend: 0.3 })
    tone(GS6, { start: 0.46, dur: 0.4, type: 'triangle', gain: 0.12, reverbSend: 0.3 })
  },

  // Manual cash-out mid-run — softer, descending-then-resolving, distinct
  // from a clean `win`.
  cashout: () => {
    tone(E6, { start: 0, dur: 0.16, type: 'triangle', gain: 0.14, freqEnd: B5, reverbSend: 0.16 })
    tone(E5, { start: 0.15, dur: 0.24, type: 'triangle', gain: 0.15, reverbSend: 0.18 })
  },

  // Bust — the whole running multiplier is wiped, so this hits harder than
  // a plain "no win" (Roulette's own `lose`).
  lose: () => {
    impact({ dur: 0.34, gain: 0.24, pitch: 110 })
    tone(160, { start: 0.05, dur: 0.28, type: 'sawtooth', gain: 0.1, freqEnd: 90 })
  },
}
