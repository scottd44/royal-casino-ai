import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ============================================================
   Sound — ported verbatim (synthesis, not markup) from js/core.js's
   `sound` IIFE (~lines 262-329). Same "one state, one writer" pattern as
   motionStore.ts/walletStore.ts: `useSoundStore` is the reactive half (the
   mute toggle button subscribes to it), `sound` below is the non-reactive
   imperative half every game calls `sound.play('win')` on, exactly like
   legacy's `Casino.sound.play('win')`.

   Tiny Web Audio synth — no external audio files. No licensing surface,
   no asset requests (works offline as a PWA), CSP-safe, and it's the exact
   set of tones this app already shipped once. `zustand/persist` wraps the
   mute flag in its own JSON envelope, so this doesn't literally share
   legacy's raw `"1"/"0"` value at the same key — it's a fresh preference,
   not a migrated one.
   ============================================================ */

export type SoundName = 'click' | 'tick' | 'win' | 'bigwin' | 'cashout' | 'lose'

let ctx: AudioContext | null = null

function audio(muted: boolean): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** One shaped tone. `start`/`dur` are seconds relative to now. */
function tone(muted: boolean, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) {
  const c = audio(muted)
  if (!c) return
  const t0 = c.currentTime + start
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// C-major-ish note set for pleasant chimes — legacy's own choice, kept.
const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

function library(muted: boolean): Record<SoundName, () => void> {
  return {
    click: () => tone(muted, 430, 0, 0.06, 'triangle', 0.1),
    tick: () => tone(muted, 880, 0, 0.028, 'square', 0.045),
    win: () => {
      tone(muted, C5, 0, 0.12, 'triangle', 0.16)
      tone(muted, E5, 0.09, 0.12, 'triangle', 0.16)
      tone(muted, G5, 0.18, 0.22, 'triangle', 0.18)
    },
    bigwin: () => {
      ;[C5, E5, G5, C6].forEach((f, i) => tone(muted, f, i * 0.085, 0.26, 'triangle', 0.19))
      tone(muted, C6, 0.42, 0.4, 'sine', 0.14)
    },
    cashout: () => {
      tone(muted, E5, 0, 0.1, 'triangle', 0.16)
      tone(muted, C6, 0.08, 0.2, 'triangle', 0.16)
    },
    lose: () => {
      tone(muted, 220, 0, 0.18, 'sawtooth', 0.12)
      tone(muted, 155, 0.13, 0.32, 'sawtooth', 0.12)
    },
  }
}

type SoundState = {
  muted: boolean
  toggleMute: () => void
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      muted: false,
      toggleMute: () => set((s) => ({ muted: !s.muted })),
    }),
    { name: 'royal_casino_sound_v1' },
  ),
)

/** Non-reactive reads/actions, for use outside React — every game calls
 *  `sound.play('win')` etc. exactly like legacy's `Casino.sound.play('win')`
 *  (js/games/*.js), so porting a game's sound cues is a near-literal copy. */
export const sound = {
  play: (name: SoundName) => {
    const muted = useSoundStore.getState().muted
    try {
      library(muted)[name]()
    } catch {
      // audio not available — silent, matches legacy's try/catch.
    }
  },
  toggleMute: () => useSoundStore.getState().toggleMute(),
  isMuted: () => useSoundStore.getState().muted,
}
