import { useSoundStore } from './soundStore'

/* ============================================================
   The synthesis engine — every game's sound pack (games/<Game>/sounds.ts)
   is built ONLY from the primitives here. No external audio files: no
   licensing surface, no network requests (the app is a PWA and should
   work offline), CSP-safe, and it means a "professional grade" pass is a
   matter of better synthesis, not asset sourcing.

   Replaces the flat 6-tone `library` the first sound pass shipped
   (soundStore.ts's old `tone()`/`library` — see git history) with real
   primitives: oscillator tones with frequency sweeps, filtered noise
   (clicks, snaps, whooshes, rattles), layered chords, percussive impacts,
   and a shared reverb send so wins/jackpots get a real tail instead of
   sounding like a dry beep. Every game gets its OWN combination of these
   — that's what makes 25 games sound like 25 different tables instead of
   one shared blip set.

   Signal path: every primitive's gain envelope feeds `masterGain`, which
   splits to a `DynamicsCompressorNode` (so several overlapping tones —
   a chord, a chord layered under noise — never clip) AND, for anything
   that opts in via `reverbSend`, a shared `ConvolverNode` fed by a
   procedurally-generated impulse response (no IR file, same "no external
   assets" rule). Both paths sum at `destination`.
   ============================================================ */

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let compressor: DynamicsCompressorNode | null = null
let convolver: ConvolverNode | null = null
let reverbSendGain: GainNode | null = null
const noiseBufferCache = new Map<number, AudioBuffer>()

/** Captured at module load, BEFORE any test or game code could have
 *  reassigned `Math.random` (e.g. dom-contract.spec.ts mocks
 *  `window.Math.random` to force a deterministic outcome for a specific
 *  game's own RNG draw). Noise-buffer synthesis needs a LOT of random
 *  samples per buffer; drawing them from the live `Math.random()` would
 *  silently consume entries from the exact sequence a mocked test (or any
 *  future replay/seeded-RNG feature) depends on, shifting every draw after
 *  it — a sound effect firing before a game's own outcome draw would
 *  otherwise corrupt that draw. Reassigning the `random` property on the
 *  `Math` object doesn't affect a function reference already captured from
 *  it, so this stays genuinely random even if `Math.random` itself is
 *  swapped out later. */
const random: () => number = Math.random

/** The same isolated random source, exported for the rare pack (Dice,
 *  Plinko) that wants a touch of per-call pitch variation on a repeated
 *  tick sound — use this instead of a raw `Math.random()` call so a sound
 *  effect never draws from the same sequence a game's own RNG (or a test
 *  mocking it) depends on. */
export function audioRandom(): number {
  return random()
}

/** Builds the master bus once per AudioContext: masterGain -> compressor ->
 *  destination, with a parallel reverbSendGain -> convolver -> compressor
 *  tap for anything that wants a wet tail. */
function ensureGraph(c: AudioContext) {
  if (masterGain && compressor && convolver && reverbSendGain) return
  masterGain = c.createGain()
  masterGain.gain.value = 1
  compressor = c.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.knee.value = 24
  compressor.ratio.value = 6
  compressor.attack.value = 0.003
  compressor.release.value = 0.18
  masterGain.connect(compressor)

  convolver = c.createConvolver()
  convolver.buffer = buildImpulseResponse(c)
  reverbSendGain = c.createGain()
  reverbSendGain.gain.value = 1
  reverbSendGain.connect(convolver)
  convolver.connect(compressor)

  compressor.connect(c.destination)
}

/** A short exponentially-decaying stereo noise buffer, used as the
 *  convolver's impulse response — a procedural "room" tail instead of a
 *  recorded IR file. Built once per context. */
function buildImpulseResponse(c: AudioContext): AudioBuffer {
  const duration = 1.4
  const len = Math.floor(c.sampleRate * duration)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6)
      data[i] = (random() * 2 - 1) * decay
    }
  }
  return buf
}

function getCtx(): AudioContext | null {
  if (useSoundStore.getState().muted) return null
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
  ensureGraph(ctx)
  return ctx
}

function getNoiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const key = Math.round(seconds * 1000)
  let buf = noiseBufferCache.get(key)
  if (buf) return buf
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = random() * 2 - 1
  noiseBufferCache.set(key, buf)
  return buf
}

/** Connects a source through an optional pan + a gain envelope (fast
 *  exponential attack, exponential decay to silence) into the master bus,
 *  with an optional parallel send to the shared reverb convolver. */
function routeEnvelope(
  c: AudioContext,
  source: AudioNode,
  t0: number,
  dur: number,
  peakGain: number,
  opts: { pan?: number; reverbSend?: number; attack?: number },
) {
  const env = c.createGain()
  const attack = opts.attack ?? 0.01
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), t0 + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  let node: AudioNode = source
  if (opts.pan) {
    const panner = c.createStereoPanner()
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, opts.pan)), t0)
    node.connect(panner)
    node = panner
  }
  node.connect(env)
  env.connect(masterGain!)
  if (opts.reverbSend && reverbSendGain) {
    const send = c.createGain()
    send.gain.value = opts.reverbSend
    env.connect(send)
    send.connect(reverbSendGain)
  }
}

export type ToneOpts = {
  /** Seconds from now. */
  start?: number
  dur: number
  gain?: number
  type?: OscillatorType
  /** If set, frequency linearly ramps from `freq` to `freqEnd` over `dur`. */
  freqEnd?: number
  pan?: number
  /** 0..1 — how much of this tone bleeds into the shared reverb tail. */
  reverbSend?: number
  attack?: number
}

/** One shaped oscillator tone, optionally frequency-swept. The workhorse
 *  every melodic cue (chimes, wins, dice/roulette ticks) is built from. */
export function tone(freq: number, opts: ToneOpts): void {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + (opts.start ?? 0)
  const osc = c.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  if (opts.freqEnd) osc.frequency.linearRampToValueAtTime(opts.freqEnd, t0 + opts.dur)
  routeEnvelope(c, osc, t0, opts.dur, opts.gain ?? 0.16, opts)
  osc.start(t0)
  osc.stop(t0 + opts.dur + 0.03)
}

/** A stack of tones fired together (or lightly staggered) — chimes,
 *  fanfares, chip-clink stacks. */
export function chord(freqs: number[], opts: ToneOpts & { stagger?: number }): void {
  freqs.forEach((f, i) => tone(f, { ...opts, start: (opts.start ?? 0) + i * (opts.stagger ?? 0) }))
}

export type NoiseOpts = {
  start?: number
  dur: number
  gain?: number
  filterType?: BiquadFilterType
  freq: number
  freqEnd?: number
  Q?: number
  pan?: number
  reverbSend?: number
  attack?: number
}

/** Filtered white noise — clicks, card snaps, dice rattle, chip clatter,
 *  crash-boom rumble, whooshes. `filterType`/`freq` shape WHAT it sounds
 *  like; `freqEnd` sweeps the filter for a rising/falling whoosh. */
export function noise(opts: NoiseOpts): void {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + (opts.start ?? 0)
  const src = c.createBufferSource()
  src.buffer = getNoiseBuffer(c, opts.dur + 0.05)
  const filter = c.createBiquadFilter()
  filter.type = opts.filterType ?? 'bandpass'
  filter.frequency.setValueAtTime(opts.freq, t0)
  if (opts.freqEnd) filter.frequency.linearRampToValueAtTime(opts.freqEnd, t0 + opts.dur)
  filter.Q.value = opts.Q ?? 1
  src.connect(filter)
  routeEnvelope(c, filter, t0, opts.dur, opts.gain ?? 0.2, opts)
  src.start(t0)
  src.stop(t0 + opts.dur + 0.05)
}

/** A percussive hit: a filtered-noise transient layered over a short low
 *  sine thump. Mine explosions, dealer-chip thuds, tower/tile breaks. */
export function impact(opts: { start?: number; dur?: number; gain?: number; pitch?: number; reverbSend?: number }): void {
  const start = opts.start ?? 0
  const dur = opts.dur ?? 0.32
  const gain = opts.gain ?? 0.22
  noise({ start, dur: dur * 0.4, gain, freq: 1400, freqEnd: 220, filterType: 'lowpass', Q: 0.7, reverbSend: opts.reverbSend })
  tone(opts.pitch ?? 90, { start, dur, gain: gain * 0.9, type: 'sine', freqEnd: (opts.pitch ?? 90) * 0.6, reverbSend: opts.reverbSend })
}

/** Pure frequency sweep (rocket rise, roulette spin-down, coin-flip
 *  whoosh) — thin wrapper over `tone()` for readability at call sites. */
export function sweep(from: number, to: number, opts: Omit<ToneOpts, 'freqEnd'>): void {
  tone(from, { ...opts, freqEnd: to })
}
