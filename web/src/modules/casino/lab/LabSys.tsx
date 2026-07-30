import { useEffect, useState } from 'react'

/* ============================================================
   LabSys -- the embedded system monitor. Ported (behavior, not markup)
   from js/agent/agent-lab.js's fetchSys()/renderSys()/bar()
   (~lines 742-793), which this React build never carried over.

   Polls the local monitor endpoint every 2s (paused while the tab is
   hidden, same as legacy) -- same-origin `/api/sysmon` first (serve.py),
   then the dedicated MONITOR.command port as a fallback. Neither endpoint
   exists in the Vite dev server by default, so "monitor is off" is the
   expected state unless one of those is actually running alongside it --
   that's why the off-state copy below still points at
   START-HERE.command/MONITOR.command, verbatim from the legacy string.
   ============================================================ */

type SysData = {
  available: boolean
  cpu: number
  gpu: number
  power: number
  ram_used: number
  ram_total: number
  cpu_temp: number
  gpu_temp: number
}

const UNAVAILABLE: SysData = {
  available: false,
  cpu: 0,
  gpu: 0,
  power: 0,
  ram_used: 0,
  ram_total: 0,
  cpu_temp: 0,
  gpu_temp: 0,
}

async function tryFetchSys(url: string): Promise<SysData | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) return (await res.json()) as SysData
  } catch {
    // endpoint not there -- fail soft, same as legacy's empty catch.
  }
  return null
}

/** Same-origin (serve.py) first, then the dedicated monitor port
 *  (MONITOR.command), agent-lab.js:783-791 verbatim. */
async function fetchSys(): Promise<SysData> {
  let d = await tryFetchSys('/api/sysmon')
  if (!d || !d.available) {
    const alt = await tryFetchSys('http://localhost:11435/api/sysmon')
    if (alt) d = alt
  }
  return d ?? UNAVAILABLE
}

const gb = (bytes: number) => bytes / 1073741824
const toF = (c: number) => Math.round((c * 9) / 5 + 32)

function Bar({ label, frac, color }: { label: string; frac: number; color: string }) {
  const pct = Math.max(0, Math.min(100, frac * 100))
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 shrink-0 text-muted">{label}</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--glass-line)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct.toFixed(0)}%`, background: color }}
        />
      </div>
      <span className="num w-9 shrink-0 text-right text-text">{pct.toFixed(0)}%</span>
    </div>
  )
}

function Tile({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="rounded-[10px] border px-2.5 py-2 text-center" style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}>
      <div className="num text-text">
        {value}
        <small className="text-muted">{unit}</small>
      </div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  )
}

export function LabSys() {
  const [data, setData] = useState<SysData>(UNAVAILABLE)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (document.hidden) return
      const d = await fetchSys()
      if (!cancelled) setData(d)
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        System monitor
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: data.available ? 'var(--color-green)' : 'var(--color-line)' }}
        />
      </div>

      {!data.available ? (
        <div className="rounded-[10px] border px-3 py-3 text-xs text-muted" style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}>
          Live CPU / GPU / power shows here when the monitor is running. Launch via{' '}
          <code>START-HERE.command</code>, or if you serve the site yourself just double-click{' '}
          <code>MONITOR.command</code>.
        </div>
      ) : (
        <>
          <Bar label="CPU" frac={data.cpu} color="var(--color-blue)" />
          <Bar label="GPU" frac={data.gpu} color="var(--color-purple)" />
          <div className="grid grid-cols-4 gap-1.5">
            <Tile value={data.power.toFixed(1)} unit="W" label="package" />
            <Tile value={`${gb(data.ram_used).toFixed(1)}/${gb(data.ram_total).toFixed(0)}`} unit="G" label="RAM" />
            <Tile value={String(toF(data.cpu_temp))} unit="°F" label="CPU temp" />
            <Tile value={String(toF(data.gpu_temp))} unit="°F" label="GPU temp" />
          </div>
        </>
      )}
    </div>
  )
}
