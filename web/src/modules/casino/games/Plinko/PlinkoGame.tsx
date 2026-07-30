import { useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Plinko — ported from js/games/plinko.js. A genuine Galton board: drop a
   ball, it caroms 50/50 off each peg row, and lands in one of `rows+1`
   slots. TABLES below is copied verbatim from plinko.js:15-31 — it's the
   real payout math (one table per (rows, risk) pair, tuned so
   Σ P(slot)·multiplier ≈ 0.99), not decoration, so it is not "simplified".

   *** TWO-TRACK MOTION — READ THIS BEFORE TOUCHING drop() ***
   Legacy plinko.js resolves game truth (which slot, what multiplier, the
   payout, and the `#ballsLive` count the agent polls) entirely INSIDE its
   rAF loop (frame() / stepBall() / landBall(), plinko.js:227-282,357-376).
   rAF callbacks are SUSPENDED the instant a tab is backgrounded — exactly
   when an unattended agent is most likely to be running. Since agent-ui.js
   resolves a drop with
     $("#dropBtn").click();
     await waitFor(() => $("#ballsLive").textContent === "0", 12000);
   (agent-ui.js:1419-1421), a legacy-shaped port would hang that `waitFor`
   forever the moment the tab loses focus. This port does not carry that
   bug over — it is split into two independent tracks:

     TRACK A (truth — must never depend on rAF). `drop()` computes the
     FULL outcome synchronously, up front, before doing anything else: the
     peg-by-peg bounce decisions, the landing `slotIndex`, the multiplier,
     the payout — exactly like legacy's `makeBall()` (cheat-rigging
     included, see `decideDrop()` below). `#ballsLive` is bumped with a
     raw, synchronous `textContent` write on the real DOM node the instant
     the ball is "in flight" (see `writeBallsLive()`/`ballsLiveRef` below)
     — not routed through React state — because the agent's very first
     poll of `#ballsLive` happens with NO `await` between the click and
     the read (waitFor's `pred()` runs before its first `sleep`), so this
     can't wait on a React commit to land; it has to be true the instant
     the click handler returns, same as legacy's own "sync so callers see
     it immediately" comment at plinko.js:389. The round's actual
     resolution — decrementing `#ballsLive`, calling `payout()`, and
     recording history/`#lastMult` — is then scheduled with a plain
     `setTimeout(..., LAND_MS)`: a macrotask timer that fires on schedule
     whether or not the tab is visible and whether or not a single rAF
     frame ever runs.

     TRACK B (visual polish — may stall or skip frames in a backgrounded
     tab, and that is fine). A canvas + `requestAnimationFrame` loop
     animates a ball bouncing down the SAME precomputed path Track A
     already committed to, for a user who is actually watching. It never
     decides an outcome and it never gates Track A's timer.

   Nothing the agent contract reads (`#ballsLive`, wallet balance, payout)
   is ever written from inside the rAF loop (`frame()`) below — only
   peg-glow/slot-flash/ball-position, all cosmetic.
   ============================================================ */

// ---- Payout tables, verbatim from plinko.js:15-31. ----
const TABLES: Record<8 | 12 | 16, Record<'low' | 'medium' | 'high', number[]>> = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
}

type Rows = 8 | 12 | 16
type Risk = 'low' | 'medium' | 'high'

const ROW_OPTIONS: Rows[] = [8, 12, 16]
const RISK_OPTIONS: Risk[] = ['low', 'medium', 'high']

/** How long Track A waits before resolving a drop (decrement #ballsLive,
 *  pay out, log history). Deliberately just "a plausible bounce duration"
 *  — it does not need to match Track B's animation frame-for-frame, it
 *  only needs to fire on schedule, which a `setTimeout` guarantees and an
 *  rAF loop does not. */
const LAND_MS = 1500

const G_FACTOR = 100 // gravity (px/s² per px of row spacing), legacy plinko.js:115
const HOP_FACTOR = 0.5 // peg-bounce apex height as a fraction of row spacing, plinko.js:116

/** Slot-label formatting — legacy draw() (plinko.js:324-325): strips a
 *  redundant trailing ".0" (13.0× -> 13×). */
function formatSlotLabel(m: number): string {
  const label = m >= 100 ? `${m}×` : `${m.toFixed(m < 10 ? (m % 1 ? 1 : 0) : 0)}×`
  return label.replace('.0×', '×')
}

/** #lastMult / toast / history-pill formatting — legacy landBall()
 *  (plinko.js:276) and updateHistory() (plinko.js:396), verbatim. */
function formatDropResult(m: number): string {
  return m >= 100 ? `${m}×` : `${m.toFixed(m < 10 ? 2 : 0)}×`
}

/** #maxMult formatting — legacy updateInfo() (plinko.js:404), verbatim. */
function formatMaxMult(m: number): string {
  return `${m >= 100 ? m : m.toFixed(m < 10 ? 1 : 0)}×`
}

/** Color a multiplier by magnitude: cool < 1×, green ~1×, gold mid, red hot. */
function slotColor(m: number): string {
  if (m < 1) return '#4d8cff'
  if (m < 2) return '#3ecf8e'
  if (m < 10) return '#e6c15a'
  return '#ef4d6a'
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

type Peg = { x: number; y: number; glow: number }
type Slot = { x0: number; x1: number; cx: number; mult: number; flash: number }
type PathPoint = { x: number; y: number }

type Layout = {
  rows: Rows
  pegs: Peg[]
  slots: Slot[]
  spacingX: number
  spacingY: number
  topY: number
  bucketY: number
  pegR: number
  ballR: number
  centerX: number
}

/** Board geometry — legacy layout() (plinko.js:120-156), verbatim math. */
function computeLayout(cssW: number, cssH: number, rows: Rows, mults: number[]): Layout {
  /* The bottom row holds rows+1 buckets, not `rows` — bucket b spans
     [cx - spacingX/2, cx + spacingX/2] around centerX + (b - rows/2)*spacingX,
     so the multiplier row is (rows+1)*spacingX wide. Dividing the board by
     `rows` therefore made it exactly one pitch wider than the canvas and the
     end multipliers hung off both edges. Dividing by rows+1 makes the bucket
     row land flush inside the margins, and narrows the peg pyramid to match
     (pegs and buckets MUST share a pitch or the ball stops lining up with
     the slot it was decided to land in). */
  const sideMargin = Math.max(28, Math.min(70, cssW * 0.07))
  const spacingX = (cssW - sideMargin * 2) / (rows + 1)
  const bottomGap = 46
  const topY = 30
  const spacingY = (cssH - bottomGap - topY) / rows
  const centerX = cssW / 2
  const pegR = Math.max(2, Math.min(4.5, spacingX * 0.11))
  const ballR = Math.max(4, Math.min(9, spacingX * 0.26))

  const pegs: Peg[] = []
  for (let r = 0; r < rows; r++) {
    const y = topY + r * spacingY
    for (let k = 0; k <= r; k++) {
      const off = k - r / 2
      pegs.push({ x: centerX + off * spacingX, y, glow: 0 })
    }
  }
  const bucketY = topY + (rows - 1) * spacingY + spacingY * 0.9

  const slots: Slot[] = mults.map((m, b) => {
    const cx = centerX + (b - rows / 2) * spacingX
    return { x0: cx - spacingX / 2, x1: cx + spacingX / 2, cx, mult: m, flash: 0 }
  })

  return { rows, pegs, slots, spacingX, spacingY, topY, bucketY, pegR, ballR, centerX }
}

/**
 * TRACK A. Fair coin-flip decisions -> landing slot, with the same
 * cheat-rig legacy's makeBall() uses (plinko.js:159-185): when the rig is
 * on, steer the ball to a random slot that pays >= 1×. This is the single
 * source of truth for a drop's outcome — the canvas animation below
 * consumes it, it never recomputes it.
 */
function decideDrop(rows: Rows, mults: number[]): { decisions: number[]; slotIndex: number } {
  let decisions: number[] = []
  let sum = 0
  for (let r = 0; r < rows; r++) {
    const dir = Math.random() < 0.5 ? -1 : 1
    decisions.push(dir)
    sum += dir
  }
  let slotIndex = (sum + rows) / 2

  if (cheatWin()) {
    const paying = mults.map((m, i) => (m >= 1 ? i : -1)).filter((i) => i >= 0)
    if (paying.length) {
      const targetSlot = paying[Math.floor(Math.random() * paying.length)]
      const arr = new Array(rows).fill(-1)
      const idxs = [...Array(rows).keys()]
      for (let m = 0; m < targetSlot; m++) {
        const p = idxs.splice(Math.floor(Math.random() * idxs.length), 1)[0]
        arr[p] = 1
      }
      decisions = arr
      slotIndex = targetSlot
    }
  }

  return { decisions, slotIndex }
}

/** Waypoints: spawn -> each peg row -> slot mouth. legacy makeBall()
 *  path-building, plinko.js:188-194. */
function buildPath(layout: Layout, rows: Rows, decisions: number[]): PathPoint[] {
  const { centerX, topY, spacingY, spacingX, bucketY } = layout
  const path: PathPoint[] = [{ x: centerX, y: topY - spacingY * 0.8 }]
  let cum = 0
  for (let r = 0; r < rows; r++) {
    path.push({ x: centerX + (cum / 2) * spacingX, y: topY + r * spacingY })
    cum += decisions[r]
  }
  path.push({ x: centerX + (cum / 2) * spacingX, y: bucketY })
  return path
}

type VisualBall = {
  path: PathPoint[]
  slotIndex: number
  seg: number
  segT: number
  segDur: number
  vx: number
  x: number
  y: number
  squash: number
  settled: boolean
  settleT: number
  _ax: number
  _ay: number
  _vu: number
}

function makeVisualBall(path: PathPoint[], slotIndex: number): VisualBall {
  return {
    path,
    slotIndex,
    seg: 0,
    segT: 0,
    segDur: 0,
    vx: 0,
    x: path[0].x,
    y: path[0].y,
    squash: 0,
    settled: false,
    settleT: 0,
    _ax: path[0].x,
    _ay: path[0].y,
    _vu: 0,
  }
}

/** legacy beginSegment(), plinko.js:210-225, verbatim. */
function beginSegment(ball: VisualBall, layout: Layout) {
  const a = ball.path[ball.seg]
  const b = ball.path[ball.seg + 1]
  const g = layout.spacingY * G_FACTOR
  const dy = b.y - a.y
  const vu = ball.seg === 0 ? 0 : Math.sqrt(2 * g * layout.spacingY * HOP_FACTOR)
  const T = (vu + Math.sqrt(vu * vu + 2 * g * dy)) / g
  ball.segDur = T
  ball.segT = 0
  ball.vx = (b.x - a.x) / T
  ball._ax = a.x
  ball._ay = a.y
  ball._vu = vu
}

/** legacy stepBall(), plinko.js:227-251, verbatim (minus the direct
 *  landBall()/payout call — TRACK B never resolves truth, see file
 *  header). Returns true the first frame the ball settles. */
function stepBall(
  ball: VisualBall,
  dt: number,
  layout: Layout,
  rows: number,
  onPegHit: (x: number, y: number) => void,
): boolean {
  if (ball.settled) {
    ball.settleT += dt
    return false
  }
  const g = layout.spacingY * G_FACTOR
  ball.segT += dt
  const t = Math.min(ball.segT, ball.segDur)
  ball.x = ball._ax + ball.vx * t
  ball.y = ball._ay - ball._vu * t + 0.5 * g * t * t

  if (ball.segT >= ball.segDur) {
    ball.seg++
    if (ball.seg >= 1 && ball.seg <= rows) {
      ball.squash = 1
      onPegHit(ball.x, ball.y)
    }
    if (ball.seg >= ball.path.length - 1) {
      ball.settled = true
      const last = ball.path[ball.path.length - 1]
      ball.x = last.x
      ball.y = last.y
      return true
    }
    beginSegment(ball, layout)
  }
  if (ball.squash > 0) ball.squash = Math.max(0, ball.squash - dt * 11)
  return false
}

/** legacy pingNearestPeg(), plinko.js:253-260, verbatim. */
function pingNearestPeg(layout: Layout, x: number, y: number) {
  let best: Peg | null = null
  let bd = Infinity
  for (const p of layout.pegs) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bd) {
      bd = d
      best = p
    }
  }
  if (best && bd < (layout.spacingX * 0.9) ** 2) best.glow = 1
}

/** legacy draw(), plinko.js:285-355, verbatim — cosmetic only (TRACK B). */
function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, layout: Layout, balls: VisualBall[]) {
  ctx.clearRect(0, 0, w, h)

  for (const p of layout.pegs) {
    const glow = p.glow
    if (glow > 0) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, layout.pegR + 4 * glow, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(246,217,122,${0.35 * glow})`
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(p.x, p.y, layout.pegR, 0, Math.PI * 2)
    ctx.fillStyle = glow > 0 ? '#f6d97a' : '#8a96ad'
    ctx.fill()
    p.glow = Math.max(0, glow - 0.04)
  }

  const slotTop = layout.bucketY + layout.ballR + 2
  const slotH = Math.max(20, Math.min(34, layout.spacingY * 0.9))
  const fontPx = layout.rows >= 16 ? 9 : layout.rows >= 12 ? 10 : 12
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${fontPx}px Inter, sans-serif`
  for (const s of layout.slots) {
    const col = slotColor(s.mult)
    const y = slotTop + s.flash * -3
    const pad = 1.5
    roundRect(ctx, s.x0 + pad, y, s.x1 - s.x0 - pad * 2, slotH, 5)
    const a = 0.16 + 0.6 * s.flash
    ctx.fillStyle = hexA(col, a)
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = hexA(col, 0.5 + 0.5 * s.flash)
    ctx.stroke()
    ctx.fillStyle = s.flash > 0.2 ? '#0a0e17' : col
    ctx.fillText(formatSlotLabel(s.mult), s.cx, y + slotH / 2 + 0.5)
    s.flash = Math.max(0, s.flash - 0.03)
  }

  for (const ball of balls) {
    const sq = ball.squash
    const rx = layout.ballR * (1 + sq * 0.08)
    const ry = layout.ballR * (1 - sq * 0.08)
    const grad = ctx.createRadialGradient(
      ball.x - rx * 0.34,
      ball.y - ry * 0.36,
      ry * 0.15,
      ball.x,
      ball.y,
      rx * 1.05,
    )
    grad.addColorStop(0, '#fffaf0')
    grad.addColorStop(0.42, '#ffdc86')
    grad.addColorStop(1, '#d9a52e')
    ctx.beginPath()
    ctx.ellipse(ball.x, ball.y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.shadowColor = 'rgba(240,194,79,0.75)'
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.arc(ball.x - rx * 0.33, ball.y - ry * 0.36, Math.max(1, layout.ballR * 0.2), 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fill()
  }
}

type HistoryRow = { id: number; mult: number; win: boolean }

export default function PlinkoGame() {
  const betRef = useBetRef()
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The raw #ballsLive DOM node — TRACK A writes its textContent directly
  // and synchronously (see the file header). React never binds this node's
  // children to state, so its own re-renders (history/lastMult updates,
  // etc.) always re-emit the same literal "0" child and leave our
  // imperative write alone — the identical trick BetField's #betInput
  // already relies on for the same "the agent's raw write must never be
  // swallowed" reason.
  const ballsLiveRef = useRef<HTMLSpanElement>(null)
  const ballsLiveCountRef = useRef(0)

  const layoutRef = useRef<Layout | null>(null)
  const visualBallsRef = useRef<VisualBall[]>([])
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef(0)
  const historyIdRef = useRef(0)

  // Board height is derived from the stage's actual width, not a fixed px
  // value — a fixed 460px height read as a tall, narrow column once the
  // panel narrowed below ~500px (e.g. the two-column GameLayout at
  // 1024-1280px viewports), since spacingX (peg pitch) shrank with the
  // panel while the board stayed exactly as tall. Clamping height to a
  // fraction of width keeps the board landscape-proportioned at every
  // panel width instead of only at wide viewports.
  const [boardH, setBoardH] = useState(400)

  const [rows, setRows] = useState<Rows>(12)
  const [risk, setRisk] = useState<Risk>('medium')
  const [betView, setBetView] = useState(20)
  const [lastMultText, setLastMultText] = useState('—')
  const [history, setHistory] = useState<HistoryRow[]>([])
  // Mirrors ballsLiveCountRef for React's own reconciliation. The raw
  // textContent write below is still what the agent's zero-await first poll
  // sees (see file header), but without this, an UNRELATED re-render (e.g.
  // the bet field's onChange firing while a ball is mid-air) would reconcile
  // #ballsLive's child back to whatever literal JSX last rendered, silently
  // zeroing out a still-in-flight count. Keeping state in sync (async is
  // fine — it only needs to catch up before the NEXT unrelated re-render,
  // not before the agent's poll) closes that window.
  const [ballsLiveView, setBallsLiveView] = useState(0)

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const mults = TABLES[rows][risk]
  const maxMult = Math.max(...mults)
  const topProfit = betView > 0 ? betView * maxMult - betView : null

  function writeBallsLive(n: number) {
    const node = ballsLiveRef.current
    if (node) node.textContent = String(n)
    setBallsLiveView(n)
  }

  function relayout() {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const cssW = canvas.clientWidth || stage.clientWidth
    const cssH = canvas.clientHeight || stage.clientHeight
    if (!cssW || !cssH) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    layoutRef.current = computeLayout(cssW, cssH, rows, TABLES[rows][risk])
    if (ctx) drawScene(ctx, cssW, cssH, layoutRef.current, visualBallsRef.current)
  }

  /* TRACK B loop. Reads/mutates layoutRef + visualBallsRef only — nothing
     here ever touches the wallet, #ballsLive, or history. */
  function frame(ts: number) {
    const canvas = canvasRef.current
    const layout = layoutRef.current
    if (!canvas || !canvas.isConnected || !layout) {
      rafRef.current = null
      return
    }
    const dt = Math.min(0.032, lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0.016)
    lastTsRef.current = ts

    for (const ball of visualBallsRef.current) {
      const justLanded = stepBall(ball, dt, layout, rows, (x, y) => pingNearestPeg(layout, x, y))
      if (justLanded) {
        const slot = layout.slots[ball.slotIndex]
        if (slot) slot.flash = 1
      }
    }
    visualBallsRef.current = visualBallsRef.current.filter((b) => !(b.settled && b.settleT > 0.35))

    const ctx = canvas.getContext('2d')
    if (ctx) drawScene(ctx, canvas.clientWidth, canvas.clientHeight, layout, visualBallsRef.current)

    const stillAnimating =
      visualBallsRef.current.length > 0 || layout.slots.some((s) => s.flash > 0) || layout.pegs.some((p) => p.glow > 0)

    if (stillAnimating) {
      rafRef.current = requestAnimationFrame(frame)
    } else {
      rafRef.current = null
      lastTsRef.current = 0
    }
  }

  function ensureLoop() {
    if (rafRef.current == null) {
      lastTsRef.current = 0
      rafRef.current = requestAnimationFrame(frame)
    }
  }

  // Geometry depends on rows (peg-pyramid shape); in-flight ball paths
  // were built for the OLD geometry, so they're cleared, exactly like
  // legacy setRows() (plinko.js:419-428).
  useEffect(() => {
    visualBallsRef.current = []
    relayout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  // Risk only changes the slot multipliers/colors, not the peg pyramid —
  // legacy setRisk() (plinko.js:409-417) does not clear in-flight balls.
  useEffect(() => {
    relayout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk])

  // Track the stage's own width (independent of its height, which is
  // itself derived FROM this width below) and keep the board
  // landscape-proportioned: min 260px tall so pegs never crowd into an
  // unreadable pile, max 460px so a very wide panel doesn't turn the board
  // into a stretched slab. A ResizeObserver catches sidebar-toggle/panel
  // reflows a bare window "resize" listener would miss.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const updateHeight = () => {
      const w = stage.clientWidth - 50
      if (!w) return
      // A real Plinko board reads as unmistakably wide/flat — 1.45 kept it
      // landscape but only mildly so (still looked "tall" against that
      // reference at ordinary panel widths). 2.2 plus a lower cap pushes it
      // to a genuinely flat proportion at every width.
      const h = Math.round(Math.min(600, Math.max(100, w / 1)))
      setBoardH((prev) => (prev === h ? prev : h))
    }
    updateHeight()
    const ro = new ResizeObserver(updateHeight)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    relayout()
    const onResize = () => relayout()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-run the board layout once boardH settles to its real (width-derived)
  // value — otherwise the canvas keeps the very first (initial-guess)
  // height until an unrelated rows/risk change happens to relayout it.
  useEffect(() => {
    relayout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardH])

  function drop() {
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      toast('Not enough cash for that bet.', 'lose')
      return
    }

    /* ---- TRACK A: truth, resolved synchronously, right here. ---- */
    const tableMults = TABLES[rows][risk]
    const { decisions, slotIndex } = decideDrop(rows, tableMults)
    const mult = tableMults[slotIndex]
    const won = Math.floor(bet * mult)
    const net = won - bet

    // #ballsLive must read non-"0" the instant this handler returns — see
    // the file header. Raw DOM write, not React state.
    ballsLiveCountRef.current += 1
    writeBallsLive(ballsLiveCountRef.current)

    // Resolution is a plain macrotask timer — never gated on rAF/Track B.
    setTimeout(() => {
      ballsLiveCountRef.current = Math.max(0, ballsLiveCountRef.current - 1)
      writeBallsLive(ballsLiveCountRef.current)

      if (won > 0) payout(won)
      sound.play(net > 0 ? (mult >= 10 ? 'bigwin' : 'win') : 'lose')

      setLastMultText(formatDropResult(mult))
      setHistory((h) => [...h.slice(-13), { id: ++historyIdRef.current, mult, win: net > 0 }])
      toast(`${formatDropResult(mult)} — ${net >= 0 ? 'won +' : 'lost '}${money(net)}`, net > 0 ? 'win' : 'lose')
    }, LAND_MS)

    /* ---- TRACK B: visual only, consumes the outcome Track A already
       committed to; never decides anything, never gates Track A. ---- */
    const layout = layoutRef.current
    if (layout) {
      const path = buildPath(layout, rows, decisions)
      const ball = makeVisualBall(path, slotIndex)
      beginSegment(ball, layout)
      visualBallsRef.current = [...visualBallsRef.current, ball]
      ensureLoop()
    }
  }

  return (
    <div>
      <PageHead
        title="Plinko"
        sub="Drop the ball and let it bounce down the pegs. Edge slots pay huge but are rare; the middle pays under 1×. Pick your risk and rows, then drop as many as you like."
        icon="git-fork"
      />

      <GameLayout>
        <Panel>
          <div
            id="plinkoStage"
            ref={stageRef}
            className="plinko-stage relative w-full overflow-hidden rounded-2xl"
            style={{
              height: boardH,
              background: 'radial-gradient(120% 90% at 50% -10%, #10192b, #0a0f1a 70%)',
              border: '1px solid var(--glass-line)',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
            }}
          >
            <canvas id="plinkoCanvas" ref={canvasRef} className="plinko-canvas absolute inset-0 h-full w-full" />
          </div>

          <div className="divider my-5 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="mb-2 text-xs uppercase tracking-wide text-muted">Recent drops</h4>
            <div className="history-list flex flex-wrap gap-1.5" id="history">
              {[...history].reverse().map((r) => (
                <Reveal key={r.id} as="span" preset="scaleIn" duration={0.22}>
                  <span
                    className={`pill num rounded-md px-2 py-1 text-xs ${r.win ? 'win' : 'lose'}`}
                    style={{
                      background: r.win
                        ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                        : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                      color: r.win ? 'var(--color-green)' : 'var(--color-red)',
                    }}
                  >
                    {formatDropResult(r.mult)}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} onChange={setBetView} />

          <div className="field mb-4">
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted">Risk</label>
            <div className="bet-row grid grid-cols-3 gap-2" id="riskRow">
              {RISK_OPTIONS.map((r) => (
                <Button
                  key={r}
                  data-risk={r}
                  onClick={() => setRisk(r)}
                  variant={risk === r ? 'green' : 'ghost'}
                  className={risk === r ? undefined : 'text-muted'}
                >
                  {r[0].toUpperCase() + r.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <div className="field mb-4">
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted">Rows</label>
            <div className="bet-row grid grid-cols-3 gap-2" id="rowsRow">
              {ROW_OPTIONS.map((n) => (
                <Button
                  key={n}
                  data-rows={n}
                  onClick={() => setRows(n)}
                  variant={rows === n ? 'green' : 'ghost'}
                  className={rows === n ? undefined : 'text-muted'}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>

          {/* #maxMult/#ballsLive are numeric contract ids (contractIds.ts,
              both in NUMERIC_CONTRACT_IDS) — plain text nodes, deliberately
              not AnimatedNumber, so the "this must never tween" contract is
              obvious from the code itself, not just from a guard elsewhere. */}
          <div className="stat-grid grid grid-cols-2 gap-2">
            <Stat k="Top slot" v={<span id="maxMult">{formatMaxMult(maxMult)}</span>} />
            <Stat k="Balls in play" v={<span id="ballsLive" ref={ballsLiveRef}>{ballsLiveView}</span>} />
            <Stat k="Last drop" v={<span id="lastMult">{lastMultText}</span>} />
            <Stat
              k="Profit on top"
              v={<span id="topProfit">{topProfit == null ? '—' : `+${fmt(topProfit)}`}</span>}
            />
          </div>

          <Button id="dropBtn" variant="green" size="lg" block onClick={drop} className="mt-4">
            Drop Ball
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
