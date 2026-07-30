import { useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal, motionPolicy } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'

/* ============================================================
   Wheel — ported from js/games/wheel.js. Pick a risk level and spin. Every
   winning spin MULTIPLIES the running multiplier; a bust segment wipes it
   out. Cash out any time between spins to bank bet × multiplier.

   RISKS/buildSegments below are copied verbatim from wheel.js:24-38 — real
   payout math (bust-count + winning tiers `[mult, count, colorKey]`, tuned
   so Σmult·count = S = 30 segments), not simplified for the port. The
   Fisher-Yates shuffle is verbatim too, so the segment LAYOUT is randomised
   per risk pick exactly like legacy, not just the spin result.

   AGENT CONTRACT (agent-ui.js:927-982, `  wheel:` key) — every one of these
   is load-bearing:
     detect()  !!$("#wheelBtn") && !!$("#wheelStage")
     play()    clicks `[data-risk="low|medium|high|risky"]` (a DATA
               ATTRIBUTE, never an id), applyBet(), clicks #wheelBtn,
               `sleep(200)`, `waitFor(() => !$("#wheelBtn").disabled, 7000)`.
               Then loops (<=12x) while `#cashBtn` is enabled: reads
               `parseFloat($("#curMult").textContent)`, the raw text of
               `#cashVal` and `#bustChance`, decides spin-again vs cashout
               (m >= 3 by default), clicks `#wheelBtn` again or `#cashBtn`,
               waiting the same way each time.
   #curMult / #cashVal / #bustChance are all in contractIds.ts's
   NUMERIC_CONTRACT_IDS — plain text nodes below, never AnimatedNumber,
   matching every other ported game's handling of that set (see Dice/Mines'
   own notes on the same guard).

   *** TRUTH VS. FEEL — the same split every other custom-render game in
   this batch (Crash, Plinko) uses, restated for Wheel's shape ***
   `spin()` decides the landing segment SYNCHRONOUSLY (cheat-rigging
   included, ported verbatim from legacy's `Casino.cheat.win()` branch) and
   computes the exact rotation needed to land that segment's centre under
   the fixed pointer, before anything animates. Resolution — `settle(idx)` —
   is scheduled with a plain `setTimeout` keyed to a fixed duration
   (`SETTLE_DELAY_MS`, mirroring legacy's `SPIN_MS + 100`, wheel.js:224),
   NOT gated on the CSS transition's own `transitionend`/`onAnimationComplete`
   firing. A backgrounded tab can and does drop transition-end events; a
   `setTimeout` cannot be suspended in the same way (it just runs late, still
   on schedule) — so the agent's `waitFor(() => !$("#wheelBtn").disabled, ...)`
   can never hang on a paint that never happened. The CSS transition below is
   Track B: it may look choppy or freeze mid-tween in an unfocused tab, and
   that is fine — it never gates truth.

   Legacy drives the spin with GSAP's `power4.out` easing (4.2s) for real
   rim-weight momentum: fast start, long asymptotic bleed-off. This build has
   no GSAP dependency, so the same FEEL is approximated with a plain CSS
   `transition` using a front-loaded, long-tailed bezier
   (`cubic-bezier(0.08, 0.82, 0.17, 1)`) over the same 4.2s — tuned to spend
   most of its motion in the first third and taper the rest, rather than a
   linear/ease-out-quad spin that would read as "playing an animation."
   ============================================================ */

const HOUSE_EDGE = 0.99
const S = 30 // segments per wheel
const SEG_DEG = 360 / S
const SPIN_MS = 4200
const SETTLE_DELAY_MS = SPIN_MS + 100
const SPIN_EASE = 'cubic-bezier(0.08, 0.82, 0.17, 1)'

/**
 * The pointer's tick track — purely cosmetic (Track B), like the rotor
 * itself. A real cabinet's flapper is knocked sideways by every peg that
 * passes under it and springs back, so the ticks have to crowd the fast
 * opening of the spin and thin out as the wheel slows, or it reads as a
 * vibration rather than a wheel.
 *
 * Ticks are spaced by ROTATION, not by time: tick k fires when the wheel has
 * turned k/N of its total, so the emitted percentage is the spin easing
 * inverted at that point. `SPIN_EASE` is approximated as 1-(1-t)^2.2 — close
 * enough for a decoration, and it keeps this a pure string builder with no
 * bezier solver. Amplitude decays too: a slow flapper barely lifts.
 */
const POINTER_TICKS = 34
function pointerTickKeyframes(): string {
  const stops: string[] = []
  const invert = (p: number) => 1 - Math.pow(1 - p, 1 / 2.2)
  for (let k = 0; k < POINTER_TICKS; k++) {
    const t0 = invert(k / POINTER_TICKS)
    const t1 = invert((k + 1) / POINTER_TICKS)
    const amp = 14 - 9 * (k / POINTER_TICKS)
    // knocked back by the peg, then sprung past centre before the next one
    stops.push(`${(t0 * 100).toFixed(2)}% { transform: rotate(${(-amp).toFixed(1)}deg); }`)
    stops.push(`${((t0 + (t1 - t0) * 0.55) * 100).toFixed(2)}% { transform: rotate(1.4deg); }`)
  }
  stops.push('100% { transform: rotate(0deg); }')
  return stops.join('\n          ')
}
const FLASH_MS = 1100
const THUNK_MS = 650

type ColorKey = 't1' | 't2' | 't3' | 'jack' | 'bust'

const COLORS: Record<ColorKey, string> = {
  t1: '#f0883e', // orange (smallest wins)
  t2: '#4d8cff', // blue
  t3: '#3ecf8e', // green
  jack: '#e6c15a', // yellow (jackpot)
  bust: '#333b49', // losing segment
}

type RiskKey = 'low' | 'medium' | 'high' | 'risky'

type RiskDef = { label: string; bust: number; tiers: [number, number, ColorKey][] }

// Verbatim from wheel.js:24-29. Counts + bust = S; Σ(mult·count) = S, so
// every risk is fair per spin (E[m]=1).
const RISKS: Record<RiskKey, RiskDef> = {
  low: {
    label: 'Low',
    bust: 10,
    tiers: [
      [1.1, 10, 't1'],
      [1.4, 6, 't2'],
      [1.9, 3, 't3'],
      [4.9, 1, 'jack'],
    ],
  },
  medium: {
    label: 'Medium',
    bust: 17,
    tiers: [
      [1.5, 7, 't1'],
      [2, 3, 't2'],
      [3, 2, 't3'],
      [7.5, 1, 'jack'],
    ],
  },
  high: {
    label: 'High',
    bust: 21,
    tiers: [
      [2, 5, 't1'],
      [3, 2, 't2'],
      [5, 1, 't3'],
      [9, 1, 'jack'],
    ],
  },
  risky: {
    label: 'Risky',
    bust: 25,
    tiers: [
      [2, 2, 't1'],
      [4, 1, 't2'],
      [8, 1, 't3'],
      [14, 1, 'jack'],
    ],
  },
}

const RISK_KEYS: RiskKey[] = ['low', 'medium', 'high', 'risky']

// Fixed positions for the carnival-style rim bulbs, evenly spaced (24
// lights) — cosmetic only, computed once at module scope so they don't
// re-randomize on every render.
const RIM_LIGHT_COUNT = 24
const RIM_LIGHT_ANGLES = Array.from({ length: RIM_LIGHT_COUNT }, (_, i) => (360 / RIM_LIGHT_COUNT) * i)

type Seg = { mult: number; color: ColorKey; bust: boolean }

/** Verbatim from wheel.js:31-38, including the Fisher-Yates shuffle — the
 *  segment LAYOUT is randomised per risk pick, not just the spin outcome. */
function buildSegments(riskKey: RiskKey): Seg[] {
  const r = RISKS[riskKey]
  const segs: Seg[] = []
  for (let i = 0; i < r.bust; i++) segs.push({ mult: 0, color: 'bust', bust: true })
  r.tiers.forEach(([m, c, col]) => {
    for (let i = 0; i < c; i++) segs.push({ mult: m, color: col, bust: false })
  })
  for (let i = segs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[segs[i], segs[j]] = [segs[j], segs[i]]
  }
  return segs
}

/** Angle 0 = 12 o'clock, increasing clockwise (matches `transform: rotate()`'s
 *  own positive-is-clockwise convention, so the pointer at the top of the
 *  stage always reads the segment the disc's rotation actually lands on). */
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)]
}

function wedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const largeArc = a1 - a0 > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`
}

type HistoryRow = { id: number; mult: number }
type Stage = 'idle' | 'spinning' | 'win' | 'bust'

export default function WheelGame() {
  const betRef = useBetRef()
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const [risk, setRiskState] = useState<RiskKey>('medium')
  const [segments, setSegments] = useState<Seg[]>(() => buildSegments('medium'))
  const [mult, setMult] = useState(0)
  const [active, setActive] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [lastSpinLabel, setLastSpinLabel] = useState('—')
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [flashIdx, setFlashIdx] = useState<number | null>(null)
  const [thunkTick, setThunkTick] = useState(0)

  // Round truth kept in refs so a settle() closure never has to guess what
  // was true at spin-click time — mirrors Crash/Plinko's own ref-held Track
  // A state.
  const betAmountRef = useRef(0)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyIdRef = useRef(0)

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    },
    [],
  )

  function setRisk(r: RiskKey) {
    if (active || spinning) return
    setRiskState(r)
    setSegments(buildSegments(r))
  }

  function spin() {
    if (spinning) return
    let stake = betAmountRef.current
    if (!active) {
      // First spin of a round — place the bet.
      stake = readBet(betRef)
      if (!placeBet(stake)) {
        toast('Not enough cash for that bet.', 'lose')
        return
      }
      betAmountRef.current = stake
    }

    setSpinning(true)
    setStage('spinning')
    setFlashIdx(null)

    let idx = Math.floor(Math.random() * S)
    // Rigged odds: land on a winning (non-bust) segment.
    if (cheatWin()) {
      const winIdx = segments.map((s, i) => (s.bust ? -1 : i)).filter((i) => i >= 0)
      if (winIdx.length) idx = winIdx[Math.floor(Math.random() * winIdx.length)]
    }

    const centerAngle = idx * SEG_DEG + SEG_DEG / 2
    const delta = (((-centerAngle - rotation) % 360) + 360) % 360
    const nextRotation = rotation + delta + 360 * 5
    setRotation(nextRotation)

    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
    // Track A: truth resolves on a plain wall-clock timer, never on the CSS
    // transition's own completion — see the file header.
    settleTimerRef.current = setTimeout(() => settle(idx), SETTLE_DELAY_MS)
  }

  function settle(idx: number) {
    settleTimerRef.current = null
    setSpinning(false)
    setFlashIdx(idx)
    setThunkTick((t) => t + 1)
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashIdx(null), FLASH_MS)

    const seg = segments[idx]

    if (seg.bust) {
      // Bust — the whole multiplier (and the bet) is wiped.
      setStage('bust')
      historyIdRef.current += 1
      setHistory((h) => [...h.slice(-13), { id: historyIdRef.current, mult: 0 }])
      setLastSpinLabel('bust')
      toast(`Busted — lost ${money(betAmountRef.current)}.`, 'lose')
      setActive(false)
      setMult(0)
      return
    }

    // Winning spin — compound the multiplier.
    setMult((prev) => {
      const next = active ? prev * seg.mult : seg.mult
      return next
    })
    setActive(true)
    setStage('win')
    historyIdRef.current += 1
    setHistory((h) => [...h.slice(-13), { id: historyIdRef.current, mult: seg.mult }])
    setLastSpinLabel('×' + seg.mult)
  }

  function cashOut() {
    if (!active || spinning || mult <= 0) return
    const winnings = Math.floor(betAmountRef.current * mult * HOUSE_EDGE)
    payout(winnings)
    toast(`Cashed out ${mult.toFixed(2)}× — +${fmt(winnings - betAmountRef.current)} profit!`, 'win')
    setActive(false)
    setMult(0)
    setStage('idle')
    setFlashIdx(null)
  }

  const r = RISKS[risk]
  const bustPct = Math.round((r.bust / S) * 100)

  const hubText = spinning ? '…' : stage === 'bust' ? 'BUST' : active ? mult.toFixed(2) + '×' : '—'
  const hubColor =
    stage === 'bust'
      ? 'var(--color-red)'
      : stage === 'win' && active
        ? 'var(--color-green)'
        : 'var(--color-text)'

  const stageGlow =
    stage === 'spinning'
      ? { border: 'color-mix(in srgb, var(--color-purple) 45%, var(--glass-line))', shadow: '0 0 60px -14px color-mix(in srgb, var(--color-purple) 45%, transparent)' }
      : stage === 'win'
        ? { border: 'color-mix(in srgb, var(--color-green) 45%, var(--glass-line))', shadow: '0 0 60px -14px color-mix(in srgb, var(--color-green) 45%, transparent)' }
        : stage === 'bust'
          ? { border: 'color-mix(in srgb, var(--color-red) 50%, var(--glass-line))', shadow: '0 0 60px -12px color-mix(in srgb, var(--color-red) 50%, transparent)' }
          : { border: 'var(--glass-line)', shadow: 'none' }

  const easeAvailable = motionPolicy() === 'full'
  const rotorTransition = spinning
    ? easeAvailable
      ? `transform ${SPIN_MS}ms ${SPIN_EASE}`
      : 'transform 250ms ease-out'
    : 'none'

  return (
    <div>
      <PageHead
        title="Wheel"
        sub="Pick a risk level and spin. Every winning spin multiplies your running multiplier — keep spinning to grow it, but a bust segment wipes it out. Cash out any time to bank it."
        icon="target"
      />

      <GameLayout>
        <Panel>
          <div className="wheel-wrap flex flex-col items-center gap-5">
            <div
              id="wheelStage"
              data-state={stage === 'win' || stage === 'bust' ? 'idle' : stage}
              className={`wheel-face relative flex items-center justify-center rounded-2xl transition-[box-shadow,border-color] duration-500 ${
                stage === 'bust' ? 'wheel-shake' : ''
              }`}
              style={{
                width: '100%',
                maxWidth: 340,
                aspectRatio: '1 / 1',
                background:
                  'radial-gradient(120% 100% at 50% 20%, color-mix(in srgb, #10182c 88%, transparent), var(--color-panel-2) 70%)',
                border: `1px solid ${stageGlow.border}`,
                boxShadow: `inset 0 0 40px rgba(0,0,0,0.45), ${stageGlow.shadow}`,
              }}
            >
              {/* Pointer — a real beveled "needle" (pin shape tapering to a
                  sharp tip), not a rotated square. Rendered as SVG so the
                  taper/highlight/rivet are actual geometry, not a CSS-hack
                  triangle. A small dark mounting bracket pins it to the rim
                  bezel for the "physically anchored" read the flat version
                  lacked. Purely cosmetic — never read by the agent contract
                  (see file header: only #wheelBtn/#cashBtn/#curMult etc.). */}
              {/* The mount is a separate element from the needle: the tick
                  animation writes `transform`, and a CSS animation outranks
                  an inline style, so a needle carrying its own
                  translateX(-50%) would snap 17px right the moment a spin
                  started. Centring lives on the wrapper, rotation on the
                  needle, and the two never contend. */}
              <div
                className="absolute z-30"
                style={{ top: -12, left: '50%', width: 34, height: 46, transform: 'translateX(-50%)' }}
              >
              <svg
                className={`wheel-pointer ${spinning ? 'wheel-pointer-tick' : ''}`}
                style={{
                  width: 34,
                  height: 46,
                  // pivots at the bracket, so the TIP is what swings
                  transformOrigin: '50% 13%',
                  filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.6)) drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
                }}
                viewBox="0 0 34 46"
              >
                <defs>
                  <linearGradient id="pointerBody" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fff6da" />
                    <stop offset="38%" stopColor="#f6d97a" />
                    <stop offset="72%" stopColor="#c99a2e" />
                    <stop offset="100%" stopColor="#8a5f14" />
                  </linearGradient>
                  <linearGradient id="pointerBracket" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4a5468" />
                    <stop offset="100%" stopColor="#161b26" />
                  </linearGradient>
                </defs>
                {/* mounting bracket, sits on the rim */}
                <rect x="11" y="0" width="12" height="10" rx="3" fill="url(#pointerBracket)" />
                {/* needle body: rounded dome tapering to a point at the wheel */}
                <path
                  d="M17 46 L6 15 A11 11 0 1 1 28 15 Z"
                  fill="url(#pointerBody)"
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
                {/* bevel highlight running down the near edge */}
                <path
                  d="M13 8 Q9.5 12 17 40"
                  fill="none"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                {/* rivet */}
                <circle cx="17" cy="14" r="3.4" fill="rgba(20,14,2,0.28)" />
                <circle cx="15.8" cy="12.8" r="1.1" fill="rgba(255,255,255,0.75)" />
              </svg>
              </div>

              {/* Rim bezel */}
              <div
                className="absolute rounded-full"
                style={{
                  inset: '6%',
                  boxShadow:
                    'inset 0 0 0 3px rgba(255,255,255,0.06), inset 0 2px 10px rgba(0,0,0,0.5), 0 10px 30px -8px rgba(0,0,0,0.6)',
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
              />

              {/* Rim lights — a ring of carnival-wheel bulbs fixed to the
                  frame (NOT the rotor, same as a real cabinet's lights).
                  Chases while spinning, glows warm/idle at rest, purely
                  cosmetic (Track B). */}
              <div className="wheel-rimlights absolute inset-0 z-10" style={{ pointerEvents: 'none' }}>
                {RIM_LIGHT_ANGLES.map((deg, i) => {
                  const rad = (deg * Math.PI) / 180
                  const cx = 50 + 47 * Math.sin(rad)
                  const cy = 50 - 47 * Math.cos(rad)
                  return (
                    <span
                      key={i}
                      className={spinning ? 'wheel-bulb wheel-bulb-chase' : 'wheel-bulb'}
                      style={{
                        left: `${cx}%`,
                        top: `${cy}%`,
                        animationDelay: spinning ? `${(i / RIM_LIGHT_ANGLES.length) * 900}ms` : `${i * 90}ms`,
                      }}
                    />
                  )
                })}
              </div>

              {/* The rotor — Track B. See file header for why settle() never
                  waits on this transition finishing. */}
              <div
                className="wheel-rotor absolute"
                style={{
                  inset: '6%',
                  transform: `rotate(${rotation}deg)`,
                  transition: rotorTransition,
                  willChange: 'transform',
                }}
              >
                <svg viewBox="0 0 200 200" className="h-full w-full" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
                  {segments.map((seg, i) => {
                    const a0 = i * SEG_DEG
                    const a1 = (i + 1) * SEG_DEG
                    const isFlash = flashIdx === i
                    return (
                      <path
                        key={i}
                        d={wedgePath(100, 100, 94, a0, a1)}
                        fill={COLORS[seg.color]}
                        stroke={isFlash ? '#fffaf0' : 'rgba(5,8,14,0.85)'}
                        strokeWidth={isFlash ? 2.4 : 1.1}
                        style={{
                          opacity: isFlash ? 1 : seg.bust ? 0.92 : 0.96,
                          filter: isFlash ? 'drop-shadow(0 0 10px rgba(255,250,240,0.9))' : 'none',
                          transition: 'filter 0.25s ease, stroke 0.25s ease',
                        }}
                      />
                    )
                  })}
                  {/* Glossy highlight, purely cosmetic. */}
                  <circle cx="100" cy="100" r="94" fill="url(#wheelGloss)" opacity="0.5" />
                  <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="4" />
                  <defs>
                    <radialGradient id="wheelGloss" cx="35%" cy="22%" r="70%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                      <stop offset="55%" stopColor="rgba(255,255,255,0.03)" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
                    </radialGradient>
                  </defs>
                </svg>
              </div>

              {/* Hub — metallic, glowing by state, holds #wheelCenter's role
                  from legacy. Not a numeric contract id, free to style richly. */}
              <div
                id="wheelCenter"
                key={thunkTick}
                className={`num absolute z-20 flex items-center justify-center rounded-full font-bold ${
                  thunkTick > 0 ? 'wheel-thunk' : ''
                }`}
                style={{
                  width: '30%',
                  height: '30%',
                  fontSize: hubText.length > 5 ? 15 : 19,
                  color: hubColor,
                  background: 'radial-gradient(circle at 35% 30%, #3a4258 0%, #1a2032 55%, #0c0f18 100%)',
                  boxShadow:
                    'inset 0 2px 3px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.6), 0 0 0 3px rgba(0,0,0,0.5), 0 0 18px rgba(0,0,0,0.5)' +
                    (stage === 'spinning' ? ', 0 0 22px 4px color-mix(in srgb, var(--color-purple) 55%, transparent)' : ''),
                  transition: 'color 0.2s ease',
                }}
              >
                {hubText}
              </div>
            </div>

            <div className="wheel-targets flex flex-wrap justify-center gap-2" id="targets">
              {r.tiers.map(([m, , col]) => {
                const total = active ? mult * m : m
                const label = (active ? total.toFixed(total < 100 ? 2 : 0) : String(m)) + '×'
                return (
                  <span
                    key={col + m}
                    className="rounded-md px-2.5 py-1 text-xs font-semibold num"
                    style={{
                      color: COLORS[col],
                      background: `color-mix(in srgb, ${COLORS[col]} 16%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${COLORS[col]} 45%, transparent)`,
                    }}
                  >
                    {label}
                  </span>
                )
              })}
              <span
                className="rounded-md px-2.5 py-1 text-xs font-semibold num"
                style={{
                  color: '#aab3c4',
                  background: 'color-mix(in srgb, #333b49 55%, transparent)',
                  border: '1px solid color-mix(in srgb, #333b49 80%, transparent)',
                }}
              >
                Bust {bustPct}%
              </span>
            </div>
          </div>

          <div className="divider my-5 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="mb-2 text-xs uppercase tracking-wide text-muted">Recent spins</h4>
            <div className="history-list flex flex-wrap gap-1.5" id="history">
              {[...history].reverse().map((h) => (
                <Reveal key={h.id} as="span" preset="scaleIn" duration={0.22}>
                  <span
                    className={`pill num rounded-md px-2 py-1 text-xs ${h.mult > 0 ? 'win' : 'lose'}`}
                    style={{
                      background:
                        h.mult > 0
                          ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                          : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                      color: h.mult > 0 ? 'var(--color-green)' : 'var(--color-red)',
                    }}
                  >
                    {h.mult > 0 ? h.mult.toFixed(2) + '×' : 'bust'}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <p className="controls-title mb-1.5 text-xs uppercase tracking-wide text-muted">Risk level</p>
          <div className="bet-row mb-4 grid grid-cols-2 gap-2" id="riskRow">
            {RISK_KEYS.map((k) => {
              const def = RISKS[k]
              const on = risk === k
              const topMult = def.tiers[def.tiers.length - 1][0]
              const severity = Math.round((def.bust / S) * 100)
              return (
                <button
                  key={k}
                  type="button"
                  data-risk={k}
                  aria-pressed={on}
                  disabled={active || spinning}
                  onClick={() => setRisk(k)}
                  className="flex flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    border: `1px solid ${on ? 'color-mix(in srgb, var(--color-gold) 55%, var(--glass-line))' : 'var(--glass-line)'}`,
                    background: on
                      ? 'linear-gradient(180deg, color-mix(in srgb, var(--color-gold) 18%, var(--color-panel-2)), var(--color-panel-2))'
                      : 'var(--color-panel-2)',
                    boxShadow: on ? '0 0 0 1px color-mix(in srgb, var(--color-gold) 35%, transparent)' : 'none',
                  }}
                >
                  <span className="flex w-full items-center justify-between text-sm font-semibold text-text">
                    {def.label}
                    <span
                      className="ml-2 h-2 w-2 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, #3ecf8e, #f6d97a, #ef4d6a)`,
                        opacity: 0.35 + (severity / 100) * 0.65,
                      }}
                    />
                  </span>
                  <span className="num text-[11px] text-muted">
                    {severity}% bust · up to {topMult}×
                  </span>
                </button>
              )
            })}
          </div>

          <BetField inputRef={betRef} />

          <div className="stat-grid grid grid-cols-2 gap-2">
            <Stat k="Current multiplier" v={<span id="curMult">{active ? mult.toFixed(2) + '×' : '—'}</span>} />
            <Stat
              k="Cash out"
              v={
                <span id="cashVal">
                  {active ? fmt(Math.floor(betAmountRef.current * mult * HOUSE_EDGE)) : '—'}
                </span>
              }
            />
            <Stat k="Bust chance" v={<span id="bustChance">{bustPct}%</span>} />
            <Stat k="Last spin" v={<span id="lastSpin">{lastSpinLabel}</span>} />
          </div>

          <Button id="wheelBtn" variant="purple" size="lg" block disabled={spinning} onClick={spin} className="mt-4">
            {active ? 'SPIN AGAIN' : 'SPIN'}
          </Button>
          <Button
            id="cashBtn"
            variant="blue"
            size="lg"
            block
            disabled={spinning || !active}
            onClick={cashOut}
            className="mt-2.5"
          >
            Cash Out
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>

      {/* Scoped keyframes for the settle "thunk" and bust shake — no shared
          stylesheet touched, kept local to this game per the batch's
          small-anchored-edits rule for shared files. */}
      <style>{`
        @keyframes wheelThunk {
          0% { transform: scale(1); }
          35% { transform: scale(1.14); }
          60% { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        .wheel-thunk { animation: wheelThunk ${THUNK_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes wheelShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px) rotate(-0.6deg); }
          30% { transform: translateX(5px) rotate(0.5deg); }
          45% { transform: translateX(-4px) rotate(-0.4deg); }
          60% { transform: translateX(3px) rotate(0.3deg); }
          75% { transform: translateX(-2px); }
        }
        .wheel-shake { animation: wheelShake 480ms ease-in-out; }

        /* Pointer flapper — knocked by each passing segment. Linear timing:
           the spacing is already baked into the keyframe percentages. */
        @keyframes wheelPointerTick {
          ${pointerTickKeyframes()}
        }
        .wheel-pointer-tick { animation: wheelPointerTick ${SPIN_MS}ms linear; }

        .wheel-bulb {
          position: absolute;
          width: 6px;
          height: 6px;
          margin: -3px 0 0 -3px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 30%, #fff6da, #f6d97a 55%, #a97a1f 100%);
          box-shadow: 0 0 4px 1px rgba(246, 217, 122, 0.55);
          opacity: 0.55;
          animation: wheelBulbIdle 2.4s ease-in-out infinite;
        }
        @keyframes wheelBulbIdle {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.85; }
        }
        .wheel-bulb-chase {
          animation: wheelBulbChase 900ms linear infinite;
          box-shadow: 0 0 7px 2px rgba(246, 217, 122, 0.85);
        }
        @keyframes wheelBulbChase {
          0% { opacity: 1; background: radial-gradient(circle at 35% 30%, #fffaf0, #fff2c2 55%, #e6c15a 100%); }
          35% { opacity: 0.35; }
          100% { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}
