import { create } from 'zustand'

/* ============================================================
   Lab UI chrome -- plan §5. Drawer/HUD open/collapsed/height and whether
   the HUD has been dismissed. This is React-owned UI state with no
   legacy-agent equivalent to preserve: legacy tracked the same things as
   DOM classes/inline styles set directly by agent-lab.js, not as data
   any other module read.

   Deliberately NOT here: royalAgent's own settings (aggression, speed,
   model, ...) and stats/log. Those are "one state, one writer" owned by
   agentUi.ts (`royalAgent.settings` / `royalAgent.getStats()`) and mirrored
   read-only by useAgentStore. Duplicating any of that here would blur a
   boundary the plan is explicit about not blurring -- this store only
   knows about drawer/HUD chrome, nothing the agent itself cares about.

   No `persist` middleware: unlike wallet/motion (durable player data and
   a real preference), whether the drawer happens to be open/collapsed and
   how tall it was dragged to is session-local chrome, not worth surviving
   a reload.
   ============================================================ */

/** Starting drawer height in px -- a reasonable default before the user ever drags the resizer. */
const DEFAULT_DRAWER_HEIGHT = 320

type LabUiState = {
  drawerOpen: boolean
  drawerCollapsed: boolean
  /** px, current rendered height -- read by AppShell to pad .app-main (plan §5 clearance note). */
  drawerHeight: number
  hudDismissed: boolean

  setDrawerOpen: (open: boolean) => void
  toggleDrawerCollapsed: () => void
  setDrawerHeight: (px: number) => void
  dismissHud: () => void
  /** Legacy `RoyalLab.showHud()` -- resets hudDismissed. */
  showHud: () => void
}

export const useLabUiStore = create<LabUiState>()((set) => ({
  // Closed by default -- matches legacy's Lab drawer starting collapsed
  // until "Let AI play" (AgentMount.tsx) opens it.
  drawerOpen: false,
  drawerCollapsed: false,
  drawerHeight: DEFAULT_DRAWER_HEIGHT,
  hudDismissed: false,

  setDrawerOpen: (open) => set({ drawerOpen: open }),

  toggleDrawerCollapsed: () => set((s) => ({ drawerCollapsed: !s.drawerCollapsed })),

  setDrawerHeight: (px) => set({ drawerHeight: px }),

  dismissHud: () => set({ hudDismissed: true }),

  showHud: () => set({ hudDismissed: false }),
}))
