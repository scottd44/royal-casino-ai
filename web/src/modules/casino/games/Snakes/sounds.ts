import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Snakes — a jungle/reptile identity. `tick` (the dice-roll cue) is a
   dry double-clack like rattling dice; `win` fires on every safe tile
   landed — the per-roll reward that has to feel good dozens of times a
   session — as a bright rising two-note chime; the snake's own bite is
   a hiss immediately followed by a real punch, not a squeak.
   ============================================================ */

const A4 = 440
const C5 = 523.25
const E5 = 659.25
const A5 = 880

export const snakesSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.022, gain: 0.11, freq: 2200, filterType: 'highpass', Q: 1 })
    tone(560, { start: 0, dur: 0.03, type: 'triangle', gain: 0.06 })
  },

  tick: () => {
    noise({ start: 0, dur: 0.035, gain: 0.16, freq: 1900, filterType: 'bandpass', Q: 1.6 })
    noise({ start: 0.05, dur: 0.035, gain: 0.14, freq: 1700, filterType: 'bandpass', Q: 1.6 })
  },

  win: () => chord([C5, E5], { dur: 0.15, stagger: 0.05, type: 'triangle', gain: 0.17 }),

  bigwin: () => {
    chord([A4, C5, E5, A5], { dur: 0.3, stagger: 0.08, type: 'triangle', gain: 0.19, reverbSend: 0.22 })
    tone(A5, { start: 0.42, dur: 0.48, type: 'sine', gain: 0.16, reverbSend: 0.28 })
  },

  cashout: () => chord([E5, A5], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.17, reverbSend: 0.15 }),

  lose: () => {
    noise({ start: 0, dur: 0.12, gain: 0.15, freq: 5200, filterType: 'bandpass', Q: 2.2 })
    impact({ start: 0.08, dur: 0.32, gain: 0.25, pitch: 80, reverbSend: 0.06 })
  },
}
