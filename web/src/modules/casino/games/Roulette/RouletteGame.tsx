import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { GameLayout, Panel, PageHead, Button, Stat, cn } from '@/platform/ui'
import { Reveal, motionPolicy } from '@/platform/motion'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import AgentMount from '../../components/AgentMount'

/* ============================================================
   European Roulette — ported from js/games/roulette.js. Single-zero wheel,
   a real betting board (straight/color/parity/half/dozen/column), multiple
   staged bets per spin, undo/clear/rebet.

   AGENT CONTRACT (agent-ui.js:556-628, ported verbatim into
   platform/agent/agentUi.ts's own `roulette:` adapter) — every one of these
   is load-bearing:
     detect()  !!$("#board") && !!window.RouletteAPI — an element with id
               `board` AND the `window.RouletteAPI` global must both exist.
     play()    computes its own bet spread (board keys:
               red|black|even|odd|low|high|d1|d2|d3|c1|c2|c3|n:<num>),
               calls api.clearBets(), then api.placeBet(key, amt) per bet,
               then api.spin(), then polls up to 8s for !api.isSpinning().
   The agent NEVER clicks board cells — it drives window.RouletteAPI
   programmatically. Every function below is defined once (useCallback) and
   assigned to window.RouletteAPI verbatim, no `as unknown as` cast — see
   platform/agent/agentUi.ts:47's `RouletteAPIType`, the pre-existing type
   contract this component's assignment typechecks against directly. One
   extra member (`total`, matching roulette.js:309's own shape) rides along
   on a widened local variable rather than a fresh object literal, so it
   never trips excess-property checking against the narrower declared type
   — still a PLAIN assignment, still no cast.

   TRUTH VS. FEEL — the same split every custom-render game in this batch
   (Wheel, Crash, Plinko, Chicken) uses. `spin()` decides the landing pocket
   SYNCHRONOUSLY (cheat-rigging included, ported verbatim from legacy's
   `Casino.cheat.win()` branch) and computes the exact wheel/ball rotation
   needed to land that pocket at the pointer before anything animates.
   Resolution — `settle(n)` — runs off a plain `setTimeout` fixed at 4100ms
   (mirroring roulette.js:263's own literal), never gated on the CSS
   transition's `transitionend` firing, so a backgrounded tab can never hang
   the agent's `waitFor(() => !isSpinning(), 8000)`. The wheel/ball rotor
   below is Track B — cosmetic, and free to look choppy in an unfocused tab.
   ============================================================ */

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
// Pocket order around a European wheel (used for colours + ball landing) — verbatim roulette.js:8.
const ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29,
  7, 28, 12, 35, 3, 26,
]
const SEG = 360 / ORDER.length
const CHIPS = [1, 5, 25, 100]
const SPIN_MS = 4000
const SETTLE_DELAY_MS = 4100
const THUNK_MS = 650
/* Ball radius at rest in a pocket vs. flung out onto the rim track, as a
   PERCENTAGE of the rotor box — animated on the ball's own `top` so the spin
   reads as a real toss-and-spiral instead of a fixed-radius orbit.

   These were px (80 / 96), which is why the ball orbited somewhere around
   the hub instead of in the pockets: the rotor's wedges are drawn in SVG
   viewBox units (r=94 of a 200-unit box) and therefore SCALE with the wheel,
   while a px radius does not. On the 340px wheel the pocket ring lands at
   ~141px, so an 80px ball sat well inside it. In rotor-box percentages the
   pocket ring runs 35% (the inner circle, r=70) to 47% (the rim, r=94), and
   these now sit inside it at every wheel size. Same fix for the numbers below. */
const BALL_R_INNER = 43.5
const BALL_R_OUTER = 46.5
/** Pocket-number radius, same rotor-box percentage scale as the ball. */
const NUMBER_R = 40
const BALL_FLING_MS = Math.round(SPIN_MS * 0.32)
const BALL_SPIRAL_MS = SPIN_MS - BALL_FLING_MS
// Decorative rim lights around the wheel bezel — purely cosmetic.
const BULB_COUNT = 28

type Color = 'red' | 'black' | 'green'

function colorOf(n: number): Color {
  return n === 0 ? 'green' : RED.has(n) ? 'red' : 'black'
}

/** Payout odds "to 1" for the live preview — verbatim roulette.js:17-21. */
function oddsRatio(key: string): number {
  if (key.startsWith('n:')) return 35 // straight up
  if (['red', 'black', 'even', 'odd', 'low', 'high'].includes(key)) return 1 // even money
  return 2 // dozens & columns
}

const LABELS: Record<string, string> = {
  red: 'Red', black: 'Black', even: 'Even', odd: 'Odd', low: '1-18', high: '19-36',
  d1: '1st 12', d2: '2nd 12', d3: '3rd 12', c1: 'Column 1', c2: 'Column 2', c3: 'Column 3',
}
const labelFor = (key: string) => (key.startsWith('n:') ? `${key.slice(2)} straight` : LABELS[key] || key)

/** Total returned (incl. stake) per credit staked on `key` if `n` hits, else 0 — verbatim roulette.js:29-46. */
function payoutFor(key: string, n: number): number {
  if (key.startsWith('n:')) return Number(key.slice(2)) === n ? 36 : 0
  switch (key) {
    case 'red': return colorOf(n) === 'red' ? 2 : 0
    case 'black': return colorOf(n) === 'black' ? 2 : 0
    case 'even': return n !== 0 && n % 2 === 0 ? 2 : 0
    case 'odd': return n % 2 === 1 ? 2 : 0
    case 'low': return n >= 1 && n <= 18 ? 2 : 0
    case 'high': return n >= 19 && n <= 36 ? 2 : 0
    case 'd1': return n >= 1 && n <= 12 ? 3 : 0
    case 'd2': return n >= 13 && n <= 24 ? 3 : 0
    case 'd3': return n >= 25 && n <= 36 ? 3 : 0
    case 'c1': return n !== 0 && n % 3 === 0 ? 3 : 0
    case 'c2': return n !== 0 && n % 3 === 2 ? 3 : 0
    case 'c3': return n !== 0 && n % 3 === 1 ? 3 : 0
  }
  return 0
}

// Number cells laid out like a real table (3 rows x 12 cols) — verbatim roulette.js:58-59.
const TOP: number[] = [] // n % 3 === 0
const MID: number[] = [] // n % 3 === 2
const BOT: number[] = [] // n % 3 === 1
for (let n = 1; n <= 36; n++) (n % 3 === 0 ? TOP : n % 3 === 2 ? MID : BOT).push(n)

type UndoEntry = { key: string; amt: number }

/** Angle 0 = 12 o'clock, clockwise — matches Wheel/WheelGame.tsx's own `polar`. */
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

const POCKET_FILL: Record<Color, string> = { red: '#c73349', green: '#1f9e6e', black: '#12161f' }

/** Position (as CSS percentages) for a rim light bulb — angle 0 = 12 o'clock. */
function bulbPct(i: number, total: number): { left: string; top: string } {
  const angle = (i * 360) / total
  const rad = (angle * Math.PI) / 180
  return { left: `${50 + 47 * Math.sin(rad)}%`, top: `${50 - 47 * Math.cos(rad)}%` }
}

type RouletteApiShape = {
  placeBet: (key: string, amount: number) => void
  clearBets: () => void
  spin: () => void
  isSpinning: () => boolean
  total: () => number
}

export default function RouletteGame(): JSX.Element {
  const placeBetWallet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const [bets, setBets] = useState<Record<string, number>>({})
  const [selectedChip, setSelectedChip] = useState(5)
  const [spinning, setSpinning] = useState(false)
  const [wheelRot, setWheelRot] = useState(0)
  const [ballRot, setBallRot] = useState(0)
  const [ballRadius, setBallRadius] = useState(BALL_R_INNER)
  const [ballRadiusTransition, setBallRadiusTransition] = useState('none')
  const [resultNum, setResultNum] = useState<number | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [thunkTick, setThunkTick] = useState(0)

  // Round truth kept in refs — same "Track A" reasoning as Wheel/Crash/Plinko's
  // own ref-held state, so a settle()/API closure never has to guess what was
  // true at call time and the agent's synchronous isSpinning()/total() reads
  // never race a pending React commit.
  const betsRef = useRef<Record<string, number>>({})
  const undoStackRef = useRef<UndoEntry[]>([])
  const lastBetsRef = useRef<Record<string, number> | null>(null)
  const spinningRef = useRef(false)
  const wheelRotRef = useRef(0)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ballRadiusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
      if (thunkTimerRef.current !== null) clearTimeout(thunkTimerRef.current)
      if (ballRadiusTimerRef.current !== null) clearTimeout(ballRadiusTimerRef.current)
    },
    [],
  )

  const applyBets = useCallback((next: Record<string, number>) => {
    betsRef.current = next
    setBets(next)
  }, [])

  const total = useCallback(() => Object.values(betsRef.current).reduce((a, b) => a + b, 0), [])
  const isSpinning = useCallback(() => spinningRef.current, [])

  const placeBet = useCallback(
    (key: string, amount: number) => {
      const amt = Math.floor(amount)
      if (spinningRef.current || !key || amt <= 0) return
      const next = { ...betsRef.current, [key]: (betsRef.current[key] || 0) + amt }
      undoStackRef.current.push({ key, amt })
      applyBets(next)
    },
    [applyBets],
  )

  const clearBets = useCallback(() => {
    if (spinningRef.current) return
    undoStackRef.current = []
    applyBets({})
  }, [applyBets])

  const undo = useCallback(() => {
    if (spinningRef.current) return
    const last = undoStackRef.current.pop()
    if (!last) return
    const next = { ...betsRef.current }
    next[last.key] -= last.amt
    if (next[last.key] <= 0) delete next[last.key]
    applyBets(next)
  }, [applyBets])

  const rebet = useCallback(() => {
    if (spinningRef.current || !lastBetsRef.current) return
    const next = { ...lastBetsRef.current }
    undoStackRef.current = Object.entries(next).map(([key, amt]) => ({ key, amt }))
    applyBets(next)
  }, [applyBets])

  const settle = useCallback(
    (n: number) => {
      settleTimerRef.current = null
      let returned = 0
      for (const [key, amt] of Object.entries(betsRef.current)) returned += amt * payoutFor(key, n)
      const staked = total()

      setResultNum(n)
      setThunkTick((t) => t + 1)
      if (thunkTimerRef.current !== null) clearTimeout(thunkTimerRef.current)

      if (returned > 0) {
        payout(returned)
        toast(`${n} ${colorOf(n)} — you won +${fmt(returned - staked)}!`, 'win')
      } else {
        toast(`${n} ${colorOf(n)} — no winning bets.`, 'lose')
      }
      setHistory((h) => [...h.slice(-11), n])
      lastBetsRef.current = { ...betsRef.current }
      undoStackRef.current = []
      applyBets({})
      spinningRef.current = false
      setSpinning(false)
    },
    [applyBets, payout, total],
  )

  const spin = useCallback(() => {
    if (spinningRef.current) return
    const staked = total()
    if (staked <= 0) {
      toast('Place at least one bet first.', 'info')
      return
    }
    if (!placeBetWallet(staked)) {
      toast('Not enough cash for that spread.', 'lose')
      return
    }

    spinningRef.current = true
    setSpinning(true)
    setResultNum(null)

    let result = Math.floor(Math.random() * ORDER.length)
    // Rigged odds: land on a number that wins at least one placed bet.
    if (cheatWin()) {
      const winners: number[] = []
      for (let n = 0; n <= 36; n++) {
        if (Object.keys(betsRef.current).some((key) => payoutFor(key, n) > 0)) winners.push(n)
      }
      if (winners.length) result = winners[Math.floor(Math.random() * winners.length)]
    }

    // Rotate the wheel so the winning pocket ends under the top pointer, and
    // spin the ball the other way, settling into that pocket — verbatim
    // roulette.js:244-255's own trick.
    const idx = ORDER.indexOf(result)
    const pocketAngle = idx * SEG + SEG / 2
    const delta = (((-pocketAngle - wheelRotRef.current) % 360) + 360) % 360
    const nextRot = wheelRotRef.current + delta + 360 * 5 // >=5 turns, pocket ends at the top
    wheelRotRef.current = nextRot
    setWheelRot(nextRot)
    setBallRot(-nextRot - 360 * 6)

    // Ball radius — Track B cosmetics only, same as the rotation above: a
    // fast fling out to the rim track, then a slower spiral back down into
    // the pocket, timed to land roughly with the rotor's own deceleration.
    // Purely visual; settle() below never waits on either transition.
    const reduced = motionPolicy() !== 'full'
    if (ballRadiusTimerRef.current !== null) clearTimeout(ballRadiusTimerRef.current)
    if (reduced) {
      setBallRadiusTransition('top 250ms ease-out')
      setBallRadius(BALL_R_INNER)
    } else {
      setBallRadiusTransition(`top ${BALL_FLING_MS}ms ease-out`)
      setBallRadius(BALL_R_OUTER)
      ballRadiusTimerRef.current = setTimeout(() => {
        ballRadiusTimerRef.current = null
        setBallRadiusTransition(`top ${BALL_SPIRAL_MS}ms cubic-bezier(0.32, 0.68, 0.3, 1)`)
        setBallRadius(BALL_R_INNER)
      }, BALL_FLING_MS)
    }

    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
    // Track A: truth resolves on a plain wall-clock timer, never on the CSS
    // transition's own completion — see the file header.
    settleTimerRef.current = setTimeout(() => settle(result), SETTLE_DELAY_MS)
  }, [placeBetWallet, settle, total])

  // Minimal programmatic API so the AI adapter can drive the felt — a PLAIN
  // assignment against agentUi.ts's pre-existing `RouletteAPIType`, never a
  // cast. `api` is a variable (not a fresh object literal) so the one extra
  // member (`total`) doesn't trip excess-property checking against the
  // narrower declared global type.
  useEffect(() => {
    const api: RouletteApiShape = { placeBet, clearBets, spin, isSpinning, total }
    window.RouletteAPI = api
    return () => {
      delete window.RouletteAPI
    }
  }, [placeBet, clearBets, spin, isSpinning, total])

  const easeAvailable = motionPolicy() === 'full'
  const rotorTransition = spinning
    ? easeAvailable
      ? `transform ${SPIN_MS}ms cubic-bezier(0.1, 0.75, 0.18, 1)`
      : 'transform 250ms ease-out'
    : 'none'
  const ballTransition = spinning
    ? easeAvailable
      ? `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.7, 0.14, 1)`
      : 'transform 250ms ease-out'
    : 'none'

  const staked = total()
  const betEntries = Object.entries(bets)

  const chipBadge = (key: string) => {
    const amt = bets[key]
    if (!amt) return null
    const layers = Math.min(3, Math.max(1, Math.ceil(amt / selectedChip)))
    return (
      <span className="rt-chip-stack pointer-events-none absolute -top-2 -right-1.5 z-10">
        {Array.from({ length: layers }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full border num text-[9px] font-bold flex items-center justify-center"
            style={{
              width: 20,
              height: 20,
              top: -i * 3,
              right: -i * 1.5,
              background: 'radial-gradient(circle at 35% 30%, #ffe9a8, #e6c15a 55%, #a97a1f 100%)',
              borderColor: 'rgba(0,0,0,0.4)',
              color: '#2a1f06',
              boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {i === layers - 1 ? fmt(amt) : ''}
          </span>
        ))}
      </span>
    )
  }

  const betCellClass =
    'rt-cell relative flex items-center justify-center select-none cursor-pointer text-xs font-semibold rounded-[4px] border transition-colors'

  function NumCell({ n }: { n: number }) {
    const key = `n:${n}`
    const c = colorOf(n)
    return (
      <button
        type="button"
        data-bet={key}
        disabled={spinning}
        onClick={() => placeBet(key, selectedChip)}
        className={cn(betCellClass, 'relative h-9 num disabled:cursor-not-allowed')}
        style={{
          background: c === 'red' ? POCKET_FILL.red : '#12161f',
          borderColor: 'rgba(255,255,255,0.08)',
          color: '#f4f6fb',
        }}
      >
        {n}
        {chipBadge(key)}
      </button>
    )
  }

  function OutsideCell({ betKey, label, colorStyle }: { betKey: string; label: string; colorStyle?: CSSProperties }) {
    return (
      <button
        type="button"
        data-bet={betKey}
        disabled={spinning}
        onClick={() => placeBet(betKey, selectedChip)}
        className={cn(betCellClass, 'relative h-10 disabled:cursor-not-allowed')}
        style={{
          background: 'var(--color-panel-2)',
          borderColor: 'var(--glass-line)',
          color: 'var(--color-text)',
          ...colorStyle,
        }}
      >
        {label}
        {chipBadge(betKey)}
      </button>
    )
  }

  const resultColor = resultNum === null ? undefined : colorOf(resultNum)

  return (
    <div>
      <PageHead
        title="European Roulette"
        sub="Place as many chips as you like, then spin. Straight up pays 35:1."
        icon="disc-3"
      />

      <GameLayout>
        {/* Main: the wheel (hero of the page) + the felt board beneath it.
            Neither ever scrolls — the board's own container is fluid (no
            min-width forcing overflow), so on a narrow panel the cells
            compress instead of triggering rt-board-scroll's old
            overflow-x-auto. */}
        <Panel>
          <div className="rt-wheel-hero relative flex flex-col items-center gap-2 pb-1">
            {/* Soft felt-toned backdrop glow — purely decorative, gives the
                wheel real visual weight as the page's focal element instead
                of a plain glass rectangle. Static (no new motion), so it
                needs no reduced-motion gate. */}
            <div
              className="pointer-events-none absolute rounded-full"
              style={{
                top: '-8%',
                width: '92%',
                aspectRatio: '1 / 1',
                background: 'radial-gradient(circle, color-mix(in srgb, var(--color-green) 10%, transparent), transparent 70%)',
                filter: 'blur(20px)',
              }}
            />

            <div
              className="wheel-face relative z-10 flex items-center justify-center rounded-full"
              style={{
                width: '100%',
                maxWidth: 360,
                aspectRatio: '1 / 1',
                background:
                  'radial-gradient(120% 100% at 50% 20%, color-mix(in srgb, #10182c 88%, transparent), var(--color-panel-2) 70%), conic-gradient(from 0deg, #2a3247, #131826, #2a3247, #0d1220, #2a3247)',
                border: `1px solid ${spinning ? 'color-mix(in srgb, var(--color-purple) 45%, var(--glass-line))' : 'var(--glass-line)'}`,
                boxShadow: `inset 0 0 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)${spinning ? ', 0 0 60px -14px color-mix(in srgb, var(--color-purple) 45%, transparent)' : ''}`,
              }}
            >
              {/* Rim lights — a static ring of cabinet bulbs around the outer
                  bezel, purely decorative (no motion, so no reduced-motion
                  gate needed). Every third bulb reads brighter so the ring
                  doesn't look like a flat dashed line. */}
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 4 }}>
                {Array.from({ length: BULB_COUNT }).map((_, i) => {
                  const { left, top } = bulbPct(i, BULB_COUNT)
                  const bright = i % 3 === 0
                  return (
                    <span
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left,
                        top,
                        width: 4,
                        height: 4,
                        transform: 'translate(-50%, -50%)',
                        background: bright ? '#fff3cf' : '#8a7238',
                        boxShadow: bright
                          ? '0 0 6px 2px rgba(255,224,150,0.75), 0 0 1px rgba(0,0,0,0.6)'
                          : '0 0 2px rgba(0,0,0,0.5)',
                      }}
                    />
                  )
                })}
              </div>

              {/* Winning-pocket marker — fixed at 12 o'clock, never rotates.
                  A small gem sits above a downward wedge notched into the
                  bezel; the wedge is what actually reads as "the pointer",
                  the gem is the accent. Glows on landing (thunkTick). */}
              <div
                key={`ptr-${thunkTick}`}
                className={cn('absolute z-30 flex flex-col items-center', thunkTick > 0 && !spinning && 'rt-ptr-pulse')}
                style={{ top: -9, left: '50%', transform: 'translateX(-50%)' }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    marginBottom: -3,
                    transform: 'rotate(45deg)',
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, #fff 0%, #bfe7ff 35%, #4fa8e0 70%, #1c4f7a 100%)',
                    boxShadow: '0 0 8px rgba(120,200,255,0.75), inset 0 1px 1px rgba(255,255,255,0.85)',
                  }}
                />
                <svg width="24" height="20" viewBox="0 0 24 20" aria-hidden style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))' }}>
                  <path d="M2 0 H22 L12 18 Z" fill="url(#rtPointerGrad)" stroke="rgba(0,0,0,0.5)" strokeWidth="0.75" />
                  <defs>
                    <linearGradient id="rtPointerGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fff6da" />
                      <stop offset="45%" stopColor="#e6c15a" />
                      <stop offset="100%" stopColor="#8a611c" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {/* Rim bezel — layered metal + a thin wood-tone band, so the
                  wheel reads as a real cabinet edge instead of a flat ring. */}
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: '4%',
                  background:
                    'radial-gradient(circle, transparent 62%, color-mix(in srgb, #6b4a22 50%, transparent) 63%, transparent 68%)',
                  boxShadow:
                    'inset 0 0 0 3px rgba(255,255,255,0.08), inset 0 0 0 5px rgba(0,0,0,0.35), inset 0 2px 10px rgba(0,0,0,0.5), 0 10px 30px -8px rgba(0,0,0,0.6)',
                  zIndex: 5,
                }}
              />

              {/* The rotor — Track B. See file header for why settle() never
                  waits on this transition finishing. */}
              <div
                className="wheel-rotor absolute"
                style={{ inset: '6%', transform: `rotate(${wheelRot}deg)`, transition: rotorTransition, willChange: 'transform' }}
              >
                <svg viewBox="0 0 200 200" className="h-full w-full" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
                  {ORDER.map((n, i) => {
                    const a0 = i * SEG
                    const a1 = (i + 1) * SEG
                    const isWinner = !spinning && resultNum === n
                    return (
                      <path
                        key={i}
                        d={wedgePath(100, 100, 94, a0, a1)}
                        fill={POCKET_FILL[colorOf(n)]}
                        stroke={isWinner ? '#fffaf0' : 'rgba(5,8,14,0.85)'}
                        strokeWidth={isWinner ? 2.4 : 1}
                        style={{
                          filter: isWinner ? 'drop-shadow(0 0 8px rgba(255,250,240,0.9))' : 'none',
                          transition: 'filter 0.25s ease, stroke 0.25s ease',
                        }}
                      />
                    )
                  })}
                  {/* Radial pocket dividers. */}
                  {ORDER.map((_, i) => {
                    const [x, y] = polar(100, 100, 94, i * SEG)
                    return <line key={i} x1={100} y1={100} x2={x} y2={y} stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
                  })}
                  <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
                  {/* Glossy highlight. */}
                  <circle cx="100" cy="100" r="94" fill="url(#rtGloss)" opacity="0.45" />
                  <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="4" />
                  <defs>
                    <radialGradient id="rtGloss" cx="35%" cy="22%" r="70%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
                      <stop offset="55%" stopColor="rgba(255,255,255,0.02)" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
                    </radialGradient>
                  </defs>
                </svg>

                {/* Pocket numbers, rotating with the wheel. */}
                {ORDER.map((n, i) => {
                  const angle = i * SEG + SEG / 2
                  // Polar placement in rotor-box percentages (same scale the
                  // rim bulbs use) rather than a px translateY, so the labels
                  // stay in their pockets at every wheel size.
                  const rad = (angle * Math.PI) / 180
                  return (
                    <div
                      key={n}
                      className="absolute num text-[8px] font-semibold"
                      style={{
                        left: `${50 + NUMBER_R * Math.sin(rad)}%`,
                        top: `${50 - NUMBER_R * Math.cos(rad)}%`,
                        color: '#f4f6fb',
                        // still rotated to face outward, like a real wheel
                        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                        opacity: 0.9,
                      }}
                    >
                      {n}
                    </div>
                  )
                })}

                {/* Ball arm — a child of the rotor, so it inherits wheelRot;
                    counter-rotating it settles the ball at a fixed absolute
                    angle (the pointer) regardless of wheel rotation —
                    verbatim roulette.js:249-255's own trick. */}
                <div
                  className="absolute inset-0"
                  style={{ transform: `rotate(${ballRot}deg)`, transition: ballTransition }}
                >
                  {/* The ball itself carries its own radius transform/transition
                      (independent of the rotate above), so a spin reads as a
                      toss out to the rim track that spirals back down into
                      the pocket rather than a fixed-radius orbit. */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      // `top` (a % of the arm, which is the rotor box) rather
                      // than a px translateY — that is what makes the ball
                      // track the pockets at any wheel size. The arm above
                      // still owns the rotation, so the two never contend.
                      top: `${50 - ballRadius}%`,
                      left: '50%',
                      width: 9,
                      height: 9,
                      transform: 'translate(-50%, -50%)',
                      transition: ballRadiusTransition,
                      background: 'radial-gradient(circle at 35% 30%, #fff, #d8dee8 60%, #8b93a3)',
                      boxShadow: spinning
                        ? '0 0 8px 2px rgba(255,255,255,0.55), 0 2px 4px rgba(0,0,0,0.55)'
                        : '0 0 6px rgba(255,255,255,0.7), 0 2px 3px rgba(0,0,0,0.5)',
                    }}
                  />
                </div>
              </div>

              {/* Hub — metallic, non-rotating. */}
              <div
                key={thunkTick}
                className={cn('absolute z-20 flex items-center justify-center rounded-full font-bold num', thunkTick > 0 && !spinning && 'rt-thunk')}
                style={{
                  width: '32%',
                  height: '32%',
                  fontSize: 20,
                  color: spinning ? 'var(--color-text)' : resultColor === 'red' ? 'var(--color-red)' : resultColor === 'green' ? 'var(--color-green)' : 'var(--color-text)',
                  background: 'radial-gradient(circle at 35% 30%, #3a4258 0%, #1a2032 55%, #0c0f18 100%)',
                  boxShadow:
                    'inset 0 2px 3px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.6), 0 0 0 3px rgba(0,0,0,0.5), 0 0 18px rgba(0,0,0,0.5)' +
                    (spinning ? ', 0 0 22px 4px color-mix(in srgb, var(--color-purple) 55%, transparent)' : ''),
                }}
              >
                {spinning ? '…' : resultNum !== null ? resultNum : 'RC'}
              </div>
            </div>

            <div className="history w-full">
              <h4 className="mb-1.5 text-xs uppercase tracking-wide text-muted">Recent numbers</h4>
              <div className="history-list flex flex-wrap gap-1.5" id="history">
                {[...history].reverse().map((n, i) => (
                  <Reveal key={history.length - i} as="span" preset="scaleIn" duration={0.2}>
                    <span
                      className="pill num rounded-md px-2 py-1 text-xs font-semibold"
                      style={{ background: POCKET_FILL[colorOf(n)], color: '#fff' }}
                    >
                      {n}
                    </span>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>

          <div className="my-3 h-px w-full" style={{ background: 'var(--glass-line)' }} />

          {/* The felt board — fluid, never scrolls. The old wrapper forced
              overflow-x-auto + a 560px min-width on the inner grid, which is
              what made the board horizontally scrollable on any panel
              narrower than that; dropping both and letting the 12-col grid
              size in fractions means cells compress on a narrow viewport
              instead of overflowing. Capped + centered so it doesn't stretch
              into oddly huge cells on a very wide main panel either. */}
          <div id="board" className="rt-board mx-auto flex w-full max-w-[760px] gap-1.5">
            <button
              type="button"
              data-bet="n:0"
              disabled={spinning}
              onClick={() => placeBet('n:0', selectedChip)}
              className={cn(betCellClass, 'relative w-10 flex-none rounded-[6px] disabled:cursor-not-allowed')}
              style={{ background: POCKET_FILL.green, borderColor: 'rgba(255,255,255,0.1)', color: '#eafff5' }}
            >
              0{chipBadge('n:0')}
            </button>

            <div className="rt-board-main flex flex-1 flex-col gap-1.5 min-w-0">
              <div className="grid grid-cols-12 gap-1.5">
                {TOP.map((n) => <NumCell key={n} n={n} />)}
                {MID.map((n) => <NumCell key={n} n={n} />)}
                {BOT.map((n) => <NumCell key={n} n={n} />)}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <OutsideCell betKey="c1" label="2:1" />
                <OutsideCell betKey="c2" label="2:1" />
                <OutsideCell betKey="c3" label="2:1" />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <OutsideCell betKey="d1" label="1st 12" />
                <OutsideCell betKey="d2" label="2nd 12" />
                <OutsideCell betKey="d3" label="3rd 12" />
              </div>

              <div className="grid grid-cols-6 gap-1.5">
                <OutsideCell betKey="low" label="1-18" />
                <OutsideCell betKey="even" label="EVEN" />
                <OutsideCell
                  betKey="red"
                  label="RED"
                  colorStyle={{ background: POCKET_FILL.red, borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                />
                <OutsideCell
                  betKey="black"
                  label="BLACK"
                  colorStyle={{ background: POCKET_FILL.black, borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                />
                <OutsideCell betKey="odd" label="ODD" />
                <OutsideCell betKey="high" label="19-36" />
              </div>
            </div>
          </div>
        </Panel>

        {/* Side: a compact control rail — chip size, the spin trigger, staked/
            undo/clear/rebet, the payout preview, and the agent mount. Moved
            out of the main panel so the wheel+board above can use the full
            width instead of being squeezed into a 340px column. */}
        <Panel>
          <p className="controls-title mb-1.5 text-xs uppercase tracking-wide text-muted">Chip size</p>
          <div className="rt-chip-row flex gap-2 mb-4" id="chipRow">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                data-chip={c}
                onClick={() => setSelectedChip(c)}
                className="flex-1 rounded-full py-2 text-xs font-bold num transition-colors"
                style={{
                  background: selectedChip === c ? 'radial-gradient(circle at 35% 30%, #ffe9a8, #e6c15a 55%, #a97a1f 100%)' : 'var(--color-panel-2)',
                  color: selectedChip === c ? '#2a1f06' : 'var(--color-text)',
                  border: `1px solid ${selectedChip === c ? 'transparent' : 'var(--glass-line)'}`,
                  boxShadow: selectedChip === c ? '0 2px 6px rgba(0,0,0,0.4)' : 'none',
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <Button id="spinBtn" variant="purple" size="lg" block disabled={spinning} onClick={spin}>
            {spinning ? 'SPINNING…' : 'SPIN'}
          </Button>

          <div className="rt-controls mt-4 flex flex-wrap items-center gap-2">
            <Button id="undoBtn" variant="ghost" size="sm" disabled={spinning} onClick={undo}>
              Undo
            </Button>
            <Button id="clearBtn" variant="ghost" size="sm" disabled={spinning} onClick={clearBets}>
              Clear
            </Button>
            <Button id="rebetBtn" variant="ghost" size="sm" disabled={spinning || !lastBetsRef.current} onClick={rebet}>
              Rebet
            </Button>
            <div className="ml-auto">
              <Stat k="Staked" v={<span id="totalStaked">{fmt(staked)}</span>} />
            </div>
          </div>

          <div id="rtPreview" className="rt-preview mt-4">
            {betEntries.length === 0 ? (
              <div className="text-xs text-muted">Place chips to preview payouts.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="text-xs uppercase tracking-wide text-muted">If it hits, this pays</div>
                {betEntries.map(([key, amt]) => {
                  const r = oddsRatio(key)
                  return (
                    <div key={key} className="flex items-center justify-between text-xs rounded-md px-2 py-1.5" style={{ background: 'var(--glass)', border: '1px solid var(--glass-line)' }}>
                      <span>
                        {labelFor(key)} <em className="text-muted not-italic">{r}:1</em>
                      </span>
                      <span className="num text-green" style={{ color: 'var(--color-green)' }}>
                        +{fmt(amt * r)} <small className="text-muted">&rarr; {fmt(amt * (r + 1))}</small>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>

      <style>{`
        @keyframes rtThunk {
          0% { transform: scale(1); }
          35% { transform: scale(1.12); }
          60% { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        .rt-thunk { animation: rtThunk ${THUNK_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes rtPtrPulse {
          0% { filter: drop-shadow(0 0 0 rgba(191, 231, 255, 0)); }
          40% { filter: drop-shadow(0 0 10px rgba(191, 231, 255, 0.9)); }
          100% { filter: drop-shadow(0 0 0 rgba(191, 231, 255, 0)); }
        }
        .rt-ptr-pulse { animation: rtPtrPulse ${THUNK_MS + 250}ms ease-out; }
      `}</style>
    </div>
  )
}
