import type { ReactNode } from 'react'

export function GameLayout({ children }: { children: ReactNode }) {
  return <div className="game-layout grid gap-5 lg:grid-cols-[1fr_340px] items-start">{children}</div>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`panel rounded-[14px] border p-5 ${className}`}
      style={{
        borderColor: 'var(--glass-line)',
        background: 'var(--glass-panel)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        boxShadow: 'var(--lift-2)',
      }}
    >
      {children}
    </section>
  )
}

export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="page-head mb-5">
      <h1 className="page-title text-2xl font-semibold text-text">{title}</h1>
      <p className="page-sub text-sm text-muted mt-1">{sub}</p>
    </div>
  )
}

export function Stat({ k, v, id }: { k: string; v: ReactNode; id?: string }) {
  return (
    <div
      className="stat rounded-[10px] border px-3 py-2"
      style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
    >
      <div className="k text-[11px] uppercase tracking-wide text-muted">{k}</div>
      <div className="v num text-text mt-0.5" id={id}>
        {v}
      </div>
    </div>
  )
}

export function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      type="button"
      {...rest}
      className={`btn rounded-[10px] px-4 py-2.5 font-medium transition-transform active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  )
}
