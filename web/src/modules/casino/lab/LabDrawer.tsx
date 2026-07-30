import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/platform/icons'
import { Reveal } from '@/platform/motion'
import { Button, cn } from '@/platform/ui'
import { money } from '@/platform/money/format'
import { royalAgent } from '@/platform/agent/agentUi'
import { useAgentStore } from '@/platform/agent/useAgent'
import { useLabUiStore } from './labUiStore'
import { LabStats } from './LabStats'
import { LabTiltMeter } from './LabTiltMeter'
import { LabChart } from './LabChart'
import { LabLog } from './LabLog'
import { LabSys } from './LabSys'

/* ============================================================
   LabDrawer -- the AI control deck. Ported (behavior, not markup) from
   js/agent/agent-lab.js (854 lines) per PHASE_2_AGENT_PLAN.md §5.

   None of this module's own element ids are agent-contract (§0 of the
   plan -- grepped `agent-ui.js`'s own selector list, confirmed nothing
   external reads `#aggr`/`#speed`/etc.), so structure/ids/classnames here
   are a free hand. What IS fixed: every control below writes into the
   SAME `royalAgent.settings` object agentUi.ts owns (one state, one
   writer -- HANDOFF §6.6), per the plan's control-inventory table.
   ============================================================ */

/** The handle strip's height in px -- also the collapsed-drawer height
 *  (legacy: both read 52 -- agent-lab.js:179 `collapsed ? 52 : ...` and
 *  agent-lab.js:442 `lab.classList.contains("collapsed") ? 52 : ...`).
 *  AppShell.tsx imports this to size `.app-main`'s clearance padding and
 *  LabHud.tsx imports it to size its own offset above the collapsed strip. */
export const LAB_HANDLE_PX = 52

/** RISK() ported verbatim, agent-lab.js:191-192. */
function riskLabel(pct: number): string {
  return pct < 8
    ? 'very cautious'
    : pct < 20
      ? 'cautious'
      : pct < 45
        ? 'balanced'
        : pct < 70
          ? 'aggressive'
          : 'swinging big'
}

/** brainFromDial() ported verbatim, agent-lab.js:276-281 -- 0..100 dial ->
 *  64..768 tokens (exponential: 64 * 12^(v/100)) with a matching
 *  temperature (0.8 hot at 0 -> 0.35 cool at 100). */
function brainFromDial(v: number): { tokens: number; temp: number; zone: string } {
  const tokens = Math.round(64 * Math.pow(12, v / 100))
  const temp = Number((0.8 - 0.45 * (v / 100)).toFixed(2))
  const zone = v < 33 ? 'Instinct' : v < 67 ? 'Sharp' : 'Deep'
  return { tokens, temp, zone }
}

type OllamaModel = { name: string; details?: { parameter_size?: string; family?: string } }

/** modelBlurb() simplified, agent-lab.js:205-224 -- a one-line size hint for
 *  the <option title>. Plan §5: "a nice touch but not required — don't
 *  over-invest here," so this keeps only the parameter-size half. */
function modelBlurb(m: OllamaModel): string {
  const ps = parseFloat(m.details?.parameter_size ?? '') || 0
  if (!ps) return ''
  return ps >= 27
    ? 'very capable, heavy & slow'
    : ps >= 12
      ? 'smarter, uses more tokens'
      : ps >= 6
        ? 'balanced smarts & speed'
        : ps >= 3
          ? 'lighter — fewer tokens, faster'
          : 'tiny — fastest, least nuance'
}

function SliderRow({ label, valueLabel, children }: { label: string; valueLabel: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="num text-text">{valueLabel}</span>
      </div>
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string
  value: number
  min?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        type="number"
        className="lab-input rounded-[8px] border px-2 py-1.5 text-sm text-text"
        style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
        min={min}
        value={value}
        // `input`/`change` on every keystroke, not blur -- plan §5's control
        // inventory is explicit that settings writes happen live.
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
      />
    </label>
  )
}

export function LabDrawer() {
  const drawerOpen = useLabUiStore((s) => s.drawerOpen)
  const drawerCollapsed = useLabUiStore((s) => s.drawerCollapsed)
  const drawerHeight = useLabUiStore((s) => s.drawerHeight)
  const setDrawerOpen = useLabUiStore((s) => s.setDrawerOpen)
  const toggleDrawerCollapsed = useLabUiStore((s) => s.toggleDrawerCollapsed)

  const stats = useAgentStore((s) => s.stats)
  const running = stats?.running ?? false
  const net = stats?.net ?? 0

  // ---- local mirrors of royalAgent.settings. `royalAgent.settings` is a
  // plain mutable object the agent reads live (not a React store) -- plan
  // §5: "local useState for each control's own displayed value is fine and
  // expected -- just make sure the handler writes through to
  // royalAgent.settings.x on every event, not on blur/submit." These
  // useState calls seed from the agent's real defaults (types.ts /
  // agentUi.ts's `settings` literal) so a reopened drawer shows whatever
  // was last set, even across a collapse/expand cycle.
  const [aggr, setAggr] = useState(() => Math.round(royalAgent.settings.aggression * 100))
  const [delayMs, setDelayMsState] = useState(() => royalAgent.settings.delayMs)
  const [brainDial, setBrainDial] = useState(50) // legacy's own slider default, agent-lab.js:97
  const [emotionsOn, setEmotionsOn] = useState(() => royalAgent.settings.emotions)
  const [compute, setComputeState] = useState<'gpu' | 'cpu'>(() => royalAgent.settings.compute)
  const [model, setModelState] = useState(() => royalAgent.settings.model)
  const [runN, setRunN] = useState(() => royalAgent.settings.runN)
  const [profitPct, setProfitPct] = useState(() => royalAgent.settings.profitTargetPct)
  const [lossPct, setLossPct] = useState(() => royalAgent.settings.stopLossPct)
  const [sessionMin, setSessionMin] = useState(() => royalAgent.settings.sessionMinutes)
  const [breakEvery, setBreakEvery] = useState(() => royalAgent.settings.breakEvery)
  const [breakFor, setBreakFor] = useState(() => royalAgent.settings.breakFor)
  const [agentic, setAgenticState] = useState(() => royalAgent.settings.agentic)

  // ---- model list, from Ollama's /api/tags via the Vite dev proxy
  // (vite.config.ts's `/ollama` rewrite). Re-scanned every time the drawer
  // opens -- Ollama may have started after page load, same as legacy's
  // openDrawer() calling refreshModels() (agent-lab.js:382).
  const [models, setModels] = useState<OllamaModel[]>([])
  const [modelsFailed, setModelsFailed] = useState(false)
  useEffect(() => {
    if (!drawerOpen) return
    let cancelled = false
    fetch('/ollama/api/tags', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { models?: OllamaModel[] }) => {
        if (cancelled) return
        setModels(Array.isArray(data.models) ? data.models : [])
        setModelsFailed(false)
      })
      .catch(() => {
        // Ollama not running / unreachable -- fail soft, not silent: the
        // current model still has to be selectable (below), plus an inline note.
        if (!cancelled) {
          setModels([])
          setModelsFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [drawerOpen])
  // The current model always has to be selectable, even if the scan failed
  // or it isn't in the installed list (agent-lab.js:238-243's same guarantee).
  const modelOptions: OllamaModel[] = models.some((m) => m.name === model) ? models : [{ name: model }, ...models]

  // ---- resize-drag: pointermove/pointerup on the top-edge handle, ported
  // from agent-lab.js:353-377's resize math. Height is tracked in LOCAL
  // state during the drag and committed to labUiStore exactly once, on
  // pointerup -- the plan is explicit this must not fire setDrawerHeight on
  // every move frame (that would re-render every labUiStore subscriber,
  // including AppShell, 60+ times a second).
  const draggingRef = useRef(false)
  const [dragBodyHeight, setDragBodyHeight] = useState<number | null>(null)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return
      // agent-lab.js:366 verbatim: clamp([120, 0.85*vh], innerHeight - clientY - handle).
      const h = Math.max(120, Math.min(window.innerHeight * 0.85, window.innerHeight - e.clientY - LAB_HANDLE_PX))
      setDragBodyHeight(h)
    }
    function onUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.userSelect = ''
      setDragBodyHeight((h) => {
        if (h != null) useLabUiStore.getState().setDrawerHeight(h)
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Closed entirely -- distinct from collapsed (§5: LabHud shows "while the
  // drawer is collapsed/closed", so the two states have to be separable).
  if (!drawerOpen) return null

  const bodyHeight = dragBodyHeight ?? drawerHeight
  const containerHeight = drawerCollapsed ? LAB_HANDLE_PX : LAB_HANDLE_PX + bodyHeight
  const brain = brainFromDial(brainDial)
  const dragging = draggingRef.current

  return (
    <Reveal
      preset="fadeUp"
      y={24}
      className="lab-drawer glass fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[var(--radius-card-lg)] border-t"
      style={{
        height: containerHeight,
        borderColor: 'var(--glass-line)',
        transition: dragging ? undefined : 'height 0.2s var(--ease)',
        // The `.glass` class this carries is a 62%-opacity blur, fine for a
        // panel that sits over the app's own dark chrome -- but this drawer
        // docks directly over a LIVE, brightly-animated game with nothing
        // behind it to dim first, so the game showed through hard enough to
        // read as broken/see-through rather than a deliberate frosted
        // panel. Inline wins the cascade over the class's own background,
        // so this alone makes it solid; backdropFilter is switched off too
        // since blurring is pointless (and a wasted paint) once nothing
        // behind it needs softening.
        background: 'var(--color-panel-2)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <div className="relative shrink-0">
        {/* Drag-to-resize handle -- overlaps the top edge slightly so it's
            easy to grab without stealing the title bar's own click target. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize"
          className="absolute inset-x-0 -top-2 z-10 flex h-4 cursor-row-resize touch-none items-center justify-center"
          onPointerDown={(e) => {
            draggingRef.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            if (drawerCollapsed) toggleDrawerCollapsed()
            document.body.style.userSelect = 'none'
          }}
        >
          <span className="h-1 w-10 rounded-full" style={{ background: 'var(--glass-line)' }} />
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 text-left"
          style={{
            height: LAB_HANDLE_PX,
            borderBottom: drawerCollapsed ? undefined : '1px solid var(--glass-line)',
          }}
          onClick={() => toggleDrawerCollapsed()}
        >
          <Icon name="bot" size={16} className="shrink-0 text-gold" />
          <span className="shrink-0 text-sm font-bold">AI Lab</span>
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
            style={{
              borderColor: running ? 'color-mix(in srgb, var(--color-green) 40%, transparent)' : 'var(--glass-line)',
              color: running ? 'var(--color-green)' : 'var(--color-muted)',
            }}
          >
            {running ? 'live' : 'idle'}
          </span>
          <span
            className="num shrink-0 text-xs"
            style={{ color: net > 0 ? 'var(--color-green)' : net < 0 ? 'var(--color-red)' : undefined }}
          >
            {(net >= 0 ? '+' : '-') + money(net)}
          </span>
          <span className="flex-1" />
          {/* A nested interactive element inside the handle's own <button>
              would be invalid HTML (button-in-button); span+role mirrors
              what agent-lab.js does with its own click-target carve-out
              (agent-lab.js:184 `if (e.target.closest("button")) return`). */}
          <span
            role="button"
            tabIndex={-1}
            aria-label="Close AI Lab"
            className="rounded p-1 hover:bg-white/5"
            onClick={(e) => {
              e.stopPropagation()
              setDrawerOpen(false)
            }}
          >
            <Icon name="x" size={16} />
          </span>
          <Icon name={drawerCollapsed ? 'chevron-up' : 'chevron-down'} size={16} className="shrink-0" />
        </button>
      </div>

      {!drawerCollapsed && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-3">
          {/* ---- column 1: behavior + session + controls ---- */}
          <div className="flex flex-col gap-4">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Behavior</div>

            <SliderRow label="Aggression" valueLabel={`${aggr}% · ${riskLabel(aggr)}`}>
              <input
                type="range"
                min={0}
                max={100}
                value={aggr}
                className="lab-slider w-full"
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setAggr(v)
                  royalAgent.settings.aggression = v / 100
                }}
              />
            </SliderRow>

            <SliderRow label="Move speed" valueLabel={`${delayMs}ms delay`}>
              <input
                type="range"
                min={0}
                max={1500}
                step={50}
                value={delayMs}
                className="lab-slider w-full"
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setDelayMsState(v)
                  royalAgent.settings.delayMs = v
                }}
              />
            </SliderRow>

            <SliderRow label="Brainpower" valueLabel={`${brain.zone} · ${brain.tokens} tokens`}>
              <input
                type="range"
                min={0}
                max={100}
                value={brainDial}
                className="lab-slider w-full"
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setBrainDial(v)
                  // Brainpower is the one control with a setter method
                  // (two derived values + a label update together) --
                  // plan §5, not a direct `settings.x =` write.
                  const b = brainFromDial(v)
                  royalAgent.setBrain(b.tokens, b.temp, b.zone)
                }}
              />
            </SliderRow>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted">Compute</span>
              <div className="flex gap-2">
                {(['gpu', 'cpu'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant="ghost"
                    size="sm"
                    // Locked while running -- plan §5's control table.
                    disabled={running}
                    onClick={() => {
                      setComputeState(mode)
                      royalAgent.setCompute(mode)
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5',
                      compute === mode && 'border-gold text-gold',
                    )}
                  >
                    <Icon name={mode === 'gpu' ? 'zap' : 'cpu'} size={14} />
                    {mode.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={emotionsOn}
                  onChange={(e) => {
                    setEmotionsOn(e.target.checked)
                    royalAgent.setEmotions(e.target.checked)
                  }}
                />
                <Icon name="flame" size={14} /> Emotions (tilt)
              </label>
              <LabTiltMeter />
            </div>

            <div className="flex flex-col gap-1 text-xs text-muted">
              <span>Model</span>
              <select
                className="lab-input rounded-[8px] border px-2 py-1.5 text-sm text-text"
                style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
                value={model}
                onChange={(e) => {
                  const v = e.target.value || 'qwen2.5:7b'
                  setModelState(v)
                  royalAgent.setModel(v)
                }}
              >
                {modelOptions.map((m) => (
                  <option key={m.name} value={m.name} title={modelBlurb(m)}>
                    {m.name}
                  </option>
                ))}
              </select>
              {modelsFailed && <span>Couldn&rsquo;t reach Ollama — showing the current model only.</span>}
            </div>

            <div className="text-xs font-bold uppercase tracking-wide text-muted">Session</div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Run N (0=∞)"
                value={runN}
                onChange={(v) => {
                  setRunN(v)
                  royalAgent.settings.runN = v
                }}
              />
              <NumberField
                label="Profit target %"
                value={profitPct}
                onChange={(v) => {
                  setProfitPct(v)
                  royalAgent.settings.profitTargetPct = v
                }}
              />
              <NumberField
                label="Stop-loss %"
                value={lossPct}
                onChange={(v) => {
                  setLossPct(v)
                  royalAgent.settings.stopLossPct = v
                }}
              />
              <NumberField
                label="Session timer (min)"
                value={sessionMin}
                onChange={(v) => {
                  setSessionMin(v)
                  royalAgent.settings.sessionMinutes = v
                }}
              />
              <NumberField
                label="Break every (min)"
                value={breakEvery}
                onChange={(v) => {
                  setBreakEvery(v)
                  royalAgent.settings.breakEvery = v
                }}
              />
              <NumberField
                label="Break length (min)"
                value={breakFor}
                min={1}
                onChange={(v) => {
                  const clamped = Math.max(1, v)
                  setBreakFor(clamped)
                  royalAgent.settings.breakFor = clamped
                }}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={agentic}
                onChange={(e) => {
                  setAgenticState(e.target.checked)
                  royalAgent.settings.agentic = e.target.checked
                }}
              />
              Agentic (roam between games)
            </label>

            <div className="text-xs font-bold uppercase tracking-wide text-muted">Controls</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={running ? 'red' : 'gold'}
                className="inline-flex items-center gap-1.5"
                onClick={() => royalAgent.toggle()}
              >
                <Icon name={running ? 'square' : 'play'} size={14} /> {running ? 'Stop' : 'Start'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="inline-flex items-center gap-1.5"
                onClick={() => royalAgent.forceNewGame()}
              >
                <Icon name="shuffle" size={14} /> New game
              </Button>
              <Button
                variant="red"
                size="sm"
                className="inline-flex items-center gap-1.5"
                onClick={() => royalAgent.stopAndReport()}
              >
                <Icon name="square" size={14} /> Stop &amp; report
              </Button>
            </div>
          </div>

          {/* ---- column 2: session telemetry ---- */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Session telemetry</div>
            <LabStats />
            <LabChart />
            <LabSys />
          </div>

          {/* ---- column 3: move-by-move history ---- */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Move history</div>
            <LabLog />
          </div>
        </div>
      )}
    </Reveal>
  )
}
