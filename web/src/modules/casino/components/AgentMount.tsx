/* ============================================================
   Explicit mount point for the "Let AI play" control.

   The vanilla Lab injects that button into view.querySelectorAll(".panel")[1]
   — an index into the DOM, which quietly breaks the moment a game grows a
   third panel. handoff §2b calls replacing it with a real mount point the
   cleaner option; this is it.

   Every game's controls panel renders <AgentMount />. Phase 2's React Lab
   targets #agentMount instead of counting panels.
   ============================================================ */
export default function AgentMount() {
  return <div id="agentMount" data-agent-mount className="mt-4 empty:mt-0" />
}
