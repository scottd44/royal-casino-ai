import type { ReactNode } from 'react'

/** Wraps a game's mobile JSX branch in a locked 9:16 portrait frame with
 *  safe-area padding. Purely presentational — carries no agent-contract
 *  ids, no data-nav/data-agent-mount hooks, nothing the AI adapter looks
 *  for. Games opt into this only inside their `isMobile` branch; the
 *  desktop branch never touches it. */
export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mobile-shell mx-auto w-full flex flex-col"
      style={{
        maxWidth: 480,
        aspectRatio: '9 / 16',
        minHeight: '100%',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {children}
    </div>
  )
}
