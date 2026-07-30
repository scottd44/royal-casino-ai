import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Battleship — a sonar/naval identity. `tick` is the sonar-ping "hit
   confirmed" cue (fired on a hit-not-sunk, a fresh deploy, and a bought
   shot); `cashout` marks a ship going down mid-round; `bigwin` is the
   full-fleet grand-jackpot fanfare with a real reverb tail; a round
   with nothing to show for it lands on the same real impact `lose`
   shares with every other reveal game.
   ============================================================ */

const B4 = 493.88
const D5 = 587.33
const FS5 = 739.99
const B5 = 987.77

export const battleshipSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.02, gain: 0.11, freq: 2400, filterType: 'highpass', Q: 1 })
    tone(640, { start: 0, dur: 0.03, type: 'sine', gain: 0.07 })
  },

  tick: () => tone(720, { dur: 0.1, type: 'sine', freqEnd: 1100, gain: 0.15 }),

  win: () => chord([B4, D5, FS5], { dur: 0.22, stagger: 0.075, type: 'triangle', gain: 0.17, reverbSend: 0.12 }),

  bigwin: () => {
    chord([B4, D5, FS5, B5], { dur: 0.32, stagger: 0.09, type: 'triangle', gain: 0.19, reverbSend: 0.25 })
    tone(B5, { start: 0.46, dur: 0.55, type: 'sine', gain: 0.16, reverbSend: 0.3 })
  },

  cashout: () => chord([D5, FS5], { dur: 0.22, stagger: 0.085, type: 'triangle', gain: 0.17, reverbSend: 0.15 }),

  lose: () => impact({ dur: 0.34, gain: 0.24, pitch: 88, reverbSend: 0.06 }),
}
