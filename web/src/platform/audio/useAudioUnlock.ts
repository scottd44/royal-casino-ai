import { useEffect } from 'react'
import { unlockAudio } from './engine'

/* ============================================================
   Wires unlockAudio() to the first touch/pointer/click/key ANYWHERE in the
   app, plus a resume on returning to the foreground — the two things
   mobile browsers actually require that desktop doesn't (engine.ts's
   `unlockAudio()` doc comment has the full "why"). Wired once in
   AppShell.tsx, same as useGlobalClickSound.ts.
   ============================================================ */
export function useAudioUnlock() {
  useEffect(() => {
    function unlock() {
      unlockAudio()
    }
    // touchend (not touchstart) and pointerup mirror the moment iOS
    // actually counts as a completed user gesture; click/keydown cover
    // mouse/keyboard/desktop, where this is a harmless no-op alongside the
    // context the first click-sound would have created anyway.
    const events: Array<keyof DocumentEventMap> = ['touchend', 'pointerup', 'click', 'keydown']
    events.forEach((e) => document.addEventListener(e, unlock, { capture: true, passive: true }))

    // iOS can suspend a backgrounded tab's AudioContext; resuming on
    // foreground return means the next sound doesn't silently no-op.
    function onVisible() {
      if (!document.hidden) unlockAudio()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      events.forEach((e) => document.removeEventListener(e, unlock, true))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
