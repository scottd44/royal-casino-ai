import { Dices, Bomb, Spade, Crown } from 'lucide-react'
import { navigate } from './hashRoute'
import { GAMES } from '@/modules/casino/games/registry'

const ICONS: Record<string, typeof Dices> = {
  dice: Dices,
  mines: Bomb,
  holdem: Spade,
}

/* ============================================================
   AGENT CONTRACT — handoff §2b, rule 4:

   "A [data-nav="<gameId>"] element for every game must exist in the DOM at
    all times."

   switchToGame() navigates by document.querySelector('[data-nav="dice"]').click().
   So: never render this list conditionally, never unmount it on mobile, and
   never gate it on the collapsed state. Collapsing narrows the rail
   VISUALLY — the buttons stay mounted, sized and clickable; only the label
   text is hidden.
   ============================================================ */
export default function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className="sidebar h-full min-h-0 flex flex-col border-r overflow-hidden"
      style={{ borderColor: 'var(--glass-line)', background: 'var(--glass-panel)' }}
    >
      <div className="flex items-center gap-2 px-4 shrink-0" style={{ height: 'var(--topbar-h)' }}>
        <Crown size={20} className="text-gold shrink-0" />
        {!collapsed && (
          <span className="font-semibold tracking-wide text-text whitespace-nowrap">
            Royal Casino
          </span>
        )}
      </div>

      <nav className="sb-nav flex-1 min-h-0 overflow-y-auto px-2 pb-4">
        <button
          type="button"
          data-nav=""
          onClick={() => navigate('')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-muted hover:text-text hover:bg-white/5 transition-colors"
          title="Lobby"
        >
          <Crown size={18} className="shrink-0" />
          {!collapsed && <span className="text-sm whitespace-nowrap">Lobby</span>}
        </button>

        {GAMES.map((g) => {
          const Icon = ICONS[g.id] ?? Dices
          return (
            <button
              key={g.id}
              type="button"
              data-nav={g.id}
              onClick={() => navigate(g.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-muted hover:text-text hover:bg-white/5 transition-colors"
              title={g.name}
            >
              <Icon size={18} className="shrink-0" style={{ color: g.accent }} />
              {!collapsed && <span className="text-sm whitespace-nowrap">{g.name}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
