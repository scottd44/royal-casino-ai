import type { JSX } from 'react'
import { useAgentStore } from '@/platform/agent/useAgent'

/* ============================================================
   LabTiltMeter — the 0-100 tilt/emotions gauge.

   Ported from js/agent/agent-lab.js's `tiltMeterHTML()` (~29-40) and
   `renderTilt()` (~550-563). agent-ui.ts already computes `tilt` (0-100),
   `tiltEmoji`, and `tiltShort` every tick (agentUi.ts's `tiltState()`) —
   this component's whole job is to render that, not recompute it.

   Legacy translated the emoji to a Lucide icon to keep the chrome
   emoji-free (agent-lab.js:17-25 `TILT_ICON`). PHASE_2_AGENT_PLAN.md §5's
   spec for this component asks for "the emoji and short label" directly,
   so we render `stats.tiltEmoji` as-is rather than re-adding that mapping.
   ============================================================ */

const SCALE_LABELS = ['Ice', 'Steady', 'Tilted', 'Full'] as const

export function LabTiltMeter(): JSX.Element {
  const stats = useAgentStore((s) => s.stats)

  const t = stats ? Math.max(0, Math.min(100, stats.tilt)) : 0
  const emoji = stats?.tiltEmoji ?? '🧊'
  const short = stats?.tiltShort ?? 'Ice cold'

  // Cool -> hot ramp. `>=70` matches legacy's `.hot` threshold on the tilt
  // bar (agent-lab.js:562 `$(p + "TiltBar").classList.toggle("hot", ...)`);
  // the middle band gets an intermediate (gold) color rather than a binary
  // on/off, which legacy didn't do but is a reasonable, cheap addition.
  const fillColor = t >= 70 ? 'var(--color-red)' : t >= 40 ? 'var(--color-gold)' : 'var(--color-blue)'

  return (
    <div
      className="lab-tilt-meter rounded-[10px] border p-3"
      style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
    >
      <div className="tilt-head flex items-center gap-2 text-sm">
        <span className="text-lg leading-none" aria-hidden="true">
          {emoji}
        </span>
        <span className="flex-1 truncate text-text">{short}</span>
        <span className="tabular-nums text-muted">{stats ? t.toFixed(0) : '—'}</span>
      </div>
      <div
        className="tilt-bar mt-2 h-2 overflow-hidden rounded-full"
        style={{ background: 'var(--color-line-soft)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(t)}
        aria-label="Tilt"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${t}%`, background: fillColor }}
        />
      </div>
      <div className="tilt-scale mt-1 flex justify-between text-[10px] uppercase tracking-wide text-faint">
        {SCALE_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  )
}
