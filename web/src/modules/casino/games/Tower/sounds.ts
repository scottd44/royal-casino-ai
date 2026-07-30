import { chord, impact, noise, sweep, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Tower — a resonant stone-and-bell identity: each climbed row rings a
   short ascending chime, cashing out mid-climb rings a warm settled
   chime, and reaching the top fires a full bell peal with a real
   reverb tail. A mine underfoot is a real structural collapse, not a
   beep.
   ============================================================ */

const D5 = 587.33
const FS5 = 739.99
const A5 = 880
const D6 = 1174.66

export const towerSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.02, gain: 0.11, freq: 2200, filterType: 'highpass', Q: 0.9 })
    tone(500, { start: 0, dur: 0.035, type: 'triangle', gain: 0.07 })
  },

  tick: () => {
    sweep(620, 880, { start: 0, dur: 0.13, type: 'triangle', gain: 0.16 })
    tone(D6, { start: 0.04, dur: 0.1, type: 'sine', gain: 0.08 })
  },

  win: () => chord([D5, FS5, A5], { dur: 0.22, stagger: 0.075, type: 'triangle', gain: 0.17, reverbSend: 0.12 }),

  bigwin: () => {
    chord([D5, FS5, A5, D6], { dur: 0.32, stagger: 0.09, type: 'triangle', gain: 0.19, reverbSend: 0.25 })
    tone(D6, { start: 0.46, dur: 0.55, type: 'sine', gain: 0.16, reverbSend: 0.3 })
  },

  cashout: () => chord([FS5, D6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.17, reverbSend: 0.15 }),

  lose: () => {
    impact({ dur: 0.34, gain: 0.25, pitch: 78, reverbSend: 0.1 })
    noise({ start: 0.05, dur: 0.22, gain: 0.1, freq: 500, freqEnd: 140, filterType: 'lowpass', Q: 0.5 })
  },
}
