import { chord, noise, tone } from './engine'
import type { SoundPack } from './types'

/* ============================================================
   The fallback pack — used for the Lobby (no table is "current"), the
   mute button's own unmute feedback, and as the click-cue fallback for any
   route the per-game pack registry doesn't recognise. Every real game gets
   its OWN themed pack (games/<Game>/sounds.ts); this one deliberately
   stays neutral/generic rather than themed to any particular game.
   ============================================================ */

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

export const defaultPack: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.03, gain: 0.14, freq: 2200, filterType: 'highpass', Q: 0.9 })
    tone(520, { start: 0, dur: 0.045, type: 'triangle', gain: 0.08 })
  },

  tick: () => tone(880, { dur: 0.03, type: 'square', gain: 0.05 }),

  win: () => chord([C5, E5, G5], { dur: 0.24, stagger: 0.09, type: 'triangle', gain: 0.17, reverbSend: 0.12 }),

  bigwin: () => {
    chord([C5, E5, G5, C6], { dur: 0.3, stagger: 0.085, type: 'triangle', gain: 0.19, reverbSend: 0.2 })
    tone(C6, { start: 0.42, dur: 0.45, type: 'sine', gain: 0.15, reverbSend: 0.3 })
  },

  cashout: () => chord([E5, C6], { dur: 0.22, stagger: 0.08, type: 'triangle', gain: 0.17, reverbSend: 0.14 }),

  lose: () => {
    tone(220, { dur: 0.2, type: 'sawtooth', gain: 0.12, freqEnd: 160 })
    tone(155, { start: 0.13, dur: 0.34, type: 'sawtooth', gain: 0.12, freqEnd: 110 })
  },
}
