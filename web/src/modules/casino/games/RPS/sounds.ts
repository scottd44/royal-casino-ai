import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Rock Paper Scissors — sound identity: punchy, cartoonish throw-and-land
   hits. Rounds resolve in under a second and a streak chains throw after
   throw, so nothing here lingers. A tie is a quick, neutral, slightly
   comedic "hm" wobble (the classic rock-paper-scissors-shoot anticlimax);
   wins are an instant bright punch, not a chime; a loss is a light,
   fast-deflating thud rather than a doom stinger, since the player will
   eat plenty of individual losses on the way to a streak.
   ============================================================ */

const A4 = 440
const CS5 = 554.37
const E5 = 659.25
const A5 = 880

export const rpsSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.035, gain: 0.13, freq: 2400, filterType: 'highpass', Q: 1 })
    tone(500, { dur: 0.04, type: 'triangle', gain: 0.08 })
  },

  // Tie — throw again, streak safe. A quick neutral "hm": a short
  // down-then-up wobble, comedic rather than a real result cue.
  tick: () => {
    tone(392, { dur: 0.05, type: 'square', gain: 0.09, freqEnd: 330 })
    tone(392, { start: 0.055, dur: 0.06, type: 'square', gain: 0.08, freqEnd: 420 })
  },

  // Punchy, immediate 2-note rise — fast attack, very short dur.
  win: () => chord([A4, E5], { dur: 0.1, stagger: 0.045, type: 'triangle', gain: 0.2, attack: 0.004 }),

  // Same punch, brighter/richer with a 3rd note and a light reverb touch.
  bigwin: () =>
    chord([A4, E5, A5], {
      dur: 0.12,
      stagger: 0.05,
      type: 'triangle',
      gain: 0.21,
      attack: 0.004,
      reverbSend: 0.12,
    }),

  // Quick, sharp, deflating whomp — a fast low thud, never a heavy doom hit.
  lose: () => impact({ dur: 0.16, gain: 0.16, pitch: 130 }),

  // Locked-it-in chime for banking a streak — clean and distinct from win.
  cashout: () => chord([CS5, A5], { dur: 0.16, stagger: 0.06, type: 'triangle', gain: 0.19, reverbSend: 0.1 }),
}
