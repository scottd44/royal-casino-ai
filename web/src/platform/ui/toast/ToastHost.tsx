import { AnimatePresence } from 'framer-motion'
import { Toast } from './Toast'
import { useToastStore } from './toastStore'

/* ============================================================
   ToastHost — the fixed-position stack. Mounted exactly ONCE, in
   AppShell.tsx (a later pass — this component just needs to be correct
   standalone), bottom-right, matching legacy `#toastHost`/`#toastWrap`
   positioning (`legacyBridge.ts:renderToast`).

   `pointer-events: none` on the container so the empty stack area doesn't
   eat clicks meant for whatever's underneath it; each `<Toast>` opts back
   into `pointer-events: auto` itself so its own content stays interactive.

   AnimatePresence here is exactly the case plan §4 / Reveal.tsx's doc
   comment reserve exit animations for: every `<Toast>` is a genuinely
   ephemeral node, mounted and unmounted once each, never a persistent
   container something re-renders into (HANDOFF §6.1).
   ============================================================ */

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div
      className="toast-host fixed right-4 bottom-4 z-[90] flex flex-col items-end gap-2"
      style={{ pointerEvents: 'none' }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <Toast key={t.id} id={t.id} msg={t.msg} type={t.type} />
        ))}
      </AnimatePresence>
    </div>
  )
}
