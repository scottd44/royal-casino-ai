import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { useAgentStore } from '@/platform/agent/useAgent'
import type { AgentRound } from '@/platform/agent/types'
import { fmt } from '@/platform/money/format'

/* ============================================================
   LabChart — the net-over-time canvas line chart.

   Ported (essential shape, not every pixel) from js/agent/agent-lab.js's
   `renderChart()` (~577-679): grid with "nice" $ step labels, a dashed
   baseline at the session's starting balance, a gradient area fill, the
   line itself, and an endpoint balance tag. Dropped from the legacy
   version: the mouse-hover crosshair readout (interactivity, not part of
   this component's spec) and the exact DPI-crisp resize-driven redraw
   loop — replaced with a plain `window resize` listener, which is enough
   for a drawer/modal chart that isn't itself resizable by the user.

   This is a plain canvas repaint (imperative `useEffect` + `useRef`), not
   a Framer Motion concern — PHASE_2_AGENT_PLAN.md §5 says as much for this
   exact component.

   Props are optional (`rounds?: AgentRound[]`) so `LabReportModal` can
   pass a frozen end-of-session snapshot while the live drawer view (no
   props) reads `agent.getRounds()` fresh on every render. `getRounds()`
   returns the SAME array reference while a session is running (agentUi.ts
   mutates it with `.push`, only reassigning on `newSession()`) — so this
   effect can't rely on that reference changing. It instead depends on
   `stats`, which the store replaces wholesale on every `onUpdate` tick
   (useAgent.ts), and re-reads the rounds fresh inside the effect. Per the
   plan's own note on this exact tradeoff (§5, LabChart bullet).
   ============================================================ */

export interface LabChartProps {
  rounds?: AgentRound[]
}

/** Round `raw` up to a "nice" grid step (1/2/5/10 x a power of ten).
 *  Verbatim port of agent-lab.js:568-571. */
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / p
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p
}

/** "1234" -> "1.2k". Verbatim port of agent-lab.js:573-575. */
function fmtShort(v: number): string {
  return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(v))
}

function draw(canvas: HTMLCanvasElement, rounds: AgentRound[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cssW = canvas.clientWidth || 280
  const cssH = canvas.clientHeight || 156
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  if (rounds.length === 0) {
    ctx.fillStyle = 'rgba(135,146,168,0.55)'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('P&L — start a session to chart the bankroll', cssW / 2, cssH / 2 + 4)
    return
  }

  // First round's balance minus its own delta = the balance the session
  // started with. Derived rather than threaded in as a prop, so a frozen
  // report snapshot needs nothing beyond its own `rounds` array.
  const start = rounds[0].balance - rounds[0].delta
  const vals = [start, ...rounds.map((r) => r.balance)]

  const padL = 42, padR = 10, padT = 12, padB = 8
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (max - min < 1) { max += 1; min -= 1 }
  const span = max - min
  min -= span * 0.1
  max += span * 0.1
  const x = (i: number) => padL + (i / (vals.length - 1)) * (cssW - padL - padR)
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (cssH - padT - padB)

  // horizontal grid + $ labels
  const step = niceStep((max - min) / 3)
  ctx.font = '9.5px Inter, sans-serif'
  ctx.textAlign = 'left'
  for (let gv = Math.ceil(min / step) * step; gv <= max; gv += step) {
    ctx.strokeStyle = 'rgba(35,45,64,0.6)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(padL, y(gv)); ctx.lineTo(cssW - padR, y(gv)); ctx.stroke()
    ctx.fillStyle = '#58627a'
    ctx.fillText('$' + fmtShort(gv), 4, y(gv) + 3)
  }

  // starting-balance baseline (gold, dashed)
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = 'rgba(240,194,79,0.5)'
  ctx.beginPath(); ctx.moveTo(padL, y(start)); ctx.lineTo(cssW - padR, y(start)); ctx.stroke()
  ctx.setLineDash([])

  const net = vals[vals.length - 1] - start
  const up = net >= 0
  const col = up ? '#22e59a' : '#ff4d6d'

  // gradient area fill under the line
  const grad = ctx.createLinearGradient(0, padT, 0, cssH - padB)
  grad.addColorStop(0, up ? 'rgba(34,229,154,0.30)' : 'rgba(255,77,109,0.30)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
  ctx.lineTo(x(vals.length - 1), cssH - padB)
  ctx.lineTo(x(0), cssH - padB)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // the line itself
  ctx.strokeStyle = col
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.beginPath()
  vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
  ctx.stroke()

  // endpoint dot + current-balance tag
  const li = vals.length - 1
  const lx = x(li), ly = y(vals[li])
  ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
  const tag = '$' + fmt(vals[li])
  ctx.font = '700 10px Inter, sans-serif'
  const tw = ctx.measureText(tag).width + 10
  const tx = Math.min(lx + 6, cssW - padR - tw)
  const ty = Math.max(padT, ly - 18)
  ctx.fillStyle = 'rgba(5,7,12,0.88)'
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(tx, ty, tw, 15, 4)
    ctx.fill()
  } else {
    ctx.fillRect(tx, ty, tw, 15)
  }
  ctx.fillStyle = col
  ctx.textAlign = 'left'
  ctx.fillText(tag, tx + 5, ty + 11)
}

export function LabChart({ rounds }: LabChartProps = {}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const agent = useAgentStore((s) => s.agent)
  // Not read directly here — its only job is to change identity on every
  // agent tick so the effect below re-fires for the live (no-`rounds`-prop)
  // case. See the file-level comment for why `agent.getRounds()`'s own
  // reference can't be trusted for that.
  const stats = useAgentStore((s) => s.stats)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const redraw = () => draw(canvas, rounds ?? agent.getRounds())
    redraw()
    window.addEventListener('resize', redraw)
    return () => window.removeEventListener('resize', redraw)
    // `agent` is a stable singleton reference (useAgent.ts); `rounds`/`stats`
    // are the two real triggers (frozen-snapshot vs. live ticking).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, stats])

  return <canvas ref={canvasRef} className="lab-chart block w-full" style={{ height: 156 }} aria-label="Net balance over the session" />
}
