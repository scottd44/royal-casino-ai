import type { HTMLAttributes, ReactNode } from 'react'
import { Icon } from '@/platform/icons'
import type { IconName } from '@/platform/icons'
import { cn } from './cn'

export function GameLayout({ children }: { children: ReactNode }) {
  return <div className="game-layout grid gap-5 lg:grid-cols-[1fr_340px] items-start">{children}</div>
}

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
}

/** The frosted-glass card shell every game's layout is built from.
 *  `.panel` is a legacy CSS/agent-lab.js hook — keep it first. Uses the
 *  `.glass` recipe class (index.css) for the background/blur/border/shadow
 *  so the rendered surface matches the legacy panel exactly. */
export function Panel({ children, className, ...rest }: PanelProps) {
  return (
    <section className={cn('panel glass rounded-[14px] p-5', className)} {...rest}>
      {children}
    </section>
  )
}

/** `icon`, when given, reproduces legacy `Casino.icon("dices", "ico-title")`
 *  (js/games/dice.js:15) — the larger, gold page-title treatment
 *  (DEVELOPMENT_GUIDE.md §2), not the small inline-button icon size. */
export function PageHead({ title, sub, icon }: { title: string; sub: string; icon?: IconName }) {
  return (
    <div className="page-head mb-5">
      <h1 className="page-title text-2xl font-semibold text-text flex items-center gap-2.5">
        {icon && <Icon name={icon} size={26} className="text-gold" />}
        {title}
      </h1>
      <p className="page-sub text-sm text-muted mt-1">{sub}</p>
    </div>
  )
}
