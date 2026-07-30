import { useEffect } from 'react'
import { sound } from './soundStore'

/* ============================================================
   One delegated "click" blip for every control in the app — ported from
   js/app.js:668-682's document-level capture listener. Every game's action
   buttons, quick-bet chips, and tiles (Mines/Battleship/TileGrid.tsx) are
   real <button> elements (platform/ui/Button.tsx, components/TileGrid.tsx),
   so `"button, [data-bet]"` covers the same surface legacy's longer,
   class-name-specific selector did — one listener, wired once in
   AppShell.tsx, instead of a sound call in every game's onClick.

   Capture phase, same as legacy, so it fires before a game's own handler
   can stop propagation.
   ============================================================ */
const CLICKABLE = 'button, [data-bet]'

export function useGlobalClickSound() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target?.closest(CLICKABLE)) return
      sound.play('click')
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}
