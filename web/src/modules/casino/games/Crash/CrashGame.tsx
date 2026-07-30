import { useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { money } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import { useIsMobile } from '@/platform/layout/useMediaQuery'

/* ============================================================
   Crash — ported from js/games/crash.js. The multiplier climbs from 1.00×;
   cash out (manually or via an auto-target) before a pre-drawn crash point
   catches up to it, or lose the bet.

   AGENT CONTRACT (agent-ui.js, grep "  crash:") — every one of these is
   load-bearing:
     detect()  !!$("#placeBetBtn") && !!$("#crashStage")
     play()    writes #autoInput.value = target.toFixed(2) — a PLAIN raw
               `.value =` assignment, NO dispatched event — then
               applyBet() -> #betInput, clicks #placeBetBtn, `sleep(150)`,
               then waitFor(() => $("#crashStage").dataset.state === "idle", 20000).
   The adapter NEVER clicks a manual cash-out button; it only ever sets the
   auto-target ahead of time and waits for the round to fully resolve.
   #autoInput is therefore UNCONTROLLED (ref + defaultValue, same rationale
   as #betInput/#targetInput — see BetField.tsx / Limbo's own note): a
   controlled input's value tracker would fight a write that never fires an
   event, so it's read straight off the ref at the moment `fire()` runs,
   never trusted out of React state.

   *** THE TWO-TRACK SPLIT — THE SINGLE MOST IMPORTANT DECISION IN THIS FILE ***
   Legacy resolves EVERYTHING — crash detection, #crashStage's data-state,
   auto-cash-out firing — inside a `requestAnimationFrame` loop (crash.js's
   `tick()`, legacy lines 235-257). rAF is suspended the instant a tab is
   backgrounded, which is exactly when an unattended Lab agent is most
   likely to be running (PHASE_1_MOTION_ICONS_PLAN.md §0). If crash truth
   only ever advances inside rAF, a backgrounded agent's `waitFor` hangs
   forever waiting for "idle" that never arrives.

   So this port hard-splits the game into two tracks:

   Track A — TRUTH, never gated on a rAF frame completing.
     `fire()` synchronously draws the crash point (`genCrashPoint()`, cheat
     rig included, ported verbatim from legacy lines 259-269) and IMMEDIATELY
     inverts `liveMultiplier` for that crash point to get real wall-clock
     milliseconds, then arms a plain `setTimeout` for `finishRound()` keyed
     to that duration. Same inversion arms a second `setTimeout` for the
     auto-cash-out, if one is set below the crash point. `data-state` moves
     idle -> running (synchronously in `fire()`) -> crashed (in the
     `finishRound` timeout) -> idle again (a further `setTimeout`, 1300ms
     later, mirroring legacy's own post-crash pause) — every step a
     `setTimeout` callback, not an animation-frame callback. This fires
     correctly even if the tab never paints a single frame.

     The inversion, worked out algebraically since `liveMultiplier` is
     monotonic in elapsed time:
       liveMultiplier(ms) = 2 ^ ((ms / 2500) ^ 1.5)
       let mult = 2 ^ ((ms / 2500) ^ 1.5)
       log2(mult) = (ms / 2500) ^ 1.5
       (ms / 2500) = log2(mult) ^ (1 / 1.5)
       ms = 2500 * log2(mult) ^ (1 / 1.5)
     — implemented below as `elapsedMsForMultiplier()`, the mirror image of
     `liveMultiplier()`.

   Track B — FEEL, allowed to use rAF/canvas, may stall or skip frames in a
     backgrounded tab, and that is fine.
     `tickVisual()` is a rAF loop that computes a live interpolated
     multiplier from wall-clock elapsed time each frame purely for display
     (the big number + the canvas line chart), clamped to the real crash
     point so it can never visually overshoot what Track A already decided.
     It stops the instant `stageRef.current !== 'running'` — i.e. the moment
     Track A resolves the round — rather than driving that resolution
     itself. Nothing it touches is a numeric contract id (`crashMult`,
     `potPay` are NOT in contractIds.ts's NUMERIC_CONTRACT_IDS — the agent
     never reads a live multiplier number, only `#crashStage`'s
     `data-state`), so it is free to tween/animate exactly like
     AnimatedNumber's "ordinary node" ownership model: written imperatively
     by an effect/rAF loop, never by React state, so a live rAF-driven write
     can't race a re-render (see platform/motion/AnimatedNumber.tsx's own
     OWNERSHIP MODEL note for the general pattern this mirrors).
   ============================================================ */

const HOUSE_EDGE = 0.99 // ~1% edge, consistent with Dice/Mines/Limbo
const MS_PER_DOUBLING = 2500 // multiplier doubles every 2.5s of real time
const IDLE_DELAY_MS = 1300 // post-crash pause before the stage resets, ported verbatim

type Round = { id: number; mult: number }

/** P(crash >= x) = HOUSE_EDGE / x for x >= 1 — a clean, constant house edge
 *  at any cash-out target. Ported verbatim from legacy `genCrashPoint()`. */
function genCrashPoint(): number {
  const r = Math.random()
  const raw = HOUSE_EDGE / (1 - r)
  return Math.max(1.0, Math.floor(raw * 100) / 100)
}

/** Accelerating climb, ported verbatim from legacy `liveMultiplier()`. Pure
 *  pacing — the crash point is drawn independently, so fairness is
 *  unaffected by this curve's shape. */
function liveMultiplier(elapsedMs: number): number {
  const x = Math.max(0, elapsedMs) / MS_PER_DOUBLING
  return Math.pow(2, Math.pow(x, 1.5))
}

/** The Track A inversion: real wall-clock ms until `liveMultiplier` reaches
 *  `target`. See the file header for the algebra. */
function elapsedMsForMultiplier(target: number): number {
  if (target <= 1) return 0
  return MS_PER_DOUBLING * Math.pow(Math.log2(target), 1 / 1.5)
}

const AUTO_PRESETS: { label: string; value: number }[] = [
  { label: '1.5×', value: 1.5 },
  { label: '2×', value: 2 },
  { label: '3×', value: 3 },
  { label: 'Off', value: 0 },
]

export default function CrashGame() {
  const isMobile = useIsMobile()
  const betRef = useBetRef()
  const autoRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const multElRef = useRef<HTMLDivElement>(null)
  const potPayRef = useRef<HTMLSpanElement>(null)

  // Track A truth, kept in refs so click/timeout handlers can read-then-act
  // synchronously without waiting on a React re-render round-trip (same
  // reasoning as Blackjack/Holdem/CasinoWar's ref-held round state).
  const stageRef = useRef<'idle' | 'running' | 'crashed'>('idle')
  const crashPointRef = useRef(1)
  const startTimeRef = useRef(0)
  const cashedOutRef = useRef(false)
  const cashedAtRef = useRef(0)
  const lastStakeRef = useRef(0)
  const pointsRef = useRef<{ t: number; m: number }[]>([{ t: 0, m: 1 }])
  const historyIdRef = useRef(0)

  // Timer/rAF handles — Track A owns the three setTimeouts, Track B owns the rAF id.
  const crashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  // React-owned state: only what actually needs a re-render. #crashStage's
  // data-state is driven straight off `stage` so the commit is synchronous
  // and never gated on anything else painting.
  const [stage, setStage] = useState<'idle' | 'running' | 'crashed'>('idle')
  const [cashedOut, setCashedOut] = useState(false)
  const [resultMsg, setResultMsg] = useState('')
  const [resultTone, setResultTone] = useState<'green' | 'red' | null>(null)
  const [history, setHistory] = useState<Round[]>([])
  const [lastRound, setLastRound] = useState('—')

  const placeBetStake = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  function getCtx(): CanvasRenderingContext2D | null {
    if (!ctxRef.current && canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d')
    }
    return ctxRef.current
  }

  /** Track B: writes the big multiplier number + "if cashed now" stat
   *  imperatively, exactly like legacy's `setMultDisplay()`/`updatePotential()`.
   *  Neither node is a numeric contract id, so this ownership is safe — see
   *  the file header. */
  function paintMult(mult: number) {
    const el = multElRef.current
    if (el) {
      el.textContent = mult.toFixed(2) + '×'
      el.style.color =
        stageRef.current === 'crashed'
          ? cashedOutRef.current
            ? 'var(--color-green)'
            : 'var(--color-red)'
          : cashedOutRef.current
            ? 'var(--color-green)'
            : mult >= 5
              ? 'var(--color-gold)'
              : mult >= 2
                ? 'var(--color-gold-2)'
                : stageRef.current === 'running'
                  ? 'var(--color-text)'
                  : 'var(--color-muted)'
    }
    const pot = potPayRef.current
    if (pot) {
      pot.textContent =
        stageRef.current === 'running' && !cashedOutRef.current
          ? money(Math.floor(lastStakeRef.current * mult))
          : '—'
    }
  }

  /** Track B: the canvas line chart. Cosmetic only — nothing here feeds
   *  back into Track A's truth. Ported in spirit from legacy `drawChart()`,
   *  including the rocket-tilt trig (legacy lines ~157-166) — the rocket
   *  rotates to match the local slope of the curve so it stays tangent to
   *  the line instead of sitting upright/crooked against it. */
  function drawChart() {
    const canvas = canvasRef.current
    const ctx = getCtx()
    if (!canvas || !ctx) return
    const w = (canvas.width = canvas.clientWidth)
    const h = (canvas.height = canvas.clientHeight)
    ctx.clearRect(0, 0, w, h)
    const points = pointsRef.current
    if (points.length < 2 || w === 0 || h === 0) return

    const liveMult = points[points.length - 1].m
    const maxT = Math.max(points[points.length - 1].t, 4000)
    const maxM = Math.max(2, liveMult * 1.15)
    const pad = 10
    const x = (t: number) => pad + (t / maxT) * (w - 2 * pad)
    const y = (m: number) => h - pad - ((m - 1) / (maxM - 1)) * (h - 2 * pad)

    ctx.strokeStyle = 'rgba(138,150,173,0.15)'
    ctx.lineWidth = 1
    for (let i = 1; i <= 3; i++) {
      const gy = pad + ((h - 2 * pad) / 4) * i
      ctx.beginPath()
      ctx.moveTo(pad, gy)
      ctx.lineTo(w - pad, gy)
      ctx.stroke()
    }

    const hot = stageRef.current === 'crashed' && !cashedOutRef.current
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, hot ? 'rgba(255,77,109,0.30)' : 'rgba(34,229,154,0.28)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.beginPath()
    points.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p.m)) : ctx.moveTo(x(p.t), y(p.m))))
    ctx.lineTo(x(points[points.length - 1].t), h - pad)
    ctx.lineTo(x(points[0].t), h - pad)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    ctx.strokeStyle = hot ? '#ff4d6d' : '#22e59a'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    points.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p.m)) : ctx.moveTo(x(p.t), y(p.m))))
    ctx.stroke()

    const tip = points[points.length - 1]
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '22px serif'
    if (stageRef.current === 'running') {
      // Tilt the rocket along the current slope so it stays parallel to the
      // line it's riding — legacy crash.js's own rocket-tilt trig, restored
      // (this file previously drew it upright/static, which reads as
      // crooked against the line, especially early when the curve is
      // near-flat). `points.length >= 2` is guaranteed by the early return
      // above, so there's always a real previous sample to angle from.
      const prev = points[points.length - 2]
      const tx = x(tip.t)
      const ty = y(tip.m)
      const ang = Math.atan2(ty - y(prev.m), tx - x(prev.t))
      ctx.save()
      ctx.translate(tx, ty)
      ctx.rotate(ang + Math.PI / 4) // 🚀 points up-right by default
      ctx.fillText('🚀', 0, 0)
      ctx.restore()
    } else if (hot) {
      ctx.fillText('💥', x(tip.t), y(tip.m))
    }
  }

  function clearAllTimers() {
    if (crashTimerRef.current !== null) {
      clearTimeout(crashTimerRef.current)
      crashTimerRef.current = null
    }
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  useEffect(() => clearAllTimers, [])

  useEffect(() => {
    drawChart()
    const onResize = () => drawChart()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Track B rAF loop: purely visual, clamped to the real crash point so it
   *  can never animate past what Track A already decided, and it stops the
   *  moment Track A flips the stage away from 'running' — never the other
   *  way around. */
  function tickVisual() {
    if (stageRef.current !== 'running') {
      rafRef.current = null
      return
    }
    const elapsed = performance.now() - startTimeRef.current
    const mult = Math.min(liveMultiplier(elapsed), crashPointRef.current)
    pointsRef.current.push({ t: elapsed, m: mult })
    paintMult(mult)
    drawChart()
    rafRef.current = requestAnimationFrame(tickVisual)
  }

  /** Track A: banks the win, whether it was the player's manual click or the
   *  auto-target's setTimeout that triggered it. Does NOT touch `stage` —
   *  the round keeps running (matching legacy) until the pre-scheduled
   *  crash timeout resolves it, cashed out or not. */
  function doCashOut(atMult: number) {
    if (cashedOutRef.current || stageRef.current !== 'running') return
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    cashedOutRef.current = true
    cashedAtRef.current = atMult
    const stake = lastStakeRef.current
    const win = Math.floor(stake * atMult)
    payout(win)
    toast(`Cashed out at ${atMult.toFixed(2)}× for ${money(win)}!`, 'win')
    setResultMsg(`Cashed out @ ${atMult.toFixed(2)}× — +${money(win - stake)}`)
    setResultTone('green')
    setCashedOut(true)
    paintMult(atMult)
  }

  /** Track A: the crash itself. Runs from a plain `setTimeout` armed in
   *  `fire()`, keyed to `elapsedMsForMultiplier(crashPoint)` — never gated
   *  on a rAF frame. */
  function finishRound() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    stageRef.current = 'crashed'
    setStage('crashed')

    const cp = crashPointRef.current
    setHistory((h) => [...h.slice(-13), { id: ++historyIdRef.current, mult: cp }])
    setLastRound(cp.toFixed(2) + '×')
    paintMult(cp)
    drawChart()

    if (!cashedOutRef.current) {
      const stake = lastStakeRef.current
      setResultMsg(`Crashed @ ${cp.toFixed(2)}× — lost ${money(stake)}`)
      setResultTone('red')
      toast(`Crashed at ${cp.toFixed(2)}× — bet lost.`, 'lose')
    }

    idleTimerRef.current = setTimeout(() => {
      stageRef.current = 'idle'
      setStage('idle')
      setResultMsg('')
      setResultTone(null)
      pointsRef.current = []
      paintMult(1)
      drawChart()
      idleTimerRef.current = null
    }, IDLE_DELAY_MS)
  }

  /** Track A: place the bet, draw the crash point, and arm every timer up
   *  front. Nothing after this point depends on a single rAF frame firing —
   *  see the file header. */
  function fire() {
    if (stageRef.current !== 'idle') return
    const stake = readBet(betRef)
    if (!placeBetStake(stake)) {
      setResultMsg('Not enough cash for that bet.')
      setResultTone('red')
      return
    }
    lastStakeRef.current = stake

    // #autoInput is uncontrolled — read the live DOM value at fire time,
    // exactly like #betInput/readBet. See the file header.
    const auto = Number(autoRef.current?.value) || 0

    let crashPoint = genCrashPoint()
    // Rigged odds: let the multiplier climb well past the auto cash-out,
    // ported verbatim from legacy's `Casino.cheat.win()` branch.
    if (cheatWin()) {
      const tgt = auto > 1 ? auto : 2.5
      crashPoint = Math.max(crashPoint, tgt * (1.1 + Math.random() * 0.6))
    }

    clearAllTimers()
    crashPointRef.current = crashPoint
    startTimeRef.current = performance.now()
    cashedOutRef.current = false
    cashedAtRef.current = 0
    pointsRef.current = [{ t: 0, m: 1 }]
    stageRef.current = 'running'

    setCashedOut(false)
    setResultMsg('')
    setResultTone(null)
    setStage('running')
    paintMult(1)
    drawChart()

    // The Track A inversion — see the file header for the algebra. Both
    // timers are real wall-clock `setTimeout`s, armed here, before a single
    // rAF frame has run.
    const crashDurationMs = elapsedMsForMultiplier(crashPoint)
    crashTimerRef.current = setTimeout(finishRound, crashDurationMs)

    if (auto > 1 && auto < crashPoint) {
      const autoDurationMs = elapsedMsForMultiplier(auto)
      autoTimerRef.current = setTimeout(() => doCashOut(auto), autoDurationMs)
    }

    // Track B: visual-only, starts after Track A's truth is already fully
    // scheduled.
    rafRef.current = requestAnimationFrame(tickVisual)
  }

  function onCashOutClick() {
    if (stageRef.current !== 'running' || cashedOutRef.current) return
    const elapsed = performance.now() - startTimeRef.current
    const atMult = Math.min(liveMultiplier(elapsed), crashPointRef.current)
    doCashOut(atMult)
  }

  function applyAutoPreset(v: number) {
    if (autoRef.current) autoRef.current.value = String(v)
  }

  return (
    <div>
      <PageHead
        title="Crash"
        sub="The multiplier climbs from 1.00×. Cash out before it crashes — wait too long and you lose it all."
        icon="rocket"
      />

      <GameLayout>
        <Panel>
          <div
            id="crashStage"
            data-state={stage}
            className={`crash-stage relative rounded-[14px] overflow-hidden flex items-center justify-center transition-[box-shadow,border-color] duration-500 ${
              isMobile ? 'h-48' : 'h-72'
            }`}
            style={{
              background:
                stage === 'crashed'
                  ? 'radial-gradient(120% 100% at 50% 100%, color-mix(in srgb, var(--color-red) 20%, var(--color-panel-2)) 0%, var(--color-panel-2) 65%)'
                  : stage === 'running'
                    ? 'radial-gradient(120% 100% at 50% 100%, color-mix(in srgb, var(--color-green) 16%, var(--color-panel-2)) 0%, var(--color-panel-2) 65%)'
                    : 'var(--color-panel-2)',
              border: `1px solid ${
                stage === 'crashed'
                  ? 'color-mix(in srgb, var(--color-red) 45%, var(--glass-line))'
                  : stage === 'running'
                    ? 'color-mix(in srgb, var(--color-green) 40%, var(--glass-line))'
                    : 'var(--glass-line)'
              }`,
              boxShadow:
                stage === 'crashed'
                  ? '0 0 60px -12px color-mix(in srgb, var(--color-red) 45%, transparent)'
                  : stage === 'running'
                    ? '0 0 60px -14px color-mix(in srgb, var(--color-green) 40%, transparent)'
                    : 'none',
            }}
          >
            <canvas ref={canvasRef} className="crash-canvas absolute inset-0 w-full h-full" />
            <div className="relative z-10 text-center pointer-events-none px-4">
              <div
                ref={multElRef}
                id="crashMult"
                className={`crash-mult num font-extrabold tabular-nums transition-transform duration-150 ${
                  isMobile ? 'text-4xl' : 'text-7xl'
                }`}
                style={{
                  color: 'var(--color-muted)',
                  textShadow:
                    stage === 'running'
                      ? '0 0 28px color-mix(in srgb, var(--color-gold) 55%, transparent)'
                      : stage === 'crashed'
                        ? '0 0 28px color-mix(in srgb, var(--color-red) 55%, transparent)'
                        : 'none',
                }}
              >
                1.00×
              </div>
              <div
                id="crashResult"
                className="text-sm mt-2 font-medium"
                style={{
                  color:
                    resultTone === 'green'
                      ? 'var(--color-green)'
                      : resultTone === 'red'
                        ? 'var(--color-red)'
                        : 'var(--color-muted)',
                }}
              >
                {resultMsg}
              </div>
            </div>
            {/* Ambient "in flight" pulse — purely decorative, no contract id, never gates Track A. */}
            {stage === 'running' && (
              <div
                className="absolute inset-0 pointer-events-none animate-pulse"
                style={{
                  background:
                    'radial-gradient(60% 60% at 50% 85%, color-mix(in srgb, var(--color-green) 10%, transparent) 0%, transparent 70%)',
                }}
              />
            )}
          </div>

          <div className="divider my-5 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Recent crashes</h4>
            <div className="history-list flex flex-wrap gap-1.5" id="history">
              {[...history].reverse().map((r) => (
                <Reveal key={r.id} as="span" preset="scaleIn" duration={0.22}>
                  <span
                    className={`pill num rounded-md ${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${r.mult >= 2 ? 'win' : 'lose'}`}
                    style={{
                      background:
                        r.mult >= 2
                          ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                          : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                      color: r.mult >= 2 ? 'var(--color-green)' : 'var(--color-red)',
                    }}
                  >
                    {r.mult.toFixed(2)}×
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
              Auto cash-out at (0 = off, manual only)
            </label>
            <input
              ref={autoRef}
              id="autoInput"
              type="number"
              min="0"
              step="0.1"
              defaultValue="2.0"
              className="input w-full rounded-[10px] border px-3 py-2 text-text outline-none"
              style={{ borderColor: 'var(--glass-line)', background: 'var(--color-panel-2)' }}
            />
            <div className={`bet-row grid grid-cols-4 mt-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
              {AUTO_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={isMobile ? 'text-muted text-xs px-1' : 'text-muted'}
                  onClick={() => applyAutoPreset(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className={`stat-grid grid grid-cols-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            <Stat k="If cashed now" v={<span ref={potPayRef} id="potPay">—</span>} />
            <Stat k="Last round" v={<span id="lastRound">{lastRound}</span>} />
          </div>

          <Button
            id="placeBetBtn"
            variant="green"
            size="lg"
            block
            disabled={stage !== 'idle'}
            onClick={fire}
            className="mt-4"
          >
            Place Bet
          </Button>
          <Button
            id="cashOutBtn"
            variant="red"
            size="lg"
            block
            disabled={stage !== 'running' || cashedOut}
            onClick={onCashOutClick}
            className="mt-2.5"
          >
            Cash Out
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
