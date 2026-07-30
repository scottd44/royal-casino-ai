import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { fadeIn, scaleIn } from '@/platform/motion'
import { cn } from './cn'

/* ============================================================
   Modal — the deferred primitive from Phase 1, given a real call site now
   (`LabReportModal`, built by a parallel agent — this file stays generic,
   it must not know what a "session report" is).

   PHASE_2_AGENT_PLAN.md §4: composable `Modal` / `ModalHeader` / `ModalBody`,
   closes on backdrop click and Escape, focus-trapped, portalled so
   `.app-main`'s `overflow-y: auto` (index.css) can never clip it.

   AnimatePresence is safe here for the exact reason Reveal.tsx's doc
   comment draws the line at: this component renders a genuinely EPHEMERAL
   node — it mounts when `open` flips true and fully unmounts when the exit
   animation finishes, never a persistent container something else renders
   into repeatedly (HANDOFF §6.1). Contrast with `#view`/a game root, which
   must never be wrapped this way.
   ============================================================ */

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** Threaded to `aria-labelledby` on the dialog node; pass the id of your `ModalHeader`'s title. */
  labelledBy?: string
  className?: string
  children?: ReactNode
}

/**
 * `<Modal open={open} onClose={close} labelledBy="report-title"><ModalHeader>...</ModalHeader><ModalBody>...</ModalBody></Modal>`
 *
 * Only the outer shell mounts/unmounts with `open` — everything else (focus
 * trap, portal, backdrop) lives in `ModalContent` so `AnimatePresence` has a
 * single child whose presence it can track across the `open` flip.
 */
export function Modal({ open, onClose, labelledBy, className, children }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <ModalContent onClose={onClose} labelledBy={labelledBy} className={className}>
          {children}
        </ModalContent>
      )}
    </AnimatePresence>
  )
}

/** Elements a focus trap is allowed to land on. Same allowlist every
 *  hand-rolled trap uses; `[tabindex="-1"]` is deliberately excluded — it's
 *  how the dialog container itself opts OUT of the tab order while still
 *  being a valid programmatic-focus target on open. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // offsetParent is null for display:none / not-yet-laid-out nodes — cheap
    // "is this actually visible" check without a ResizeObserver.
    (el) => el.offsetParent !== null,
  )
}

interface ModalContentProps {
  onClose: () => void
  labelledBy?: string
  className?: string
  children?: ReactNode
}

function ModalContent({ onClose, labelledBy, className, children }: ModalContentProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Focus in on mount, focus back out on unmount — plan §4 "focus-trapped."
  // Runs once per mount/unmount cycle of THIS component, which — thanks to
  // AnimatePresence — is once per full open/close cycle of the modal, not
  // once per render.
  useEffect(() => {
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const node = dialogRef.current
    const focusable = node ? getFocusable(node) : []
    ;(focusable[0] ?? node)?.focus()

    return () => {
      previouslyFocused.current?.focus()
    }
  }, [])

  // Escape closes; Tab/Shift+Tab cycle within the dialog. Plain DOM listener
  // per plan §4 — Radix isn't installed and this doesn't warrant adding it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const node = dialogRef.current
      if (!node) return
      const focusable = getFocusable(node)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !node.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <motion.div
      className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 7, 12, 0.72)' }}
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={fadeIn()}
      // Only a direct click ON the backdrop closes — a click that starts/ends
      // inside the card and merely bubbles up must not (e.target stays the
      // inner element it originated on, e.currentTarget is always this node).
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        // -1: a valid `.focus()` target that never joins the natural tab
        // order itself — Tab should land on the dialog's OWN controls first.
        tabIndex={-1}
        className={cn(
          'modal-card glass w-full max-w-[520px] max-h-[85vh] overflow-y-auto rounded-[var(--radius-card-lg)] outline-none',
          className,
        )}
        style={{ boxShadow: 'var(--lift-3)' }}
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={scaleIn()}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  )
}

export function ModalHeader({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <header
      className={cn('modal-header flex items-center justify-between gap-4 border-b px-5 py-4', className)}
      style={{ borderColor: 'var(--glass-line)' }}
    >
      {children}
    </header>
  )
}

export function ModalBody({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cn('modal-body px-5 py-4', className)}>{children}</div>
}
