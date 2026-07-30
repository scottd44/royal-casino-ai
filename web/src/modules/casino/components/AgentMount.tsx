import { Icon } from '@/platform/icons'
import { Button } from '@/platform/ui'
import { useLabUiStore } from '@/modules/casino/lab/labUiStore'

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

  return (
    <div id="agentMount" data-agent-mount className="mt-4 empty:mt-0">
      <Button
        variant="purple"
        size="sm"
        className="inline-flex items-center gap-1.5"
        onClick={() => setDrawerOpen(true)}
      >
        <Icon name="bot" size={14} /> Let AI play
      </Button>
    </div>
  )
}
