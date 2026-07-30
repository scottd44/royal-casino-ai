import { useEffect } from 'react'
import { readHash } from '@/app/hashRoute'
import { defaultPack } from './defaultPack'
import { getPackForGame } from './packRegistry'

/* ============================================================
   One delegated click blip for every control in the app — ported from
   js/app.js:668-682's document-level capture listener. Every game's action
   buttons, quick-bet chips, and tiles (Mines/Battleship/TileGrid.tsx) are
   real <button> elements (platform/ui/Button.tsx, components/TileGrid.tsx),
   so `"button, [data-bet]"` covers the same surface legacy's longer,
   class-name-specific selector did — one listener, wired once in
   AppShell.tsx, instead of a sound call in every game's onClick.

   Themed per table: reads the current route (same `location.hash` trick
   agentUi.ts's currentGameId() uses) and plays THAT game's own click cue
   (games/<Game>/sounds.ts) if it has one, falling back to the neutral
   defaultPack on the Lobby or any route without a registered pack.

   Capture phase, same as legacy, so it fires before a game's own handler
   can stop propagation.
   ============================================================ */
const CLICKABLE = 'button, [data-bet]'

export function useGlobalClickSound() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target?.closest(CLICKABLE)) return
      const pack = getPackForGame(readHash())
      ;(pack ?? defaultPack).click()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}
