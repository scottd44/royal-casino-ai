import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ============================================================
   Sound preference — the mute flag only. The synthesis engine moved to
   engine.ts (oscillators/noise/reverb primitives) and defaultPack.ts /
   games/<Game>/sounds.ts (the actual themed cues); this file's only job is
   "is sound on", read by engine.ts's `getCtx()` gate and by the mute
   toggle button in AppShell.tsx. Same "one state, one writer" pattern as
   walletStore.ts/motionStore.ts.
   ============================================================ */

type SoundState = {
  muted: boolean
  toggleMute: () => void
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      muted: false,
      toggleMute: () => set((s) => ({ muted: !s.muted })),
    }),
    { name: 'royal_casino_sound_v1' },
  ),
)

/** Non-reactive reads/actions, for use outside React. */
export const soundPref = {
  toggleMute: () => useSoundStore.getState().toggleMute(),
  isMuted: () => useSoundStore.getState().muted,
}
