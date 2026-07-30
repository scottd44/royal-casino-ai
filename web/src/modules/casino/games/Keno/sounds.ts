import { chord, noise, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Keno's own pack — a crisp UI-select identity, since the player is
   actively tapping a 40-tile grid rather than watching a single readout.
   `tick` (fires on every pick + quick-pick) is a bright, fast confirm
   blip — a thin high-noise transient layered under a quick rising sine,
   closer to a touchscreen "select" sound than a musical note.
   ============================================================ */

export const kenoSounds: SoundPack = {
  click: () => {
    noise({ start: 0, dur: 0.03, gain: 0.13, freq: 2200, filterType: 'highpass', Q: 0.9 })
    tone(540, { start: 0, dur: 0.04, type: 'triangle', gain: 0.07 })
  },

  // Crisp digital "select" — a short bright transient, not a rattle
  // (that's Dice's texture) and not a rising square (Limbo's).
  tick: () => {
    noise({ dur: 0.014, gain: 0.1, freq: 3400, filterType: 'highpass', Q: 1 })
    tone(1300, { dur: 0.032, type: 'sine', gain: 0.15, freqEnd: 1600, attack: 0.002 })
  },

  win: () => chord([784, 987.77, 1174.66], { dur: 0.16, type: 'triangle', stagger: 0.045, gain: 0.18, reverbSend: 0.06 }),

  bigwin: () => {
    chord([784, 987.77, 1174.66, 1567.98], { dur: 0.22, type: 'triangle', stagger: 0.06, gain: 0.2, reverbSend: 0.25 })
    tone(1567.98, { start: 0.34, dur: 0.5, type: 'sine', gain: 0.17, freqEnd: 1975.53, reverbSend: 0.3 })
  },

  cashout: () => chord([987.77, 1567.98], { dur: 0.18, stagger: 0.07, type: 'triangle', gain: 0.16, reverbSend: 0.12 }),

  lose: () => {
    noise({ dur: 0.04, gain: 0.14, freq: 650, freqEnd: 200, filterType: 'lowpass', Q: 0.8 })
    tone(240, { dur: 0.15, type: 'square', gain: 0.12, freqEnd: 100 })
  },
}
