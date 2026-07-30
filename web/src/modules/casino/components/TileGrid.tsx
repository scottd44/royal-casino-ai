import type { JSX, ReactNode } from 'react'

/* ============================================================
   TileGrid — generalises Mines' own working tile-grid pattern
   (MinesGame.tsx's `#grid`, read that file before touching this one)
   into the shared primitive Wave 3's five grid games (Tower, Keno,
   Battleship, Moles, Snakes — PHASE_3_GAMES_PLAN.md §1/§3a) build on
   instead of each reinventing the same button-per-tile plumbing slightly
   differently.

   ORDER IS THE CONTRACT. `tiles[i]` MUST render as the DOM's `i`-th
   `<button data-idx={i}>` child, always — no sort, no filter, no
   reordering, ever. `agent-ui.js` clicks tiles by array position
   (Mines already does this today; Tower/Battleship/Moles/Snakes/Keno will
   too per §3a). `key={i}` below is deliberate, not a shortcut: it also
   keeps React's own reconciliation from ever merging/reordering tiles out
   from under a live round.

   THE BUTTON NEVER UNMOUNTS. TileGrid owns exactly the `<button>`
   wrapper; `renderTile` supplies CONTENT only. Per Mines' own comment (and
   Reveal.tsx's own warning against wrapping a persistent container): a
   `<Reveal>` around something that never unmounts leaves a stalled tween's
   inline styles on a node that's never replaced, hiding it forever. If a
   GAME wants a per-tile icon to animate in on reveal, it wraps that icon
   in `Reveal` itself inside whatever it hands back from `renderTile` —
   TileGrid never does that on the caller's behalf, so it can never force
   an animation a still-hidden tile has nothing to reveal.

   TileGrid renders ONLY the shared skeleton: grid layout, button
   semantics, `data-idx`. It does not know what ".revealed"/".gem"/".hit"
   mean for any given game (Mines' `.gem` is unrelated to Battleship's
   `.hit`) — `tileClassName` is deliberately the ONLY place per-tile visual
   state lives, including background/border color. Don't add a default
   inline style here for either: that would out-specificity a caller's own
   Tailwind classes and make `tileClassName` a lie for exactly the
   properties every game actually needs to vary.
   ============================================================ */

export interface TileGridProps<T> {
  /** Container id — becomes `<div id={id}>`. Games' own adapters key off
   *  this: `#grid` (Mines), `#towerGrid`, `#molGrid`, `#bsGrid`, `#snBoard`,
   *  `#knBoard` (PHASE_3_GAMES_PLAN.md §3a's own id list). */
  id: string
  /** One entry per tile, in DOM order. See "ORDER IS THE CONTRACT" above. */
  tiles: T[]
  cols: number
  /** Tile CONTENT only — TileGrid renders the `<button>` around whatever
   *  this returns. Never wrap the returned node's OWN root in something
   *  that assumes it is the button; it is placed inside one. */
  renderTile: (tile: T, index: number) => ReactNode
  /** Per-tile state classes (`.revealed`, `.gem`, `.mine`, `.hit`, `.miss`,
   *  …) — game-specific vocabulary TileGrid deliberately doesn't know.
   *  Appended after the shared structural base below. */
  tileClassName?: (tile: T, index: number) => string
  onTileClick?: (index: number) => void
  /** Native `disabled` on the tile's own `<button>`. Left undefined, tiles
   *  are always clickable — some future consumer may prefer fully custom
   *  click handling wired inside `renderTile` itself instead of this prop. */
  disabled?: (tile: T, index: number) => boolean
}

/** Mines' own tile base classes (MinesGame.tsx's `.tile` button), copied
 *  verbatim for the structural part — aspect-square, rounded corners,
 *  1px border, flex-centered content, and a transition for whatever
 *  background/color swap a game's own `tileClassName`/inline style makes.
 *  `cursor-pointer`/`disabled:cursor-default` generalise Mines'
 *  hand-rolled `active && !revealed` cursor swap onto the native
 *  `disabled` attribute so every consumer gets correct cursor feedback
 *  for free just by driving `disabled`. */
const TILE_BASE =
  'tile aspect-square rounded-[10px] border flex items-center justify-center transition-all cursor-pointer disabled:cursor-default'

export function TileGrid<T>({
  id,
  tiles,
  cols,
  renderTile,
  tileClassName,
  onTileClick,
  disabled,
}: TileGridProps<T>): JSX.Element {
  return (
    // `data-idx-container` is a cheap, greppable marker that this div's
    // children are the ordered `data-idx` set an adapter may iterate — not
    // read by any adapter today, but costs nothing and saves a future
    // porter from guessing which wrapping div is the "real" one on a page
    // with nested layout divs.
    <div id={id} data-idx-container="" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {tiles.map((tile, i) => (
        <button
          key={i}
          type="button"
          data-idx={i}
          disabled={disabled?.(tile, i) ?? false}
          onClick={onTileClick ? () => onTileClick(i) : undefined}
          className={[TILE_BASE, tileClassName?.(tile, i) ?? ''].filter(Boolean).join(' ')}
        >
          {renderTile(tile, i)}
        </button>
      ))}
    </div>
  )
}
