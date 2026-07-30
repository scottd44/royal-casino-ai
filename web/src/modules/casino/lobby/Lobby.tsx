import { useMemo, useState } from 'react'
import { GAMES, CATEGORIES } from '../games/registry'
import type { GameMeta } from '../games/registry'
import { navigate } from '@/app/hashRoute'
import { Icon } from '@/platform/icons'
import type { IconName } from '@/platform/icons'
import { Reveal, Stagger } from '@/platform/motion'
import { useWalletStore } from '@/platform/money/walletStore'
import { money } from '@/platform/money/format'

/* ============================================================
   Lobby — Phase 4 UI remake (PHASE_4_UI_REMAKE_PLAN.md).

   The floor, not a placeholder grid. Structure:

     page head       -> wordmark + live balance
     favorites shelf-> the five house picks, top of the page
     filter bar      -> search + a Favorites tab + category tabs
     sections        -> art-first game tiles, per category

   THE TILE IS ART-FIRST, and that is the visual thesis. A wall of 25
   identical text cards reads as a dashboard no matter how well it is
   spaced; a casino floor reads as a floor because every table looks like a
   different table. So each tile is built from the two things the registry
   gives us that DIFFER per game — `accent` and `icon` — and turns them into
   a generated art panel: an accent-lit field, a deterministic texture
   (dots / rake lines / rays / rings, chosen by registry index so a game
   always draws the same one), an oversized ghost mark of the game's own
   icon, and a lit medallion on top. No image assets, no per-game art files
   to maintain, and it can never drift from the registry.

   THE TOP OF THE PAGE IS THE FAVORITES SHELF, not a featured hero. The
   single-game spotlight masthead that used to sit here is gone: it spent
   the most valuable strip on the page advertising ONE table, which is only
   worth it if the house is pushing that table. The five picks below earn
   that strip better, and they double as the fastest route back to a game
   you actually play.

   Load-bearing rules this file lives under — every one of them is a bug
   that already shipped once:

   1. `data-nav={g.id}` + `onClick={() => navigate(g.id)}` on EVERY clickable
      element that represents a game (handoff §2b rule 4). switchToGame()
      clicks `[data-nav="<id>"]` when the hash route alone doesn't resolve,
      and tests/dom-contract.spec.ts's "Navigation contract" block asserts it
      directly. Both the shelf tiles and the grid tiles carry it.

   2. A category renders only if at least one of its games is actually built.
      CATEGORIES[].ids deliberately carries the FULL legacy roster per
      category (registry.ts) — most of it isn't ported yet — so the filter
      happens HERE, at render time, never by trimming the registry.

   3. Icons come from `g.icon` / `cat.icon`, or from a compile-checked
      `IconName` literal. No guessed Lucide names, no emoji
      (tests/icons.spec.ts checks the lobby route for both). Accent colour is
      applied via CSS `color:` — never the `color` PROP — so every icon keeps
      `stroke="currentColor"` the way the design system requires.

   4. Every direct child of a <Stagger> is `w-full`. Stagger wraps each child
      in its own unstyled motion.div and THAT is the real grid item; a child
      that doesn't size itself gets shrink-to-fit width and tiles come out
      different widths per row depending on their text length. For the same
      reason a tile can NEVER set its own `grid-column: span N` — the span
      would land on the tile, not on the wrapper that is actually in the
      grid, and do nothing. Every tile is one track wide and a fixed height.

   5. Hover states are driven from React state + inline styles, never
      `hover:` utilities. `.glass`-family declarations sit outside any
      `@layer`, so under cascade-layer rules they beat every Tailwind
      `hover:` utility (which live in `@layer utilities`) regardless of
      specificity or order.

   6. Nothing here may exceed its container's width. html/body are
      `overflow:hidden` by design (DEVELOPMENT_GUIDE.md §3b) and `.app-main`
      is the only scroller — horizontal overflow is silently CLIPPED, not
      scrollable. Every grid is auto-fill/auto-fit with `1fr` tracks, and
      every oversized decorative mark sits inside an `overflow-hidden`
      parent. The shelf WRAPS rather than scrolling sideways for the same
      reason.

   7. No `layoutId` shared-element transition lobby -> game (plan §0).
      routes.tsx's route switch is keyed for synchronous unmount, which is
      what tears a game's `window.<Game>API` down the instant you leave it.
      Continuity here is icon + accent + an independent entrance on each
      side, deliberately.

   8. Reveal/Stagger only ever wrap things that genuinely mount fresh. The
      live balance readout is therefore rendered OUTSIDE every Reveal, and
      each Stagger is keyed by the active filter so a filter change is a real
      remount rather than a persistent container animating in place.

   9. `GameMeta.featured` was dead data before this rework and is now down to
      ONE job, deliberately: the gold "Hot" flag on a grid tile. It no longer
      picks a masthead game, because there is no masthead.

   PERFORMANCE NOTE: no `backdrop-filter` on the game tiles. It is fine on a
   badge or two, but 25 blurred surfaces in a scroller is a real frame-rate
   cost — the tiles use layered gradients on an opaque base instead, which
   composite for free.
   ============================================================ */

/**
 * The house picks — the five tables that get the shelf at the top of the
 * page and a heart on their grid tile. A plain id list on purpose: no store,
 * no persistence, nothing that can desync from the registry. Reorder or
 * swap ids here and both the shelf and the badges follow.
 *
 * Ids are validated against GAMES at render time (`favorites` below), so a
 * typo or a game that hasn't been ported yet silently drops out of the shelf
 * instead of rendering a hole.
 */
const FAVORITES = ['blackjack', 'mines', 'roulette', 'videopoker', 'dice']

const FAV_ICON: IconName = 'heart'

/** Hover + keyboard-focus as one visual state. Focus gets the same
    treatment as hover so the floor is navigable without a mouse. */
function useHoverState() {
  const [hover, setHover] = useState(false)
  return [
    hover,
    {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onFocus: () => setHover(true),
      onBlur: () => setHover(false),
    },
  ] as const
}

const EASE = 'cubic-bezier(0.22, 0.8, 0.28, 1)'

/**
 * The four table textures, tinted with the game's own accent. Picked by
 * registry index (not at random) so a given game always draws the same one
 * across renders, filters and reloads.
 *
 *   0 dots  — chip felt
 *   1 rake  — brushed diagonal
 *   2 rays  — a wheel's spokes, thrown from below the tile
 *   3 rings — concentric ripples, same origin
 */
function texture(accent: string, index: number): string {
  switch (index % 4) {
    case 0:
      return `radial-gradient(circle at center, ${accent}40 1.1px, transparent 1.2px) 0 0 / 14px 14px`
    case 1:
      return `repeating-linear-gradient(48deg, ${accent}24 0 1px, transparent 1px 11px)`
    // Rays and rings cover far more area than dots or rake lines, so they
    // carry a lower alpha — at parity they blow out the light-accent games
    // (Baccarat, Chicken Road, Plinko) into a flat wash.
    case 2:
      return `repeating-conic-gradient(from 202deg at 50% 128%, ${accent}1a 0deg 4deg, transparent 4deg 16deg)`
    default:
      return `repeating-radial-gradient(circle at 50% 128%, ${accent}24 0 1px, transparent 1px 16px)`
  }
}

function matches(g: GameMeta, q: string) {
  if (!q) return true
  const hay = `${g.name} ${g.desc} ${g.tag} ${g.provider}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term))
}

/* ------------------------------------------------------------
   Section header — one component for the shelf and every category,
   so the page reads as one system rather than a hero plus a list.
   ------------------------------------------------------------ */
function SectionHead({
  icon,
  title,
  sub,
  gold,
}: {
  icon: IconName
  title: string
  sub: string
  gold?: boolean
}) {
  return (
    <header className="flex items-center gap-3.5 mb-5">
      <span
        className="flex items-center justify-center w-10 h-10 rounded-[13px] text-gold shrink-0"
        style={{
          background: gold
            ? 'linear-gradient(155deg, rgba(240, 194, 79, 0.34), rgba(240, 194, 79, 0.06) 74%)'
            : 'linear-gradient(155deg, rgba(240, 194, 79, 0.22), rgba(240, 194, 79, 0.04) 74%)',
          boxShadow:
            'inset 0 0 0 1px rgba(240, 194, 79, 0.32), 0 10px 26px rgba(240, 194, 79, 0.12)',
        }}
      >
        <Icon
          name={icon}
          size={19}
          style={{ filter: 'drop-shadow(0 0 10px rgba(240, 194, 79, 0.55))' }}
        />
      </span>
      <span className="flex flex-col min-w-0">
        <h2 className="text-[19px] font-semibold text-text tracking-[-0.01em] truncate">{title}</h2>
        <span className="text-[11px] text-faint truncate">{sub}</span>
      </span>
      <span
        aria-hidden
        className="flex-1 h-px min-w-0 ml-1"
        style={{
          background:
            'linear-gradient(90deg, rgba(240,194,79,0.3), var(--glass-line) 28%, transparent)',
        }}
      />
    </header>
  )
}

/* ------------------------------------------------------------
   Favourite tile — the shelf at the top of the page.

   Deliberately a DIFFERENT shape from the grid tile below: full-bleed art
   with the name set over it, gold-framed, shorter. If it were the same
   component the shelf would read as the first row of the grid accidentally
   repeated rather than as a shelf.
   ------------------------------------------------------------ */
function FavoriteTile({ g, index }: { g: GameMeta; index: number }) {
  const [hover, handlers] = useHoverState()

  return (
    <button
      type="button"
      data-nav={g.id}
      onClick={() => navigate(g.id)}
      {...handlers}
      className="relative w-full h-[188px] overflow-hidden text-left rounded-[18px] border flex flex-col justify-end"
      style={{
        borderColor: hover ? 'rgba(240, 194, 79, 0.72)' : 'rgba(240, 194, 79, 0.3)',
        background: 'linear-gradient(180deg, rgba(15, 20, 31, 0.96), rgba(10, 14, 22, 0.98))',
        boxShadow: hover
          ? `var(--lift-3), 0 0 0 1px rgba(240,194,79,0.45), 0 24px 56px ${g.accent}2b`
          : 'var(--lift-1), 0 0 0 1px rgba(240, 194, 79, 0.06)',
        transform: hover ? 'translateY(-6px)' : 'none',
        transition: `transform 240ms ${EASE}, box-shadow 240ms ${EASE}, border-color 240ms ${EASE}`,
      }}
    >
      {/* accent field */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(92% 88% at 50% 4%, ${g.accent}5c, transparent 70%),
            linear-gradient(180deg, ${g.accent}2e, rgba(9, 13, 20, 0.6))`,
          transform: hover ? 'scale(1.06)' : 'none',
          transition: `transform 480ms ${EASE}`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: texture(g.accent, index),
          opacity: hover ? 0.85 : 0.6,
          transform: hover ? 'scale(1.06)' : 'none',
          transition: `opacity 300ms ${EASE}, transform 480ms ${EASE}`,
        }}
      />
      <span
        aria-hidden
        className="absolute -right-5 top-3 select-none"
        style={{
          color: g.accent,
          opacity: hover ? 0.32 : 0.22,
          transform: hover ? 'rotate(-8deg) scale(1.08)' : 'rotate(-8deg)',
          transition: `opacity 300ms ${EASE}, transform 480ms ${EASE}`,
        }}
      >
        <Icon name={g.icon} size={112} strokeWidth={0.9} />
      </span>

      {/* gold leaf along the top edge — the shelf's signature */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(240,194,79,0.75) 28%, rgba(255,255,255,0.6) 50%, rgba(240,194,79,0.75) 72%, transparent)',
        }}
      />

      {/* the lit medallion, sitting high so the name plate can breathe */}
      <span
        className="absolute inset-x-0 top-[26px] flex justify-center"
        style={{
          transform: hover ? 'translateY(-5px) scale(1.06)' : 'none',
          transition: `transform 340ms ${EASE}`,
        }}
      >
        <span
          className="flex items-center justify-center rounded-[18px] w-[58px] h-[58px]"
          style={{
            color: g.accent,
            background: `linear-gradient(155deg, ${g.accent}4d, rgba(7, 10, 17, 0.72) 76%)`,
            boxShadow: `inset 0 1px 0 ${g.accent}80, inset 0 0 0 1px ${g.accent}5c, 0 14px 32px rgba(0,0,0,0.45)`,
          }}
        >
          <Icon
            name={g.icon}
            size={26}
            strokeWidth={1.6}
            style={{ filter: `drop-shadow(0 0 12px ${g.accent})` }}
          />
        </span>
      </span>

      {/* favorite mark */}
      <span
        className="absolute top-3 left-3 flex items-center justify-center w-6 h-6 rounded-full"
        style={{
          color: '#1a1403',
          background: 'linear-gradient(180deg, var(--color-gold-2), var(--color-gold))',
          boxShadow: '0 4px 14px rgba(240, 194, 79, 0.45)',
        }}
        title="One of your favorites"
      >
        <Icon name={FAV_ICON} size={12} strokeWidth={2.6} style={{ fill: 'currentColor' }} />
      </span>

      <span
        className="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap max-w-[58%] truncate"
        style={{
          color: g.accent,
          background: 'rgba(6, 9, 15, 0.62)',
          border: `1px solid ${g.accent}52`,
        }}
      >
        {g.tag}
      </span>

      {/* name set over the art — the shelf's other signature */}
      <span
        className="relative flex items-end gap-2 px-3.5 pb-3 pt-8"
        style={{
          background:
            'linear-gradient(180deg, transparent, rgba(6, 9, 15, 0.78) 45%, rgba(6, 9, 15, 0.95))',
        }}
      >
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="block text-[15px] font-semibold text-text truncate">{g.name}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-faint truncate">
            {g.provider}
          </span>
        </span>
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          style={{
            color: hover ? '#1a1403' : 'var(--color-gold)',
            background: hover
              ? 'linear-gradient(180deg, var(--color-gold-2), var(--color-gold))'
              : 'rgba(240, 194, 79, 0.14)',
            boxShadow: hover
              ? '0 6px 18px rgba(240, 194, 79, 0.5)'
              : 'inset 0 0 0 1px rgba(240, 194, 79, 0.32)',
            transform: hover ? 'scale(1.08)' : 'none',
            transition: `transform 220ms ${EASE}, background 220ms ${EASE}, color 220ms ${EASE}, box-shadow 220ms ${EASE}`,
          }}
        >
          <Icon name="play" size={13} strokeWidth={2.5} style={{ fill: 'currentColor' }} />
        </span>
      </span>
    </button>
  )
}

/* ------------------------------------------------------------
   The grid tile. Art panel on top, name plate underneath.
   ------------------------------------------------------------ */
function GameCard({ g, index, favorite }: { g: GameMeta; index: number; favorite: boolean }) {
  const [hover, handlers] = useHoverState()

  /* `w-full` on the root is load-bearing: Stagger's per-child motion.div is
     the real grid item, and without it this button shrink-to-fits its text
     and tiles come out different widths across a row (rule 4). The fixed
     `h-[262px]` does the same job for height — a min-height lets a
     two-line name push one tile a couple of pixels taller than its
     neighbours, which is instantly visible across a 4-up row. */
  return (
    <button
      type="button"
      data-nav={g.id}
      onClick={() => navigate(g.id)}
      {...handlers}
      className="game-card group relative w-full h-[262px] overflow-hidden text-left rounded-[18px] border flex flex-col"
      style={{
        borderColor: hover
          ? `${g.accent}99`
          : favorite
            ? 'rgba(240, 194, 79, 0.26)'
            : 'var(--glass-line)',
        background: 'linear-gradient(180deg, rgba(15, 20, 31, 0.96), rgba(10, 14, 22, 0.98))',
        boxShadow: hover
          ? `var(--lift-3), 0 0 0 1px ${g.accent}5e, 0 26px 60px ${g.accent}2b`
          : 'var(--lift-1)',
        transform: hover ? 'translateY(-6px)' : 'none',
        transition: `transform 240ms ${EASE}, box-shadow 240ms ${EASE}, border-color 240ms ${EASE}`,
      }}
    >
      {/* ---------- art panel ---------- */}
      <span className="relative flex-1 overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(88% 96% at 50% 8%, ${g.accent}52, transparent 68%),
              linear-gradient(180deg, ${g.accent}26, rgba(9, 13, 20, 0.55))`,
            transform: hover ? 'scale(1.06)' : 'none',
            transition: `transform 480ms ${EASE}`,
          }}
        />

        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: texture(g.accent, index),
            opacity: hover ? 0.85 : 0.6,
            transform: hover ? 'scale(1.06)' : 'none',
            transition: `opacity 300ms ${EASE}, transform 480ms ${EASE}`,
          }}
        />

        <span
          aria-hidden
          className="absolute -right-6 -bottom-9 select-none"
          style={{
            color: g.accent,
            opacity: hover ? 0.3 : 0.2,
            transform: hover ? 'rotate(-8deg) scale(1.08)' : 'rotate(-8deg)',
            transition: `opacity 300ms ${EASE}, transform 480ms ${EASE}`,
          }}
        >
          <Icon name={g.icon} size={128} strokeWidth={0.9} />
        </span>

        <span
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: hover ? 'translateY(-8px) scale(1.06)' : 'none',
            transition: `transform 340ms ${EASE}`,
          }}
        >
          <span
            className="flex items-center justify-center rounded-[19px] w-[62px] h-[62px]"
            style={{
              color: g.accent,
              background: `linear-gradient(155deg, ${g.accent}45, rgba(7, 10, 17, 0.72) 76%)`,
              boxShadow: `inset 0 1px 0 ${g.accent}7a, inset 0 0 0 1px ${g.accent}52, 0 14px 34px rgba(0,0,0,0.45)`,
            }}
          >
            <Icon
              name={g.icon}
              size={28}
              strokeWidth={1.6}
              style={{ filter: `drop-shadow(0 0 12px ${g.accent})` }}
            />
          </span>
        </span>

        <span
          className="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap max-w-[58%] truncate"
          style={{
            color: g.accent,
            background: 'rgba(6, 9, 15, 0.6)',
            border: `1px solid ${g.accent}52`,
          }}
        >
          {g.tag}
        </span>

        {/* Flags, top-left. Favourite and Hot are independent — Roulette is
            both — so they share a row rather than competing for the slot. */}
        <span className="absolute top-3 left-3 flex items-center gap-1.5">
          {favorite && (
            <span
              className="flex items-center justify-center w-[22px] h-[22px] rounded-full"
              style={{
                color: '#1a1403',
                background: 'linear-gradient(180deg, var(--color-gold-2), var(--color-gold))',
                boxShadow: '0 4px 14px rgba(240, 194, 79, 0.42)',
              }}
              title="One of your favorites"
            >
              <Icon name={FAV_ICON} size={11} strokeWidth={2.6} style={{ fill: 'currentColor' }} />
            </span>
          )}
          {g.featured && (
            <span
              className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full"
              style={{
                color: '#1a1403',
                background: 'linear-gradient(180deg, var(--color-gold-2), var(--color-gold))',
                boxShadow: '0 4px 14px rgba(240, 194, 79, 0.4)',
              }}
            >
              <Icon name="flame" size={10} strokeWidth={2.5} />
              Hot
            </span>
          )}
        </span>

        <span
          className="absolute inset-0 flex items-end p-3.5"
          style={{
            background:
              'linear-gradient(180deg, rgba(5,7,12,0.1) 30%, rgba(5,7,12,0.82) 78%, rgba(5,7,12,0.94))',
            opacity: hover ? 1 : 0,
            transition: `opacity 260ms ${EASE}`,
          }}
        >
          <span
            className="block text-[12px] leading-snug text-text line-clamp-3"
            style={{
              transform: hover ? 'translateY(0)' : 'translateY(6px)',
              transition: `transform 300ms ${EASE}`,
            }}
          >
            {g.desc}
          </span>
        </span>

        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-10"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(11, 15, 24, 0.95))' }}
        />
      </span>

      {/* ---------- name plate ---------- */}
      <span
        className="relative flex items-center gap-2.5 px-3.5 py-3 border-t shrink-0"
        style={{ borderColor: hover ? `${g.accent}3d` : 'var(--glass-line)' }}
      >
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="block text-[14px] font-semibold text-text truncate">{g.name}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-faint truncate">
            {g.provider}
          </span>
        </span>
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          style={{
            color: hover ? '#0a0d14' : g.accent,
            background: hover
              ? `linear-gradient(180deg, ${g.accent}, ${g.accent}cc)`
              : `${g.accent}1c`,
            boxShadow: hover ? `0 6px 18px ${g.accent}66` : `inset 0 0 0 1px ${g.accent}3d`,
            transform: hover ? 'scale(1.08)' : 'none',
            transition: `transform 220ms ${EASE}, background 220ms ${EASE}, color 220ms ${EASE}, box-shadow 220ms ${EASE}`,
          }}
        >
          <Icon name="play" size={13} strokeWidth={2.5} style={{ fill: 'currentColor' }} />
        </span>
      </span>

      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[2px] origin-center"
        style={{
          background: `linear-gradient(90deg, transparent, ${g.accent}, transparent)`,
          transform: hover ? 'scaleX(1)' : 'scaleX(0)',
          transition: `transform 320ms ${EASE}`,
        }}
      />
    </button>
  )
}

/* ------------------------------------------------------------
   Filter tab.
   ------------------------------------------------------------ */
function Chip({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  icon: IconName
  label: string
  count: number
  onClick: () => void
}) {
  const [hover, handlers] = useHoverState()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...handlers}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-[13px] font-medium whitespace-nowrap"
      style={{
        color: active ? '#1a1403' : hover ? 'var(--color-text)' : 'var(--color-muted)',
        background: active
          ? 'linear-gradient(180deg, var(--color-gold-2), var(--color-gold))'
          : hover
            ? 'var(--glass-2)'
            : 'var(--glass)',
        borderColor: active ? 'transparent' : 'var(--glass-line)',
        boxShadow: active ? '0 6px 20px rgba(240, 194, 79, 0.28)' : 'none',
        transition: `background 180ms ${EASE}, color 180ms ${EASE}, border-color 180ms ${EASE}`,
      }}
    >
      <Icon name={icon} size={15} />
      {label}
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={{
          background: active ? 'rgba(26, 20, 3, 0.18)' : 'rgba(255, 255, 255, 0.07)',
          color: active ? '#1a1403' : 'var(--color-faint)',
        }}
      >
        {count}
      </span>
    </button>
  )
}

/** The Favorites tab is a synthetic category — it has no entry in
 *  CATEGORIES (which is legacy-sourced and must stay verbatim). */
const FAV_KEY = 'favorites'

export default function Lobby() {
  // Live subscription, still genuinely read below — the balance chip. It is
  // deliberately rendered OUTSIDE every Reveal (rule 8): it updates without
  // a route change, and Reveal is for content that mounts once.
  const balance = useWalletStore((s) => s.balance)

  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const q = query.trim()

  // Resolved against GAMES so an id that isn't built yet drops out quietly
  // rather than rendering a hole in the shelf. Order follows FAVORITES, not
  // registry order — the shelf is a curated sequence.
  const favorites = useMemo(
    () => FAVORITES.map((id) => GAMES.find((g) => g.id === id)).filter((g): g is GameMeta => !!g),
    [],
  )
  const favoriteIds = useMemo(() => new Set(favorites.map((g) => g.id)), [favorites])

  // Rule 2 — a category exists on the floor only if something in it is
  // actually built. CATEGORIES[].ids stays the full legacy roster.
  const builtCats = useMemo(
    () => CATEGORIES.filter((cat) => GAMES.some((g) => cat.ids.includes(g.id))),
    [],
  )

  const sections = useMemo(() => {
    if (activeCat === FAV_KEY) {
      const games = favorites.filter((g) => matches(g, q))
      return games.length > 0
        ? [{ key: FAV_KEY, label: 'Favorites', icon: FAV_ICON as IconName, games }]
        : []
    }
    return builtCats
      .filter((cat) => activeCat === 'all' || cat.key === activeCat)
      .map((cat) => ({
        key: cat.key,
        label: cat.label,
        icon: cat.icon,
        games: GAMES.filter((g) => cat.ids.includes(g.id) && matches(g, q)),
      }))
      .filter((s) => s.games.length > 0)
  }, [builtCats, favorites, activeCat, q])

  const resultCount = sections.reduce((n, s) => n + s.games.length, 0)
  const providers = new Set(GAMES.map((g) => g.provider)).size
  const filtering = q !== '' || activeCat !== 'all'

  // The shelf is the unfiltered view's masthead. Once you're searching or
  // sitting on a specific tab it would just be repeating tiles you can
  // already see, so it stands down.
  const showShelf = q === '' && activeCat === 'all' && favorites.length > 0

  return (
    <div>
      {/* ---- page head ------------------------------------------------ */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <Reveal preset="fadeUp" as="div" className="page-head min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-gold">
            <Icon name="crown" size={13} />
            Royal Casino
            <span
              aria-hidden
              className="inline-block w-14 h-px"
              style={{ background: 'linear-gradient(90deg, var(--color-gold-deep), transparent)' }}
            />
          </div>
          <h1
            className="page-title text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] mt-2"
            style={{
              backgroundImage:
                'linear-gradient(168deg, #ffffff 10%, var(--color-gold-2) 62%, var(--color-gold-deep) 108%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 6px 26px rgba(240, 194, 79, 0.22))',
            }}
          >
            The Floor
          </h1>
          <p className="page-sub text-sm text-muted mt-2">
            {GAMES.length} tables live across {providers} providers · every result provably random,
            every chip simulated.
          </p>
        </Reveal>

        {/* Live figure — no Reveal wrapper, see rule 8 above. */}
        <div
          className="flex items-center gap-3.5 px-4 py-3 rounded-[16px] border shrink-0"
          style={{
            borderColor: 'rgba(240, 194, 79, 0.22)',
            background:
              'linear-gradient(150deg, rgba(240, 194, 79, 0.12), rgba(255, 255, 255, 0.03) 62%)',
            boxShadow: 'var(--lift-1), 0 14px 40px rgba(240, 194, 79, 0.09)',
          }}
        >
          <span
            className="flex items-center justify-center w-10 h-10 rounded-[12px] text-gold"
            style={{
              background: 'rgba(240, 194, 79, 0.14)',
              boxShadow: 'inset 0 0 0 1px rgba(240, 194, 79, 0.32)',
            }}
          >
            <Icon
              name="wallet"
              size={18}
              style={{ filter: 'drop-shadow(0 0 10px rgba(240, 194, 79, 0.6))' }}
            />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-faint">
              Balance
            </span>
            <span className="num text-gold text-[19px]">{money(balance)}</span>
          </span>
        </div>
      </div>

      {/* ---- favorites shelf ----------------------------------------- */}
      {showShelf && (
        <Reveal preset="fadeUp" as="section" delay={0.05} className="mb-9">
          <div
            className="relative overflow-hidden rounded-[22px] border px-5 py-5 sm:px-6 sm:py-6"
            style={{
              borderColor: 'rgba(240, 194, 79, 0.2)',
              background:
                'linear-gradient(146deg, rgba(240, 194, 79, 0.1), rgba(255, 255, 255, 0.022) 52%, rgba(255, 255, 255, 0.012))',
              boxShadow: 'var(--lift-2), 0 26px 70px rgba(240, 194, 79, 0.07)',
            }}
          >
            {/* gold leaf along the shelf's own top edge */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(240,194,79,0.6) 18%, rgba(255,255,255,0.45) 50%, rgba(240,194,79,0.6) 82%, transparent)',
              }}
            />
            {/* a single slow sheen so the shelf reads as lit, not painted */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-[-45%] left-0 w-[14%]"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
                animation: `lobbySheen 9s ${EASE} infinite`,
              }}
            />

            <SectionHead
              icon={FAV_ICON}
              title="Favorites"
              sub={`${favorites.length} tables · straight back to the ones you play`}
              gold
            />

            <Stagger
              className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(196px,1fr))]"
              stagger={0.04}
              y={14}
            >
              {favorites.map((g) => (
                <FavoriteTile key={g.id} g={g} index={GAMES.indexOf(g)} />
              ))}
            </Stagger>
          </div>
        </Reveal>
      )}

      {/* ---- filter bar ----------------------------------------------- */}
      <Reveal
        preset="fadeUp"
        as="div"
        delay={0.1}
        className="mb-8 flex flex-wrap items-center gap-2.5"
      >
        <input
          id="lobbySearch"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${GAMES.length} tables…`}
          aria-label="Search tables"
          className="w-full sm:w-[254px] px-4 py-2.5 rounded-full border text-[13px] text-text placeholder:text-faint outline-none"
          style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
        />

        <Chip
          active={activeCat === FAV_KEY}
          icon={FAV_ICON}
          label="Favorites"
          count={favorites.length}
          onClick={() => setActiveCat(FAV_KEY)}
        />
        <Chip
          active={activeCat === 'all'}
          icon="gamepad-2"
          label="All games"
          count={GAMES.length}
          onClick={() => setActiveCat('all')}
        />
        {builtCats.map((cat) => (
          <Chip
            key={cat.key}
            active={activeCat === cat.key}
            icon={cat.icon}
            label={cat.label}
            count={GAMES.filter((g) => cat.ids.includes(g.id)).length}
            onClick={() => setActiveCat(cat.key)}
          />
        ))}

        {filtering && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setActiveCat('all')
            }}
            className="text-[12px] text-faint hover:text-text transition-colors px-2 py-2 whitespace-nowrap"
          >
            Clear
          </button>
        )}
      </Reveal>

      {/* ---- the floor ------------------------------------------------ */}
      {sections.map((section) => {
        const catProviders = [...new Set(section.games.map((g) => g.provider))].join(' · ')
        return (
          <section key={section.key} className="mb-11">
            <SectionHead
              icon={section.icon}
              title={section.label}
              sub={`${section.games.length} ${section.games.length === 1 ? 'table' : 'tables'} · ${catProviders}`}
              gold={section.key === FAV_KEY}
            />

            {/* Keyed by the active filter so a filter change is a genuine
                remount, not a persistent container re-animating in place
                (rule 8). */}
            <Stagger
              key={`${section.key}:${activeCat}:${q}`}
              className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(228px,1fr))]"
            >
              {section.games.map((g) => (
                <GameCard
                  key={g.id}
                  g={g}
                  index={GAMES.indexOf(g)}
                  favorite={favoriteIds.has(g.id)}
                />
              ))}
            </Stagger>
          </section>
        )
      })}

      {resultCount === 0 && (
        <div
          className="rounded-[18px] border px-6 py-14 text-center"
          style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
        >
          <div className="flex justify-center text-faint mb-3">
            <Icon name="circle-help" size={32} strokeWidth={1.5} />
          </div>
          <p className="text-[15px] text-text font-medium">No tables match “{q}”.</p>
          <p className="text-[13px] text-muted mt-1.5">
            Try a game name, a provider, or a payout — “live”, “originals”, “cash out”.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setActiveCat('all')
            }}
            className="btn btn-sm mt-6"
          >
            Show every table
          </button>
        </div>
      )}
    </div>
  )
}
