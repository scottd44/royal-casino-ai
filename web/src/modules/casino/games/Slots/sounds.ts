import { chord, impact, tone } from '@/platform/audio/engine'
import type { SoundPack } from '@/platform/audio/types'

/* ============================================================
   Slots' own themed pack — "Lucky Sevens", a classic brushed-metal cabinet.
   `tick` fires once per reel stop (SlotsGame.tsx's staggered 600/1020/1440ms
   timers) — a real mechanical THUNK (impact, mid-low pitch), not a chime.
   Wins lean toward a bright, ringing bell-machine fanfare — the timbre a
   real cabinet's payout bell would make — kept distinct from Gems' own
   crystalline/cosmic win pack below.
   ============================================================ */

const G5 = 783.99
const B5 = 987.77
const D6 = 1174.66
const G6 = 1567.98

export const slotsSounds: SoundPack = {
  click: () => tone(720, { dur: 0.045, type: 'square', gain: 0.09 }),

  // Reel-stop thunk — a mechanical mid-low impact, no melodic content.
  tick: () => impact({ dur: 0.14, gain: 0.2, pitch: 210 }),

  win: () => chord([G5, B5, D6], { dur: 0.22, stagger: 0.08, type: 'triangle', gain: 0.17, reverbSend: 0.14 }),

  // Triple/high-multiplier hit — the cabinet's own payout bell ringing out.
  bigwin: () => {
    chord([G5, B5, D6, G6], { dur: 0.28, stagger: 0.07, type: 'square', gain: 0.15, reverbSend: 0.22 })
    tone(G6, { start: 0.36, dur: 0.5, type: 'sine', gain: 0.17, reverbSend: 0.3 })
    tone(D6, { start: 0.42, dur: 0.4, type: 'triangle', gain: 0.12, reverbSend: 0.28 })
  },

  cashout: () => chord([B5, D6], { dur: 0.2, stagger: 0.09, type: 'triangle', gain: 0.15, reverbSend: 0.15 }),

  lose: () => tone(210, { dur: 0.26, type: 'sawtooth', gain: 0.1, freqEnd: 130 }),
}
