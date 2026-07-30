import { useRef, type RefObject } from 'react'
import { useWalletStore } from '@/platform/money/walletStore'

/* ============================================================
   THE UNCONTROLLED DECISION — decided once, applied everywhere.

   #betInput is UNCONTROLLED: defaultValue + ref, with the store updated on
   change. It is not `value={bet}`.

   Why: js/agent/agent-ui.js:296 writes this field with a raw `.value =`.
   Against a controlled input React's value tracker swallows that write and
   the round silently runs at the stale stake (proved in tests/shim.spec.ts).
   An uncontrolled input has no tracker to fight, so the agent's write lands
   even if someone forgets the shim.

   setNativeValue is STILL the required way to write this field
   programmatically — see platform/dom/setNativeValue.ts. Uncontrolled is the
   belt; the shim is the braces. Phase 3 adds 22 more games and both need to
   survive that.

   Emits the exact contract markup: #betInput plus [data-bet] for ½ / 2× / Max.
   ============================================================ */

export function useBetRef() {
  return useRef<HTMLInputElement>(null)
}

/** Read the live stake. The DOM node is the source of truth for an
 *  uncontrolled field, so this can never race a pending React flush —
 *  which matters because the agent does applyBet() then .click() back to back. */
export function readBet(ref: RefObject<HTMLInputElement | null>): number {
  const v = Math.floor(Number(ref.current?.value))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export default function BetField({
  inputRef,
  defaultValue = 20,
  label = 'Bet amount',
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  defaultValue?: number
  label?: string
  onChange?: (v: number) => void
}) {
  const setBet = useWalletStore((s) => s.setBet)

  const sync = (raw: string) => {
    const v = Math.floor(Number(raw)) || 0
    setBet(v)
    onChange?.(v)
  }

  const applySeg = (mode: string) => {
    const input = inputRef.current
    if (!input || input.disabled) return
    const balance = useWalletStore.getState().balance
    const cur = Number(input.value) || 0
    const v = mode === 'max' ? balance : Math.max(1, Math.floor(cur * Number(mode)))
    input.value = String(v)
    sync(String(v))
  }

  return (
    <div className="field mb-4">
      <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</label>
      <div
        className="bet-group flex items-center gap-2 rounded-[10px] border px-3 py-2"
        style={{ borderColor: 'var(--glass-line)', background: 'var(--glass)' }}
      >
        <span className="bet-prefix text-muted">$</span>
        <input
          ref={inputRef}
          id="betInput"
          className="bet-input num flex-1 min-w-0 bg-transparent outline-none text-text"
          type="number"
          min="1"
          defaultValue={defaultValue}
          onChange={(e) => sync(e.target.value)}
        />
        <div className="bet-seg flex gap-1 shrink-0">
          {[
            ['0.5', '½'],
            ['2', '2×'],
            ['max', 'Max'],
          ].map(([mode, glyph]) => (
            <button
              key={mode}
              type="button"
              data-bet={mode}
              onClick={() => applySeg(mode)}
              className="px-2 py-1 text-xs rounded-md text-muted hover:text-text hover:bg-white/10 transition-colors"
            >
              {glyph}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
