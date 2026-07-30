import type { JSX } from 'react'
import { useAgentStore } from '@/platform/agent/useAgent'
import type { AgentLogEvent } from '@/platform/agent/types'
import { money } from '@/platform/money/format'
import { Icon } from '@/platform/icons'

/* ============================================================
   LabLog — the move-by-move event log.

   Ported from js/agent/agent-lab.js's `renderLog()` (~680-710). Reads
   `royalAgent.getLog()` FRESH on every render rather than caching it in
   local state: this component subscribes to `stats` (which the store
   replaces on every agent `onUpdate` tick, useAgent.ts), so a re-render is
   guaranteed exactly when the log has something new, and `getLog()` always
   returns the agent's own current array.

   `AgentLogEvent` is deliberately loose (`{ kind: string } & Record<string,
   unknown>` — types.ts) because the real shape is heterogeneous per
   `kind`. Narrowed here, at the one place that actually reads it, per that
   type's own doc comment.
   ============================================================ */

const MAX_ROWS = 70

const rowStyle = { borderColor: 'var(--glass-line)', background: 'var(--glass)' }
const loanRowStyle = { borderColor: 'rgba(255,77,109,0.35)', background: 'rgba(255,77,109,0.08)' }

function fmtBetString(e: AgentLogEvent): string {
  const bets = e.bets
  if (Array.isArray(bets)) {
    return bets
      .map((b) => (b && typeof b === 'object' ? `${(b as Record<string, unknown>).spot}:${(b as Record<string, unknown>).amount}` : ''))
      .join(' ')
  }
  const detail = e.detail
  if (detail && typeof detail === 'object') {
    return Object.entries(detail as Record<string, unknown>).map(([k, v]) => `${k}:${v}`).join(' ')
  }
  return ''
}

/** One row, narrowed on `kind` — mirrors legacy's if/else chain
 *  (agent-lab.js:685-709), one branch per event kind. */
function LogRow({ e }: { e: AgentLogEvent }): JSX.Element {
  if (e.kind === 'result') {
    const delta = Number(e.delta) || 0
    const balance = Number(e.balance) || 0
    const win = delta > 0
    return (
      <div className="lab-log-row rounded-[8px] border px-2.5 py-1.5 text-[12px]" style={rowStyle}>
        <span style={{ color: win ? 'var(--color-green)' : delta < 0 ? 'var(--color-red)' : undefined }}>
          — round {String(e.round ?? '')}: {delta >= 0 ? '+' : '-'}
          {money(delta)} → {money(balance)}
        </span>
      </div>
    )
  }

  if (e.kind === 'loan') {
    // Desperate financing — the agent went broke and borrowed to keep
    // playing. Visually distinct (warning treatment) per the build spec.
    return (
      <div className="lab-log-row loan rounded-[8px] border px-2.5 py-1.5 text-[12px]" style={loanRowStyle}>
        <Icon name="banknote" size={13} className="mr-1 inline align-[-2px]" style={{ color: 'var(--color-red)' }} />
        <b>{String(e.label ?? 'Desperate loan')}</b> +{money(Number(e.amount) || 0)}
        {e.reason ? <span className="text-muted"> — “{String(e.reason)}”</span> : null}
      </div>
    )
  }

  if (e.kind === 'break') {
    const actualMs = Number(e.actualMs) || 0
    return (
      <div className="lab-log-row rounded-[8px] border px-2.5 py-1.5 text-[12px] text-muted" style={rowStyle}>
        <Icon name="coffee" size={13} className="mr-1 inline align-[-2px]" />
        Break {String(e.phase ?? '')}
        {actualMs ? ` (${Math.round(actualMs / 1000)}s)` : ''}
      </div>
    )
  }

  if (e.kind === 'session') {
    const starting = e.phase === 'start'
    return (
      <div className="lab-log-row rounded-[8px] border px-2.5 py-1.5 text-[12px] text-muted" style={rowStyle}>
        <Icon name={starting ? 'play' : 'square'} size={13} className="mr-1 inline align-[-2px]" />
        {starting ? 'Session started' : `Session stopped — ${String(e.trigger ?? '')}`}
      </div>
    )
  }

  // Default: a move ("bet"/"hit"/"stay"/... — whatever the adapter reported).
  const betStr = fmtBetString(e)
  const latencyMs = Number(e.latencyMs) || 0
  return (
    <div className="lab-log-row move rounded-[8px] border px-2.5 py-1.5 text-[12px]" style={rowStyle}>
      <span>
        #{String(e.round ?? '')} {String(e.game ?? '')} · <b>{String(e.action ?? '')}</b> {betStr}
      </span>{' '}
      {e.fallback ? (
        <span className="rounded-[6px] px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--color-glass-2)', color: 'var(--color-gold)' }}>
          fallback
        </span>
      ) : latencyMs ? (
        <span className="rounded-[6px] px-1.5 py-0.5 text-[10px] text-muted" style={{ background: 'var(--color-glass-2)' }}>
          {latencyMs}ms
        </span>
      ) : null}
      {e.reason ? <div className="mt-0.5 text-faint italic">“{String(e.reason)}”</div> : null}
    </div>
  )
}

export function LabLog(): JSX.Element {
  const agent = useAgentStore((s) => s.agent)
  // Subscribed for the re-render trigger only — see file-level comment.
  useAgentStore((s) => s.stats)
  const log = agent.getLog()

  if (log.length === 0) {
    return (
      <div className="lab-log-empty rounded-[10px] border px-3 py-4 text-center text-[13px] text-muted" style={rowStyle}>
        Press Start to watch the AI play.
      </div>
    )
  }

  // Reverse-chronological, capped — matches legacy's `rows.length < 70`
  // walk from the end of the array (agent-lab.js:685).
  const rows: JSX.Element[] = []
  for (let i = log.length - 1; i >= 0 && rows.length < MAX_ROWS; i--) {
    rows.push(<LogRow key={i} e={log[i]} />)
  }

  return <div className="lab-log flex flex-col gap-1.5">{rows}</div>
}
