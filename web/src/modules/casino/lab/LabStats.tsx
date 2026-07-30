import type { JSX, ReactNode } from 'react'
import { useAgentStore } from '@/platform/agent/useAgent'
import type { AgentStats } from '@/platform/agent/types'
import { fmt, money } from '@/platform/money/format'
import { AnimatedNumber } from '@/platform/motion'
import { Stat } from '@/platform/ui'
import type { StatTone } from '@/platform/ui'

/* ============================================================
   LabStats — the telemetry tile grid.

   Ported (content, not markup) from js/agent/agent-lab.js's `STATS` array
   and `buildStats()`/`renderStats()` (~lines 44-62, 494-546). Legacy built
   the tiles ONCE and mutated them in place so CountUp.js kept a stable
   node; React doesn't need that trick — `AnimatedNumber` already owns its
   own node across re-renders (platform/motion/AnimatedNumber.tsx), so this
   component just re-derives the tile list from `stats` on every render.

   None of these ids/values are agent-contract (PHASE_2_AGENT_PLAN.md §5 —
   Lab telemetry, not in contractIds.ts), so AnimatedNumber is safe here.
   ============================================================ */

/** `(n>=0?'+':'-') + money(n)` — legacy's signed-money formatter, used all
 *  over agent-lab.js/agent-report.js for net/ROI-style figures. */
const signedMoney = (n: number) => (n >= 0 ? '+' : '-') + money(n)
const pct = (n: number, digits = 0) => n.toFixed(digits) + '%'
const toneOf = (n: number): StatTone => (n > 0 ? 'green' : n < 0 ? 'red' : 'default')

type Tile = {
  k: string
  label: string
  value: number
  format: (n: number) => string
  tone?: StatTone
  hide?: boolean
}

function buildTiles(s: AgentStats): Tile[] {
  return [
    { k: 'rounds', label: 'Rounds', value: s.rounds, format: fmt },
    { k: 'wins', label: 'Wins', value: s.wins, format: fmt, tone: 'green' },
    { k: 'losses', label: 'Losses', value: s.losses, format: fmt, tone: 'red' },
    { k: 'pushes', label: 'Pushes', value: s.pushes, format: fmt },
    { k: 'winRate', label: 'Win rate', value: s.winRate * 100, format: (v) => pct(v) },
    { k: 'net', label: 'Net', value: s.net, format: signedMoney, tone: toneOf(s.net) },
    { k: 'roi', label: 'ROI', value: s.roi * 100, format: (v) => (v >= 0 ? '+' : '') + pct(v, 1), tone: toneOf(s.roi) },
    { k: 'totalWagered', label: 'Total wagered', value: s.totalWagered, format: money },
    { k: 'avgBet', label: 'Avg bet', value: s.avgBet, format: money },
    { k: 'peak', label: 'Peak', value: s.peak, format: money },
    { k: 'trough', label: 'Trough', value: s.trough, format: money },
    { k: 'decisions', label: 'Decisions', value: s.decisions, format: fmt },
    {
      k: 'fallbackRate',
      label: 'Fallback rate',
      value: s.decisions ? s.fallbackRate * 100 : 0,
      format: (v) => (s.decisions ? pct(v) : '—'),
      tone: s.fallbacks > 0 ? 'red' : 'default',
    },
    { k: 'avgLatency', label: 'Avg latency', value: s.avgLatency || 0, format: (v) => (v ? Math.round(v) + 'ms' : '—') },
    { k: 'credits', label: 'Credits', value: s.credits, format: money },
    { k: 'start', label: 'Session start', value: s.start, format: money },
    { k: 'borrowed', label: 'Borrowed', value: s.borrowed, format: money, tone: 'red', hide: !(s.borrowed > 0) },
  ]
}

/** Waiting-for-first-tick placeholder — `stats` is `null` until `royalAgent`
 *  fires its first `onUpdate` (useAgent.ts). Not a crash state, just early. */
function StatsSkeleton(): JSX.Element {
  return (
    <div className="lab-stats grid grid-cols-2 gap-2 sm:grid-cols-3" data-lab="stats-empty">
      <div className="col-span-full rounded-[10px] border px-3 py-4 text-center text-[13px] text-muted" style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}>
        Waiting for the AI&rsquo;s first update&hellip;
      </div>
    </div>
  )
}

export function LabStats(): JSX.Element {
  const stats = useAgentStore((s) => s.stats)
  if (!stats) return <StatsSkeleton />

  const tiles = buildTiles(stats).filter((t) => !t.hide)
  const games = Object.entries(stats.perGame ?? {})

  const rows: ReactNode[] = tiles.map((t) => (
    <Stat key={t.k} k={t.label} v={<AnimatedNumber value={t.value} format={t.format} />} tone={t.tone} />
  ))

  // Stop reason isn't numeric (a short phrase like "flat broke" or "manual
  // stop") — rendered as a plain Stat, no AnimatedNumber, same as legacy's
  // non-numeric `wl`/`streak`/`tilt` tiles (agent-lab.js:46,54,58).
  if (stats.stopReason) rows.push(<Stat key="stopReason" k="Stop reason" v={stats.stopReason} />)

  return (
    <div className="lab-stats-wrap">
      <div className="lab-stats grid grid-cols-2 gap-2 sm:grid-cols-3">{rows}</div>
      {/* Per-game breakdown strip — ported from agent-lab.js:539-545
          (`$("labGames").innerHTML = ...`). Only worth showing once the AI
          has actually played more than one game this session. */}
      {games.length > 1 && (
        <div className="lab-games mt-2 flex flex-wrap gap-2 text-[12px] text-muted">
          {games.map(([game, r]) => (
            <span key={game} className="rounded-[8px] border px-2 py-1" style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}>
              <b className="text-text">{game}</b> {r.w}W/{r.l}L{' '}
              <span style={{ color: r.net > 0 ? 'var(--color-green)' : r.net < 0 ? 'var(--color-red)' : undefined }}>
                {signedMoney(r.net)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
