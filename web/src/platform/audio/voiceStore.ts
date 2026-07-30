import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ============================================================
   AI voice preference — on/off only, persisted, same "one state, one
   writer" pattern as soundStore.ts. Deliberately separate from the SFX
   mute flag: a player might want the win/lose blips but not a synthesized
   voice reading the AI's trash talk out loud (or vice versa), so the two
   are independent toggles.
   ============================================================ */

type VoiceState = {
  enabled: boolean
  toggleEnabled: () => void
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      enabled: true,
      toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
    }),
    { name: 'royal_casino_voice_v1' },
  ),
)
