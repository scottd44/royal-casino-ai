import type { CSSProperties, JSX, ReactNode } from 'react'
import { cn } from '@/platform/ui'

/* ============================================================
   Felt — the green-table surface Wave 4's card games (Blackjack, Video
   Poker, Baccarat, Three Card, Casino War, Red Dog, Hilo) sit their
   `Card`s on top of. Styling only, no game logic and no DOM contract of
   its own — no adapter selector in `js/agent/agent-ui.js` ever targets a
   `Felt` node directly, it is purely the backdrop a game's real contract
   ids/classes render inside.

   Checked `web/src/index.css` for an existing felt/table token before
   inventing one (PHASE_3_GAMES_PLAN.md §3b) — there isn't one yet. Rather
   than a flat literal casino-green fill (which would be the one place in
   the whole React build reaching for a raw color outside the token set),
   this composes the palette that's already there — `--color-green`,
   `--color-panel`/`--color-panel-2`, `--glass-line`, `--lift-2` — into a
   radial-gradient surface, matching the aurora/glass visual language the
   rest of the app already uses instead of a literal felt-cloth texture.
   ============================================================ */

export interface FeltProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Felt({ children, className, style }: FeltProps): JSX.Element {
  return (
    <div
      className={cn('felt rounded-[20px] border p-5', className)}
      style={{
        borderColor: 'var(--glass-line)',
        background:
          'radial-gradient(120% 140% at 50% -10%, color-mix(in srgb, var(--color-green) 16%, var(--color-panel-2)) 0%, var(--color-panel) 55%, var(--color-bg-1) 100%)',
        boxShadow: 'var(--lift-2)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
