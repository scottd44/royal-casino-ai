import { create } from 'zustand'
import { bootLegacyAgent } from './legacyBridge'
import type { AgentStats, RoyalAgent } from './types'

/* ============================================================
   React's mirror of RoyalAgent.

   ONE DIRECTION ONLY: the agent is the writer, React reads. It pushes via
   setOnUpdate; nothing here ever writes agent state back. Handoff §2c is
   explicit that agent-ui.js stays framework-agnostic — the moment React
   starts driving it, the tilt model and bankroll logic have two owners.
   ============================================================ */

type AgentUiState = {
  agent: RoyalAgent | null
  ready: boolean
  error: string | null
  stats: AgentStats | null
  boot: () => Promise<void>
}

export const useAgentStore = create<AgentUiState>((set, get) => ({
  agent: null,
  ready: false,
  error: null,
  stats: null,

  boot: async () => {
    if (get().ready || get().agent) return
    try {
      const agent = await bootLegacyAgent()
      agent.setOnUpdate(() => {
        // Pull, never push.
        set({ stats: agent.getStats() })
      })
      set({ agent, ready: true, stats: agent.getStats() })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
}))
