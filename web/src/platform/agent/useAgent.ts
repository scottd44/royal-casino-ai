import { create } from 'zustand'
import { royalAgent } from './agentUi'
import type { AgentStats, RoyalAgent } from './types'

/* ============================================================
   React's mirror of RoyalAgent.

   ONE DIRECTION ONLY: the agent is the writer, React reads. It pushes via
   setOnUpdate; nothing here ever writes agent state back. Handoff §2c is
   explicit that agent-ui.js (now agentUi.ts) stays framework-agnostic — the
   moment React starts driving it, the tilt model and bankroll logic have
   two owners.

   Phase 2 simplification (plan §6): `royalAgent` is a real ES module import
   now, not a classic script loaded async into `window.RoyalAgent`, so there
   is no boot() to await — module evaluation IS the boot. That deletes every
   one of legacyBridge.ts's three "has to get right" concerns (window.Casino
   timing, script load order, the endpoint patch): a real import can't race
   itself, and the endpoint is just a constructor option now (agentUi.ts).
   ============================================================ */

type AgentUiState = {
  agent: RoyalAgent
  ready: boolean
  error: string | null
  stats: AgentStats | null
}

export const useAgentStore = create<AgentUiState>((set) => {
  royalAgent.setOnUpdate(() => {
    // Pull, never push.
    set({ stats: royalAgent.getStats() })
  })
  return { agent: royalAgent, ready: true, stats: royalAgent.getStats(), error: null }
})
