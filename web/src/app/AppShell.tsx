import { useState, type ReactNode } from 'react'
import { Icon } from '@/platform/icons'
import Sidebar from './Sidebar'
import { useWalletStore } from '@/platform/money/walletStore'
import { money } from '@/platform/money/format'
import { ToastHost } from '@/platform/ui/toast'
import { LabDrawer, LAB_HANDLE_PX } from '@/modules/casino/lab/LabDrawer'
import { LabHud } from '@/modules/casino/lab/LabHud'
import { LabReportModal } from '@/modules/casino/lab/LabReportModal'
import { useLabUiStore } from '@/modules/casino/lab/labUiStore'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
// LabDrawer/LabHud below are now the always-mounted component that keeps
// `royalAgent` (platform/agent/agentUi.ts) alive — it's constructed at
// module-eval time, not on first render, so importing it transitively
// through the Lab components is enough; no boot() call needed (plan §6).

/* ============================================================
   The shell. DEVELOPMENT_GUIDE.md §3b:

     body            height:100%; overflow:hidden
     .app-shell      grid-template-columns: var(--sbw) 1fr; height:100dvh
       .sidebar      grid cell, height:100%
       .app-main     height:100%; overflow-y:auto   <- the ONLY scroller

   Never make the sidebar position:sticky — any overflow on html/body
   silently promotes body to the scroll container and the rail scrolls away
   mid-page. That bug shipped three times. A grid cell has no scroll to fall
   out of.

   The rail's width is animated by grid-template-columns on .app-shell — one
   transition on one property. No width/flex-basis transitions on .sidebar;
   they race.

   ONE STATE, ONE WRITER: `collapsed` lives here and nothing else writes it.
   ============================================================ */
export default function AppShell({ children }: { children: ReactNode }) {
  const [userCollapsed, setUserCollapsed] = useState(false)
  const isMobile = useIsMobile()
  // Phones always get the icon-only rail — [data-nav] stays mounted and
  // visible (Sidebar.tsx's agent contract), just narrower, same as the
  // desktop collapsed state. Desktop keeps its own manual toggle.
  const collapsed = isMobile || userCollapsed
  const balance = useWalletStore((s) => s.balance)

  // No boot effect needed anymore (plan §6) — `royalAgent` is a real ES
  // module import (platform/agent/agentUi.ts); useAgentStore wires
  // setOnUpdate at module-eval time, so it's ready synchronously.

  // Drawer clearance -- ported from agent-lab.js:175-180's updateBodyPadding().
  // `.app-main` is the ONLY scroller (doc comment above), so this is where
  // legacy's own "clearance belongs to the scrolling pane" comment already
  // pointed. One state (labUiStore), one writer (LabDrawer.tsx's drag-end /
  // collapse handlers) -- AppShell only ever reads it.
  const drawerOpen = useLabUiStore((s) => s.drawerOpen)
  const drawerCollapsed = useLabUiStore((s) => s.drawerCollapsed)
  const drawerHeight = useLabUiStore((s) => s.drawerHeight)
  const labPaddingBottom = !drawerOpen ? 0 : drawerCollapsed ? LAB_HANDLE_PX : LAB_HANDLE_PX + drawerHeight

  return (
    <div
      className="app-shell grid h-[100dvh]"
      style={{
        gridTemplateColumns: `${collapsed ? 'var(--sbw-min)' : 'var(--sbw)'} 1fr`,
        transition: 'grid-template-columns 0.28s var(--ease)',
      }}
    >
      <Sidebar collapsed={collapsed} />

      <main
        className="app-main h-full overflow-y-auto overflow-x-hidden min-w-0"
        style={{ paddingBottom: labPaddingBottom, transition: 'padding-bottom 0.2s var(--ease)' }}
      >
        <header
          className="topbar sticky top-0 z-10 flex items-center gap-3 px-5 border-b"
          style={{
            height: 'var(--topbar-h)',
            borderColor: 'var(--glass-line)',
            background: 'var(--glass-panel)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
          }}
        >
          <button
            type="button"
            id="sbCollapse"
            aria-label="Toggle sidebar"
            onClick={() => setUserCollapsed((c) => !c)}
            className="p-2 rounded-[10px] text-muted hover:text-text hover:bg-white/5 transition-colors"
          >
            <Icon name="panel-left" size={18} />
          </button>

          {/*  #aiStatus is written directly by agent-ui.js setStatus().
               It must exist and stay mounted for the whole run. */}
          <div id="aiStatus" className="flex-1 min-w-0 truncate text-sm text-muted" />

          <div className="num text-gold text-sm shrink-0" title="Balance">
            {money(balance)}
          </div>
        </header>

        <div className="px-5 py-6">{children}</div>
      </main>

      {/* Fixed-position siblings of <main>, OUTSIDE .app-main's scroll
          region — same reasoning as #aiStatus above: these must persist
          across route changes, never part of a route's mount/unmount cycle
          (plan §5's "Wiring into AppShell.tsx"). LabReportModal is mounted
          here (not inside LabDrawer) because it opens via
          `royalAgent.setOnReport(...)` and has to survive LabDrawer
          returning null while the drawer is closed. */}
      <LabDrawer />
      <LabHud />
      <LabReportModal />
      <ToastHost />
    </div>
  )
}
