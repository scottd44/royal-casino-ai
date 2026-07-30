import { useEffect, useState } from 'react'

/* ============================================================
   Minimal hash router — deliberately NOT react-router's createHashRouter.

   The agent contract fixes the URL shape. js/agent/agent-ui.js:1856:

     function currentGameId() { return location.hash.replace("#", ""); }

   and switchToGame()'s fallback is `location.hash = gid`. So the hash must
   be exactly `#dice`, with no leading slash.

   createHashRouter produces `#/dice`, which makes currentGameId() return
   "/dice" — adapters[gid] is then undefined and the run loop never
   recognises a table. React Router offers no way to drop that slash.

   Forty lines here beats fighting the router in the one place the whole
   spike is trying to de-risk. React Router stays installed for Phase 1,
   where the shell gets real routing behind a compat layer that keeps this
   contract intact.
   ============================================================ */

/** The current route id — "" is the lobby, otherwise a game id. */
export function useHashRoute(): string {
  const [route, setRoute] = useState(() => readHash())

  useEffect(() => {
    const onChange = () => setRoute(readHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function readHash(): string {
  return window.location.hash.replace('#', '')
}

/** Navigate. This is exactly what a [data-nav] click and the agent's
 *  fallback both do, so there is one code path for both. */
export function navigate(id: string): void {
  window.location.hash = id
}
