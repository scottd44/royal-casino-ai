import { useSyncExternalStore } from 'react'
import { useLayoutModeStore } from './layoutModeStore'

/** Subscribes to a media query and re-renders on change. SSR-safe (defaults
 *  to `false` when `window.matchMedia` isn't available). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Phone-and-narrower breakpoint shared by MobileShell and the games that
 *  branch their layout on it. */
export const MOBILE_QUERY = '(max-width: 768px)'

/** Follows the real viewport by default, but can be pinned to 'mobile' or
 *  'desktop' via layoutModeStore (see the topbar's phone-mode toggle) so
 *  phone layout can be forced from a desktop browser for testing. */
export function useIsMobile(): boolean {
  const matches = useMediaQuery(MOBILE_QUERY)
  const mode = useLayoutModeStore((s) => s.mode)
  if (mode === 'mobile') return true
  if (mode === 'desktop') return false
  return matches
}
