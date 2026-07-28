import { useState, type ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import Sidebar from './Sidebar'
import { useWalletStore } from '@/platform/money/walletStore'
import { money } from '@/platform/money/format'

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
  const [collapsed, setCollapsed] = useState(false)
  const balance = useWalletStore((s) => s.balance)

  return (
    <div
      className="app-shell grid h-[100dvh]"
      style={{
        gridTemplateColumns: `${collapsed ? 'var(--sbw-min)' : 'var(--sbw)'} 1fr`,
        transition: 'grid-template-columns 0.28s var(--ease)',
      }}
    >
      <Sidebar collapsed={collapsed} />

      <main className="app-main h-full overflow-y-auto overflow-x-hidden min-w-0">
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
            onClick={() => setCollapsed((c) => !c)}
            className="p-2 rounded-[10px] text-muted hover:text-text hover:bg-white/5 transition-colors"
          >
            <PanelLeft size={18} />
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
    </div>
  )
}
