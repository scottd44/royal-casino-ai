import { chord, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Limbo's own pack — purely electronic, no noise/rattle texture at all
   (that's Dice's identity, not this game's). `tick` is a small square blip
   that nudges UP in pitch every hit (a tiny `freqEnd` bump), echoing the
   number's own climb toward the target during the anticipation animation.
   `bigwin` (target >= 10) gets a rising tail on top of the fanfare —
   "climbing off the scale" is the whole point of a big Limbo target.
   ============================================================ */

export const limboSounds: SoundPack = {
  click: () => tone(640, { dur: 0.035, type: 'square', gain: 0.07 }),

  // Digital "climb" blip — square, short, tiny upward freqEnd per the brief.
  tick: () => tone(720, { dur: 0.022, type: 'square', gain: 0.08, freqEnd: 800 }),

  win: () => chord([659.25, 830.61, 987.77], { dur: 0.16, type: 'triangle', stagger: 0.05, gain: 0.17, reverbSend: 0.06 }),

  bigwin: () => {
    chord([659.25, 830.61, 987.77, 1318.51], { dur: 0.22, type: 'triangle', stagger: 0.06, gain: 0.2, reverbSend: 0.25 })
    tone(1318.51, { start: 0.36, dur: 0.55, type: 'sine', gain: 0.16, freqEnd: 2093, reverbSend: 0.3 })
  },

  cashout: () => chord([830.61, 1318.51], { dur: 0.18, stagger: 0.07, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => tone(320, { dur: 0.18, type: 'sawtooth', gain: 0.13, freqEnd: 90 }),
}
