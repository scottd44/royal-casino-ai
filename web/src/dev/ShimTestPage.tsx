import { useState } from 'react'

/* ============================================================
   Dev-only harness for the setNativeValue shim.

   Every field here is deliberately CONTROLLED (value + onChange), which is
   the configuration that breaks under a raw `.value =` write. The rendered
   `data-state` readouts come from React state, NOT from the DOM node — so a
   test asserting on them is asserting that React actually accepted the
   change, not merely that the input looks right for one frame.

   tests/shim.spec.ts drives this page twice: once with a naive write (must
   FAIL to update state) and once through the shim (must update state).
   ============================================================ */
export default function ShimTestPage() {
  const [num, setNum] = useState('20')
  const [range, setRange] = useState('50')
  const [sel, setSel] = useState('3')

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-ui)' }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>setNativeValue harness</h1>

      <label style={{ display: 'block', marginBottom: 12 }}>
        number (mirrors #betInput)
        <input
          id="ctlNumber"
          type="number"
          value={num}
          onChange={(e) => setNum(e.target.value)}
        />
        <output id="ctlNumberState" data-state={num}>
          {num}
        </output>
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        range (mirrors #slider)
        <input
          id="ctlRange"
          type="range"
          min="2"
          max="98"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        />
        <output id="ctlRangeState" data-state={range}>
          {range}
        </output>
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        select (mirrors #mineSelect)
        <select id="ctlSelect" value={sel} onChange={(e) => setSel(e.target.value)}>
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
        <output id="ctlSelectState" data-state={sel}>
          {sel}
        </output>
      </label>
    </div>
  )
}
