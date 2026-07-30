import { chord, tone, noise } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Baccarat — `tick` fires once per card during the card-by-card reveal
   (every 340ms), so it stays a single crisp highpass snap, no chip layer
   riding on top of it repeatedly. click carries the chip clink instead.
   win is a D-major chime; bigwin (an 8:1 Tie hit — the rarest, richest
   payout at this table) is the same chord extended with a sustained bell
   and a longer reverb tail. cashout (a Player/Banker push) is a soft
   neutral double-chime. lose is a low, dignified thud.
   ============================================================ */

const D5 = 587.33
const Fs5 = 739.99
const A5 = 880.0
const D6 = 1174.66

export const baccaratSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.03, gain: 0.15, filterType: 'highpass', freq: 3400, Q: 0.7 })
    chord([2100, 2700], { dur: 0.05, type: 'sine', gain: 0.08, stagger: 0.015 })
  },

  tick: () => noise({ dur: 0.03, gain: 0.15, filterType: 'highpass', freq: 3200, Q: 0.8 }),

  win: () => chord([D5, Fs5, A5], { dur: 0.26, stagger: 0.09, type: 'triangle', gain: 0.18, reverbSend: 0.18 }),

  bigwin: () => {
    chord([D5, Fs5, A5, D6], { dur: 0.34, stagger: 0.08, type: 'triangle', gain: 0.21, reverbSend: 0.25 })
    tone(D6, { start: 0.42, dur: 0.5, type: 'sine', gain: 0.17, reverbSend: 0.3 })
  },

  cashout: () => chord([Fs5, D6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => {
    tone(175, { dur: 0.22, type: 'sine', gain: 0.14, freqEnd: 115 })
    tone(115, { start: 0.14, dur: 0.3, type: 'sine', gain: 0.11, freqEnd: 78 })
  },
}
