import { chord, tone, noise } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Blackjack — the flagship felt-table pack. click/tick are a tight
   highpass card snap layered with a bright chip clink. win is a warm
   C-major arpeggio with a light reverb tail; bigwin (a natural blackjack
   payout) is the same chord extended an octave higher with a longer,
   wetter tail and a sustained bell underneath — noticeably richer, not
   just louder. cashout (pushes/refunds) is a neutral, un-celebratory
   double chime. lose is a soft, low two-note thud — dignified, no buzzers.
   ============================================================ */

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

export const blackjackSounds: SoundPack = {
  click: () => {
    noise({ dur: 0.03, gain: 0.16, filterType: 'highpass', freq: 3200, Q: 0.7 })
    chord([2000, 2600], { dur: 0.05, type: 'triangle', gain: 0.09, stagger: 0.015 })
  },

  tick: () => {
    noise({ dur: 0.025, gain: 0.12, filterType: 'highpass', freq: 3000, Q: 0.7 })
    tone(2200, { dur: 0.04, type: 'triangle', gain: 0.07 })
  },

  win: () => chord([C5, E5, G5], { dur: 0.26, stagger: 0.09, type: 'triangle', gain: 0.18, reverbSend: 0.18 }),

  bigwin: () => {
    chord([C5, E5, G5, C6], { dur: 0.32, stagger: 0.08, type: 'triangle', gain: 0.2, reverbSend: 0.25 })
    tone(C6, { start: 0.4, dur: 0.5, type: 'sine', gain: 0.16, reverbSend: 0.3 })
  },

  cashout: () => chord([E5, C6], { dur: 0.22, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.12 }),

  lose: () => {
    tone(180, { dur: 0.22, type: 'sine', gain: 0.14, freqEnd: 120 })
    tone(120, { start: 0.14, dur: 0.3, type: 'sine', gain: 0.11, freqEnd: 80 })
  },
}
