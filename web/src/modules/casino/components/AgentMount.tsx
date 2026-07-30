import { Icon } from '@/platform/icons'
import { Button } from '@/platform/ui'
import { useLabUiStore } from '@/modules/casino/lab/labUiStore'
import { useIsMobile } from '@/platform/layout/useMediaQuery'

/* ============================================================
   Explicit mount point for the "Let AI play" control.

   The vanilla Lab injects that button into view.querySelectorAll(".panel")[1]
   — an index into the DOM, which quietly breaks the moment a game grows a
   third panel. handoff §2b calls replacing it with a real mount point the
   cleaner option; this is it.

   Every game's controls panel renders <AgentMount />. Phase 2's React Lab
   targets #agentMount instead of counting panels.

   The button itself just opens LabDrawer.tsx (`setDrawerOpen(true)`) --
   it doesn't need a game id prop, since `royalAgent.currentGameId()`
   already reads `location.hash` (PHASE_2_AGENT_PLAN.md §5). Configuring
   and actually starting the AI (model, aggression, Start button) all live
   in the drawer itself, one control surface, not duplicated here.
   ============================================================ */
export default function AgentMount() {
  const setDrawerOpen = useLabUiStore((s) => s.setDrawerOpen)
  // The AI Lab drives a local Ollama model — a desktop-only feature. On
  // mobile the mount point stays in the DOM (`#agentMount` is a dom-contract
  // fixture, tests/dom-contract.spec.ts) but renders empty; `empty:mt-0`
  // below collapses its own margin so it takes up no visible space.
  const isMobile = useIsMobile()

  return (
    <div id="agentMount" data-agent-mount className="mt-4 empty:mt-0">
      {!isMobile && (
        <Button
          variant="purple"
          size="sm"
          className="inline-flex items-center gap-1.5"
          onClick={() => setDrawerOpen(true)}
        >
          <Icon name="bot" size={14} /> Let AI play
        </Button>
      )}
    </div>
  )
}
