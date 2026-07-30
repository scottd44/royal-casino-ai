import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useAgentStore } from '@/platform/agent/useAgent'
import type { AgentRound, AgentStats } from '@/platform/agent/types'
import { fmt, money } from '@/platform/money/format'
import { AnimatedNumber } from '@/platform/motion'
import { Button, Stat } from '@/platform/ui'
import { Modal, ModalBody, ModalHeader } from '@/platform/ui/Modal'
import { Icon } from '@/platform/icons'
import { LabChart } from './LabChart'

/* ============================================================
   LabReportModal — the end-of-session report.

   Port of js/agent/agent-report.js (216 lines): summary stats, a PNL
   chart, notable up/down swings, logged breaks, desperate financing, and
   the model's narrative text. Opens via `royalAgent.setOnReport(...)`
   (agentUi.ts:2114/2063 `onReport(report)` — fired once per
   `generateReport()` call, i.e. once per stopped/timed-out session).

   This component owns NO report-generation logic. `generateReport()`
   (agentUi.ts) already built the whole payload — including the AI-written
   narrative via a real LLM call — before handing it to `onReport`. This
   file only displays what it's given.
   ============================================================ */

const signedMoney = (n: number) => (n >= 0 ? '+' : '-') + money(n)

/** `report.stats` is `agentUi.ts`'s internal `stats()` return value, which
 *  carries two fields (`maxWinStreak`/`maxLossStreak`) that `AgentStats`
 *  (types.ts) doesn't declare — narrowed here rather than widening the
 *  shared type for two report-only fields. */
type ReportStats = AgentStats & { maxWinStreak: number; maxLossStreak: number }

type SwingInfo = { amount: number; from: number; to: number; game: string | null }

type DesperateMeasure = { n: number; action: string; label: string; amount: number; reason: string; t: number }

type BreakEntry = { start: number; end: number; durationMs: number }

/** The shape `agentUi.ts:generateReport` (~2034-2065) actually builds.
 *  `royalAgent.setOnReport`'s payload is typed `Record<string, unknown>`
 *  in types.ts (a different owner narrows it, per that field's own doc
 *  comment) — this is that narrowing, done once, at this one read site. */
type SessionReport = {
  trigger: string
  durationMs: number
  startCredits: number
  endCredits: number
  net: number
  borrowed: number
  netWithDebt: number
  desperateMeasures: DesperateMeasure[]
  gamesPlayed: string[]
  perGameNet: Record<string, number>
  stats: ReportStats
  biggestWin: number
  biggestLoss: number
  rounds: AgentRound[]
  breaks: BreakEntry[]
  swings: { upswing: SwingInfo; downswing: SwingInfo }
  model: string
  narrative: string
}

/** "1234 -> 20m 34s" / "90000 -> 1h 30m". Verbatim port of
 *  agent-report.js:71-75. */
function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`
}

function SwingCard({ label, icon, swing }: { label: string; icon: 'trending-up' | 'trending-down'; swing: SwingInfo }): JSX.Element {
  const tone = icon === 'trending-up' ? 'var(--color-green)' : 'var(--color-red)'
  return (
    <div className="report-swing rounded-[10px] border p-3" style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}>
      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        <Icon name={icon} size={14} style={{ color: tone }} />
        {label}
      </div>
      {swing.amount > 0 ? (
        <>
          <div className="mt-1 text-lg font-semibold" style={{ color: tone }}>
            {icon === 'trending-up' ? '+' : '-'}
            {fmt(swing.amount)}
          </div>
          <div className="text-[11px] text-faint">
            rounds {swing.from}–{swing.to}
            {swing.game ? ` · mostly ${swing.game}` : ''}
          </div>
        </>
      ) : (
        <div className="mt-1 text-[13px] text-faint">—</div>
      )}
    </div>
  )
}

function ReportContent({ report: r }: { report: SessionReport }): JSX.Element {
  const s = r.stats
  const perGame = Object.entries(r.perGameNet)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : '-'}${money(v)}`)
    .join(' · ') || '—'

  return (
    <div className="report-body flex flex-col gap-4">
      <div className="report-sub text-[13px] text-muted">
        Trigger: <b className="text-text">{r.trigger}</b> · {fmtDuration(r.durationMs)} · {r.gamesPlayed.join(', ') || '—'}
      </div>

      <div className="report-stats grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat k="Wallet net" v={<AnimatedNumber value={r.net} format={signedMoney} />} tone={r.net > 0 ? 'green' : r.net < 0 ? 'red' : 'default'} />
        {r.borrowed > 0 && (
          <>
            <Stat k="Borrowed (debt)" v={<AnimatedNumber value={r.borrowed} format={money} />} tone="red" />
            <Stat
              k="Real result"
              v={<AnimatedNumber value={r.netWithDebt} format={signedMoney} />}
              tone={r.netWithDebt < 0 ? 'red' : 'green'}
            />
          </>
        )}
        <Stat k="Start → End" v={`${money(r.startCredits)} → ${money(r.endCredits)}`} />
        <Stat k="Rounds" v={<AnimatedNumber value={s.rounds} />} />
        <Stat k="Win rate" v={<AnimatedNumber value={s.winRate * 100} format={(v) => v.toFixed(0) + '%'} />} />
        <Stat k="W / L" v={`${s.wins} / ${s.losses}`} />
        <Stat k="Biggest win" v={<AnimatedNumber value={r.biggestWin} format={(v) => '+' + money(v)} />} tone="green" />
        <Stat
          k="Biggest loss"
          v={<AnimatedNumber value={r.biggestLoss} format={money} />}
          tone={r.biggestLoss < 0 ? 'red' : 'default'}
        />
        <Stat k="Longest W/L" v={`${s.maxWinStreak}/${s.maxLossStreak}`} />
        <Stat k="Total wagered" v={<AnimatedNumber value={s.totalWagered} format={money} />} />
        <Stat k="Per game" v={perGame} />
      </div>

      <div className="report-section">
        <h4 className="mb-2 text-sm font-semibold text-text">Balance over the session (PNL)</h4>
        <LabChart rounds={r.rounds} />
      </div>

      <div className="report-swings grid grid-cols-2 gap-2">
        <SwingCard label="Biggest upswing" icon="trending-up" swing={r.swings.upswing} />
        <SwingCard label="Biggest downswing" icon="trending-down" swing={r.swings.downswing} />
      </div>

      {r.desperateMeasures.length > 0 && (
        <div className="report-section">
          <h4 className="mb-2 text-sm font-semibold text-text">Desperate measures</h4>
          <div
            className="desperate-summary mb-2 rounded-[10px] border p-3 text-[13px]"
            style={{ borderColor: 'rgba(255,77,109,0.35)', background: 'rgba(255,77,109,0.08)' }}
          >
            Went broke and borrowed <b>{money(r.borrowed)}</b> across {r.desperateMeasures.length} desperate move(s) to keep
            playing — leaving a real result of{' '}
            <b style={{ color: r.netWithDebt < 0 ? 'var(--color-red)' : 'var(--color-green)' }}>{signedMoney(r.netWithDebt)}</b>.
          </div>
          <div className="flex flex-col gap-1.5">
            {r.desperateMeasures.map((d) => (
              <div
                key={d.n}
                className="desperate-row rounded-[8px] border px-2.5 py-1.5 text-[12px]"
                style={{ borderColor: 'rgba(255,77,109,0.35)', background: 'rgba(255,77,109,0.06)' }}
              >
                <div className="flex items-center justify-between">
                  <span>
                    {d.n}. {d.label}
                  </span>
                  <span style={{ color: 'var(--color-red)' }}>+{money(d.amount)}</span>
                </div>
                {d.reason && <div className="mt-0.5 text-faint italic">“{d.reason}”</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {r.breaks.length > 0 && (
        <div className="report-section">
          <h4 className="mb-2 text-sm font-semibold text-text">Breaks</h4>
          <div className="flex flex-wrap gap-1.5">
            {r.breaks.map((b, i) => (
              <span
                key={`${b.start}-${i}`}
                className="rounded-[999px] border px-2.5 py-1 text-[11px] text-muted"
                style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
              >
                Break {i + 1}: {fmtDuration(b.durationMs)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="report-section">
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
          Performance narrative
          {r.model && <span className="text-[11px] font-normal text-faint">· {r.model}</span>}
        </h4>
        <div className="report-narrative whitespace-pre-wrap rounded-[10px] border p-3 text-[13px] leading-relaxed text-text" style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}>
          {r.narrative || '(no narrative)'}
        </div>
      </div>
    </div>
  )
}

export function LabReportModal(): JSX.Element {
  const agent = useAgentStore((s) => s.agent)
  const [report, setReport] = useState<SessionReport | null>(null)
  const [open, setOpen] = useState(false)

  // Registered exactly once (mount). `agent` is a stable module-level
  // singleton (useAgent.ts), so this effect never re-fires — matches
  // legacy's single `R.setOnReport(show)` call (agent-report.js:214).
  useEffect(() => {
    agent.setOnReport((payload) => {
      setReport(payload as unknown as SessionReport)
      setOpen(true)
    })
  }, [agent])

  const close = () => setOpen(false)

  return (
    <Modal open={open} onClose={close} labelledBy="lab-report-title" className="max-w-[640px]">
      <ModalHeader>
        <h2 id="lab-report-title" className="flex items-center gap-2 text-lg font-semibold text-text">
          <Icon name="chart-line" size={20} className="text-gold" />
          Session Report
        </h2>
        <Button variant="ghost" size="sm" onClick={close} aria-label="Close report">
          <Icon name="x" />
        </Button>
      </ModalHeader>
      <ModalBody>{report && <ReportContent report={report} />}</ModalBody>
    </Modal>
  )
}
