import { useSyncExternalStore } from 'react'

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

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}
