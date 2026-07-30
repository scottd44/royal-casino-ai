import { useMemo, useState } from 'react'
import { Icon } from '@/platform/icons'
import type { IconName } from '@/platform/icons'
import { navigate } from './hashRoute'
import { GAMES, CATEGORIES } from '@/modules/casino/games/registry'
import type { GameMeta } from '@/modules/casino/games/registry'
import { useLabUiStore } from '@/modules/casino/lab/labUiStore'

/* ============================================================
   AGENT CONTRACT — handoff §2b, rule 4:

   "A [data-nav="<gameId>"] element for every game must exist in the DOM at
    all times."

   switchToGame() navigates by document.querySelector('[data-nav="dice"]').click().
   So: never render this list conditionally, never unmount it on mobile, and
   never gate it on the collapsed state. Collapsing narrows the rail
   VISUALLY — the buttons stay mounted, sized and clickable; only the label
   text is hidden.

   THAT RULE IS WHY THE CATEGORY GROUPS COLLAPSE WITH CSS, NOT WITH JSX.
   A closed group still renders every one of its game buttons; the wrapper
   just animates `grid-template-rows: 1fr -> 0fr` and clips them. Unmounting
   them would be the single fastest way to break the agent — switchToGame()
   would find no element for a game sitting inside a closed group and the run
   loop would stall on a table it can see in the registry but not reach. It
   also keeps tests/dom-contract.spec.ts's "a [data-nav] element exists for
   every game, on every route" green regardless of which groups are open.

   Groups also default to OPEN, and are forced open while the rail is
   collapsed to icons. The rail-collapsed state is exactly what
   "[data-nav] survives sidebar collapse and still navigates" exercises: it
   asserts the button is genuinely VISIBLE, not merely attached, so an
   icon-only rail must never hide a game behind a closed group.
   ============================================================ */

type Group = { key: string; label: string; icon: IconName; games: GameMeta[] }

export default function Sidebar({
  collapsed: collapsedProp,
  mobile = false,
  mobileOpen = false,
  onNavigate,
}: {
  collapsed: boolean
  /** Phones render the rail as a fixed slide-in drawer instead of a grid
   *  cell — see AppShell.tsx. Every [data-nav] button below is still
   *  mounted and rendered exactly the same either way (rule 4 above); only
   *  the wrapping <aside>'s position/transform changes. */
  mobile?: boolean
  mobileOpen?: boolean
  /** Closes the mobile drawer after a real navigation. Never called on
   *  desktop, where the rail has nothing to close. */
  onNavigate?: () => void
}) {
  const setDrawerOpen = useLabUiStore((s) => s.setDrawerOpen)

  // The mobile drawer is a full-width overlay, not an icon-only rail — the
  // desktop `collapsed` preference doesn't apply to it, only `mobileOpen`
  // (visibility) does.
  const collapsed = mobile ? false : collapsedProp

  /** Closed groups, by key. Empty set == everything open, which is the
   *  default: a rail that starts folded up hides the whole roster. */
  const [closed, setClosed] = useState<Set<string>>(() => new Set())

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = CATEGORIES.map((cat) => ({
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      // CATEGORIES[].ids is the full legacy roster, most of which isn't built
      // yet (registry.ts) — filter against GAMES, never trim the registry.
      games: GAMES.filter((g) => cat.ids.includes(g.id)),
    })).filter((grp) => grp.games.length > 0)

    // Anything built but not claimed by a category still has to appear, or a
    // game would be unreachable from the rail AND missing its [data-nav].
    const claimed = new Set(out.flatMap((grp) => grp.games.map((g) => g.id)))
    const rest = GAMES.filter((g) => !claimed.has(g.id))
    if (rest.length > 0) {
      out.push({ key: 'other', label: 'More Games', icon: 'gamepad-2', games: rest })
    }
    return out
  }, [])

  /** Every nav click on the mobile drawer also closes it — desktop's
   *  `onNavigate` is undefined so this is a no-op there. */
  function go(id: string) {
    navigate(id)
    onNavigate?.()
  }

  function toggle(key: string) {
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <aside
      className={
        mobile
          ? 'sidebar fixed inset-y-0 left-0 z-30 flex flex-col border-r overflow-hidden w-[260px] max-w-[80vw]'
          : 'sidebar h-full min-h-0 flex flex-col border-r overflow-hidden'
      }
      style={{
        borderColor: 'var(--glass-line)',
        background: 'var(--glass-panel)',
        ...(mobile
          ? {
              transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.24s var(--ease)',
            }
          : undefined),
      }}
    >
      <button
        type="button"
        onClick={() => go('')}
        className="flex items-center gap-2 px-4 shrink-0 text-left hover:opacity-80 transition-opacity"
        style={{ height: 'var(--topbar-h)' }}
        title="Back to the lobby"
      >
        <Icon name="crown" size={20} className="text-gold shrink-0" />
        {!collapsed && (
          <span className="font-semibold tracking-wide text-text whitespace-nowrap">
            Royal Casino
          </span>
        )}
      </button>

      <nav className="sb-nav flex-1 min-h-0 overflow-y-auto px-2 pb-4">
        <button
          type="button"
          data-nav=""
          onClick={() => go('')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-muted hover:text-text hover:bg-white/5 transition-colors"
          title="Lobby"
        >
          <Icon name="crown" size={18} className="shrink-0" />
          {!collapsed && <span className="text-sm whitespace-nowrap">Lobby</span>}
        </button>

        {/* Ported from js/app.js's `#sbAiLab` — a persistent, always-visible
            entry point for the AI Lab control deck, independent of which
            route you're on. Without this, the only way to reach the drawer
            was AgentMount's "Let AI play" button buried inside each game's
            own panel — invisible from the Lobby. */}
        <button
          type="button"
          id="sbAiLab"
          onClick={() => setDrawerOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-muted hover:text-text hover:bg-white/5 transition-colors"
          title="Open the AI Lab control deck"
        >
          <Icon name="bot" size={18} className="shrink-0" style={{ color: 'var(--color-purple)' }} />
          {!collapsed && (
            <span className="flex-1 flex items-center gap-2 text-sm whitespace-nowrap">
              AI Lab
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--color-purple) 20%, transparent)',
                  color: 'var(--color-purple)',
                }}
              >
                LIVE
              </span>
            </span>
          )}
        </button>

        <div className="sb-sep my-2 h-px" style={{ background: 'var(--glass-line)' }} />

        {groups.map((grp) => {
          // Forced open on the icon-only rail — see the contract note above.
          const open = collapsed || !closed.has(grp.key)
          return (
            <div key={grp.key} className="mb-1">
              {collapsed ? (
                // Icon rail: a hairline instead of a header, so the groups
                // still read as groups without any text to truncate.
                <div className="mx-2 my-2 h-px" style={{ background: 'var(--glass-line)' }} />
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(grp.key)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2 px-3 py-2 mb-0.5 rounded-[10px] text-text hover:bg-white/5 transition-colors"
                  style={{
                    background: 'color-mix(in srgb, var(--color-gold) 7%, transparent)',
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-gold) 14%, transparent)',
                  }}
                  title={open ? `Collapse ${grp.label}` : `Expand ${grp.label}`}
                >
                  <Icon name={grp.icon} size={14} className="shrink-0 text-gold" />
                  <span className="flex-1 text-left text-[11.5px] font-bold uppercase tracking-[0.1em] whitespace-nowrap truncate text-gold">
                    {grp.label}
                  </span>
                  <span className="num text-[10px] shrink-0 text-muted">{grp.games.length}</span>
                  <Icon
                    name="chevron-down"
                    size={14}
                    className="shrink-0 text-muted"
                    style={{
                      transform: open ? 'rotate(180deg)' : 'none',
                      transition: 'transform 200ms var(--ease)',
                    }}
                  />
                </button>
              )}

              {/* CSS-only collapse. The 1fr -> 0fr grid row animates to a real
                  height without measuring anything, and the buttons inside
                  stay mounted the whole time (agent contract, above). */}
              <div
                className="grid"
                style={{
                  gridTemplateRows: open ? '1fr' : '0fr',
                  transition: 'grid-template-rows 220ms var(--ease)',
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  {grp.games.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      data-nav={g.id}
                      onClick={() => go(g.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-muted hover:text-text hover:bg-white/5 transition-colors"
                      title={g.name}
                    >
                      <Icon
                        name={g.icon}
                        size={18}
                        className="shrink-0"
                        style={{ color: g.accent }}
                      />
                      {!collapsed && <span className="text-sm whitespace-nowrap">{g.name}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
