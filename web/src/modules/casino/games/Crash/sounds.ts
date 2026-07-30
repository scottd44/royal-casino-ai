import { chord, impact, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Crash's own themed pack. `tick` isn't currently wired to a call site in
   CrashGame.tsx (the multiplier climb is driven by Track B's silent rAF
   loop, see that file's header), but the pack still implements it per the
   required SoundPack shape: a short, bright ASCENDING blip (square, a small
   upward freqEnd bump) so a rapid series of identical calls would still
   read as "climbing" even though each individual call is fixed.

   `cashout` (manual/auto cash-out below 5x) is a soft descending-then-
   resolving chime — a relieved "you got out in time", distinct from the
   bigger fanfare `bigwin` gets for a 5x+ cash-out. `lose` (busted before
   cashing out) is the BIGGEST moment in this whole batch: a low-pitched
   impact layered with a noise burst sweeping down through a lowpass filter
   — a real boom/crash, not a generic buzz.
   ============================================================ */

const F5 = 698.46
const A5 = 880
const C6 = 1046.5
const F6 = 1396.91

export const crashSounds: SoundPack = {
  click: () => tone(640, { dur: 0.045, type: 'triangle', gain: 0.1 }),

  // Bright ascending blip — the multiplier "climbing" read, see file header.
  tick: () => tone(760, { dur: 0.045, type: 'square', gain: 0.08, freqEnd: 860 }),

  // Cash out below the 5x bigwin threshold — a relieved, resolving descent.
  cashout: () => {
    tone(C6, { start: 0, dur: 0.16, type: 'triangle', gain: 0.14, freqEnd: A5, reverbSend: 0.16 })
    tone(F5, { start: 0.15, dur: 0.26, type: 'triangle', gain: 0.15, reverbSend: 0.2 })
  },

  win: () => chord([F5, A5, C6], { dur: 0.22, stagger: 0.08, type: 'triangle', gain: 0.16, reverbSend: 0.14 }),

  // A 5x+ cash-out — a rocket-fanfare ascending arpeggio with real reverb.
  bigwin: () => {
    chord([F5, A5, C6, F6], { dur: 0.3, stagger: 0.075, type: 'square', gain: 0.17, reverbSend: 0.26 })
    tone(F6, { start: 0.38, dur: 0.5, type: 'sine', gain: 0.17, reverbSend: 0.3 })
  },

  // Busted — the biggest, most punishing moment in the whole batch: a low
  // impact thump layered with a noise burst sweeping down through a lowpass
  // filter for a genuine boom/crash rather than a generic buzz.
  lose: () => {
    impact({ dur: 0.5, gain: 0.3, pitch: 72 })
    noise({ start: 0, dur: 0.4, gain: 0.26, freq: 2200, freqEnd: 90, filterType: 'lowpass', Q: 0.5 })
  },
}
