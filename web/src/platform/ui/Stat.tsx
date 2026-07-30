import type { ReactNode } from 'react'
import { cn } from './cn'

export type StatTone = 'default' | 'green' | 'red' | 'gold'

const TONE_COLOR: Record<StatTone, string | undefined> = {
  default: undefined,
  green: 'var(--color-green)',
  red: 'var(--color-red)',
  gold: 'var(--color-gold)',
}

export interface StatProps {
  k: string
  v: ReactNode
  id?: string
  className?: string
  tone?: StatTone
}

/**
 * A labelled stat tile. `js/agent/agent-ui.js` reads the agent-facing values
 * by `id` with `parseFloat`/`parseInt` on `textContent` — the `id` MUST stay
 * on the `.v.num` node, and that node MUST contain nothing but the bare
 * value (no units, icons, or sibling text). Do not add a count-up animation
 * here: the agent polls at arbitrary times, and a mid-tween textContent read
 * is the same silent-failure class as putting the id on the wrong node.
 */
export function Stat({ k, v, id, className, tone = 'default' }: StatProps) {
  return (
    <div
      className={cn('stat rounded-[10px] border px-3 py-2', className)}
      style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
    >
      <div className="k text-[11px] uppercase tracking-wide text-muted">{k}</div>
      <div className="v num text-text mt-0.5" id={id} style={{ color: TONE_COLOR[tone] }}>
        {v}
      </div>
    </div>
  )
}
