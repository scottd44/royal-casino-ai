/* ============================================================
   setNativeValue — the React controlled-input shim.

   WHY THIS EXISTS
   ---------------
   js/agent/agent-ui.js drives the app the way a person does: it writes
   values into form fields and clicks buttons. Three of those writes are
   raw DOM assignments:

     agent-ui.js:296  applyBet()     input.value = v            #betInput
     agent-ui.js:650  dice adapter   slider.value = target      #slider
     agent-ui.js:678  mines adapter  select.value = String(n)   #mineSelect

   React installs a *value tracker* on every controlled form element:
   Object.defineProperty(node, "value", ...) on the INSTANCE, shadowing the
   prototype accessor. A plain `el.value = x` therefore runs the tracker's
   setter, which updates the tracker's cached value as a side effect. When
   the event is then dispatched, React compares tracker-vs-current, sees no
   difference, and DISCARDS the change.

   Nothing throws. The bet input visually shows the new number for one frame,
   React re-renders it back to state, and the round runs at the stale stake.
   Telemetry looks perfect and the figures are wrong.

   The fix is to call the setter from the PROTOTYPE, bypassing the instance
   descriptor so the tracker's cache stays stale, then dispatch the event
   React is actually listening for.

   MEASURED, NOT ASSUMED (tests/shim.spec.ts, React 19.2):

     #betInput  raw write + "input"  -> SWALLOWED by the tracker
     #slider    raw write + "input"  -> SWALLOWED by the tracker
     #mineSelect  raw write, no event -> never reaches React

   The <select> case fails for a DIFFERENT reason than the other two. React
   installs its value tracker on input/textarea only, so a select has nothing
   swallowing its event — a raw write plus a "change" event actually works.
   What breaks #mineSelect is that agent-ui.js:678 dispatches no event at all.

   So the select branch below needs the "change" event; the prototype setter
   is belt-and-braces there rather than strictly required. Both branches are
   kept uniform so no future caller has to remember which is which.

   HANDOFF-REACT-MIGRATION.md §2a covers input and textarea only and does not
   mention <select>. That gap is why the Mines mine-count would have silently
   stayed at its default.
   ============================================================ */

type ValueElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/** The prototype carrying the real `value` accessor, and the event React wants. */
function nativeValueSpec(el: ValueElement): { proto: object; eventType: 'input' | 'change' } {
  if (el instanceof HTMLTextAreaElement) {
    return { proto: HTMLTextAreaElement.prototype, eventType: 'input' }
  }
  if (el instanceof HTMLSelectElement) {
    return { proto: HTMLSelectElement.prototype, eventType: 'change' }
  }
  return { proto: HTMLInputElement.prototype, eventType: 'input' }
}

/**
 * Write `value` into a form element so that React observes the change.
 *
 * Works on controlled and uncontrolled elements alike, so it is always safe
 * to route an agent-driven write through this instead of assigning `.value`.
 *
 * @returns true if the write was applied.
 */
export function setNativeValue(el: ValueElement | null | undefined, value: string | number): boolean {
  if (!el) return false

  const next = String(value)
  const { proto, eventType } = nativeValueSpec(el)
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

  if (setter) {
    setter.call(el, next)
  } else {
    // No prototype accessor (non-browser DOM shim). Fall back to the plain
    // write — worse than nothing is not an option, and uncontrolled fields
    // still work.
    el.value = next
  }

  el.dispatchEvent(new Event(eventType, { bubbles: true }))

  // A <select> that React re-renders from state settles on "change"; a range
  // input's committed value is read on "change" by some listeners too. Firing
  // the companion event is a no-op for React (the tracker is now current) but
  // covers any plain listener wired to the other one.
  if (eventType === 'input') {
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return true
}

/** Convenience: resolve a selector, then write through the shim. */
export function setNativeValueBySelector(selector: string, value: string | number): boolean {
  return setNativeValue(document.querySelector<HTMLInputElement>(selector), value)
}
