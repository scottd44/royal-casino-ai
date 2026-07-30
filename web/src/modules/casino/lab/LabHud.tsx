import { useEffect, useState } from 'react'
import { Icon } from '@/platform/icons'
import { Reveal } from '@/platform/motion'
import { Button } from '@/platform/ui'
import { money } from '@/platform/money/format'
import { royalAgent } from '@/platform/agent/agentUi'
import { useAgentStore } from '@/platform/agent/useAgent'
import { useLabUiStore } from './labUiStore'
import { LabTiltMeter } from './LabTiltMeter'
import { LAB_HANDLE_PX } from './LabDrawer'

/* ============================================================
   LabHud -- the floating mini-status shown while the drawer is
   collapsed/closed. Ported (behavior, not markup) from js/agent/agent-lab.js's
   `positionHud`/`syncHudVisibility`/`renderHud` (~lines 399-486) per
   PHASE_2_AGENT_PLAN.md §5.

   None of this module's ids are agent-contract either (same §0 grep as
   LabDrawer.tsx) -- free hand on structure here too.
   ============================================================ */

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')

/** `royalAgent.currentGameId()` reads `location.hash` directly (non-reactive
 *  by design, agentUi.ts) -- mirror it into state on `hashchange` so the HUD
 *  updates when the player switches tables. */
function useCurrentGameId(): string {
  const [id, setId] = useState(() => royalAgent.currentGameId())
  useEffect(() => {
    const onHashChange = () => setId(royalAgent.currentGameId())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return id
}

export function LabHud() {
  const stats = useAgentStore((s) => s.stats)
  const running = stats?.running ?? false

  const drawerOpen = useLabUiStore((s) => s.drawerOpen)
  const drawerCollapsed = useLabUiStore((s) => s.drawerCollapsed)
  const hudDismissed = useLabUiStore((s) => s.hudDismissed)
  const dismissHud = useLabUiStore((s) => s.dismissHud)
  const setDrawerOpen = useLabUiStore((s) => s.setDrawerOpen)

  const gameId = useCurrentGameId()

  // Viewport-fits check, ported from agent-lab.js:440-452's positionHud()/
  // syncHudVisibility() -- the HUD stands down on a too-short viewport
  // rather than crowd the dock; the deck already shows everything the HUD
  // does, so there's nothing lost by hiding it.
  const [viewportH, setViewportH] = useState(() => window.innerHeight)
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Drawer takes priority: the HUD only ever shows while the drawer is
  // collapsed or fully closed, never alongside the full open control
  // surface (plan §5's explicit HUD/drawer-visibility rule). When it IS
  // eligible, its dock offset is always LAB_HANDLE_PX (drawer open+collapsed)
  // or 0 (drawer closed) -- the full-height case never reaches here.
  const dockPx = drawerOpen ? LAB_HANDLE_PX : 0
  const fits = viewportH - dockPx - 14 >= 300
  const visible = running && !hudDismissed && (!drawerOpen || drawerCollapsed) && fits

  if (!visible) return null

  const net = stats?.net ?? 0
  const latency = stats?.avgLatency ? `${Math.round(stats.avgLatency)}ms` : '—'
  const toolOk = stats?.decisions ? `${(100 - stats.fallbackRate * 100).toFixed(0)}%` : '—'
  // Not reactive -- royalAgent.settings isn't a store (same non-reactive
  // read agent-lab.js's own renderButtons() does for `$("hudNew").disabled`,
  // agent-lab.js:485), refreshed whenever `stats` next ticks.
  const canRoam = running && royalAgent.settings.agentic

  return (
    <Reveal
      preset="fadeIn"
      className="lab-hud glass fixed z-30 flex w-[280px] flex-col gap-2 rounded-[var(--radius-card)] p-3"
      // Same fix as LabDrawer.tsx: `.glass`'s 62%-opacity blur reads as
      // broken/see-through with nothing but a live game behind it. Inline
      // wins the cascade over the class's own background.
      style={{
        bottom: dockPx + 14,
        right: 16,
        background: 'var(--color-panel-2)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ background: 'var(--color-green)' }}
          />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--color-green)' }} />
        </span>
        <span className="flex-1 text-xs font-bold">AI is playing</span>
        <span className="text-xs text-muted">{titleCase(gameId) || 'Lobby'}</span>
        <button
          type="button"
          onClick={dismissHud}
          aria-label="Hide the HUD for this run"
          className="rounded p-0.5 hover:bg-white/5"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-muted">Latency</div>
          <div className="num text-xs">{latency}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">Tool ok</div>
          <div className="num text-xs">{toolOk}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">Net</div>
          <div
            className="num text-xs"
            style={{ color: net > 0 ? 'var(--color-green)' : net < 0 ? 'var(--color-red)' : undefined }}
          >
            {(net >= 0 ? '+' : '-') + money(net)}
          </div>
        </div>
      </div>

      <LabTiltMeter />

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="inline-flex items-center gap-1.5" onClick={() => royalAgent.toggle()}>
          <Icon name="square" size={14} /> Stop
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRoam}
          className="inline-flex items-center gap-1.5"
          title="Roam to a different table"
          onClick={() => royalAgent.forceNewGame()}
        >
          <Icon name="shuffle" size={14} /> New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="inline-flex items-center gap-1.5"
          title="Open the control deck"
          onClick={() => setDrawerOpen(true)}
        >
          <Icon name="settings-2" size={14} /> Deck
        </Button>
      </div>
    </Reveal>
  )
}
