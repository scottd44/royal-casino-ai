import { audioRandom, chord, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Plinko's own pack. The current build only ever calls `win`/`bigwin`/
   `lose` from the single Track-A resolution timeout in PlinkoGame.tsx —
   there is no per-peg-bounce moment wired up (Track B's canvas loop is
   cosmetic-only and deliberately never calls into sound, see that file's
   header), so `tick` isn't fired anywhere today. It's still implemented
   here (SoundPack requires all six) as the bright peg "boop" the brief
   describes, ready the moment a per-bounce hook is wired in.
   `bigwin` (mult >= 10) is this pack's biggest moment on purpose — Plinko's
   edge slots are the one place in these four games a multiplier can hit
   the hundreds, so the fanfare gets the richest reverb tail of the set.
   ============================================================ */

export const plinkoSounds: SoundPack = {
  click: () => tone(600, { dur: 0.035, type: 'triangle', gain: 0.07 }),

  // Unused today (no per-bounce call site — see file header) but kept
  // ready: a short bright peg "boop", tiny pitch variance per hit.
  tick: () => tone(760 + audioRandom() * 260, { dur: 0.05, type: 'triangle', gain: 0.13, freqEnd: 620 }),

  win: () => chord([740, 932.33, 1108.73], { dur: 0.16, type: 'triangle', stagger: 0.045, gain: 0.18, reverbSend: 0.06 }),

  bigwin: () => {
    chord([740, 932.33, 1108.73, 1480], { dur: 0.24, type: 'triangle', stagger: 0.065, gain: 0.21, reverbSend: 0.28 })
    tone(1480, { start: 0.38, dur: 0.55, type: 'sine', gain: 0.17, freqEnd: 1864.66, reverbSend: 0.3 })
  },

  cashout: () => chord([932.33, 1480], { dur: 0.18, stagger: 0.07, type: 'triangle', gain: 0.16, reverbSend: 0.12 }),

  lose: () => {
    noise({ dur: 0.05, gain: 0.15, freq: 600, freqEnd: 200, filterType: 'lowpass', Q: 0.8 })
    tone(250, { dur: 0.16, type: 'square', gain: 0.13, freqEnd: 100 })
  },
}
