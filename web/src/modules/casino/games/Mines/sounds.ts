import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Mines — a crystalline, digital gem-vault identity: bright glassy
   chimes for a safe reveal and every payout, a hard percussive
   detonation for the mine that ends the round. Distinct from the
   neutral defaultPack and every other reveal game's own pack.
   ============================================================ */

const E5 = 659.25
const GS5 = 830.61
const B5 = 987.77
const E6 = 1318.51

export const minesSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.025, gain: 0.12, freq: 2600, filterType: 'highpass', Q: 1.1 })
    tone(920, { start: 0, dur: 0.03, type: 'triangle', gain: 0.07 })
  },

  tick: () => chord([B5, E6], { dur: 0.1, stagger: 0.03, type: 'sine', gain: 0.15 }),

  win: () => chord([E5, GS5, B5], { dur: 0.22, stagger: 0.075, type: 'triangle', gain: 0.17, reverbSend: 0.12 }),

  bigwin: () => {
    chord([E5, GS5, B5, E6], { dur: 0.3, stagger: 0.08, type: 'triangle', gain: 0.19, reverbSend: 0.22 })
    tone(E6, { start: 0.42, dur: 0.5, type: 'sine', gain: 0.16, reverbSend: 0.3 })
  },

  cashout: () => chord([GS5, E6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.17, reverbSend: 0.16 }),

  lose: () => {
    noise({ start: 0, dur: 0.05, gain: 0.16, freq: 3200, filterType: 'highpass', Q: 0.6 })
    impact({ dur: 0.36, gain: 0.26, pitch: 85, reverbSend: 0.08 })
  },
}
