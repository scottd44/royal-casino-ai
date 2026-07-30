import { test, expect } from '@playwright/test'

/* Probe, not a contract test: does re-writing the SAME value through the
   prototype setter resurrect a swallowed change? If it does, a capture-phase
   normalisation in legacyBridge is viable. If not, uncontrolled fields read
   straight from the DOM are the only sound mechanism. */
test('re-dispatching the same value does not resurrect a swallowed change', async ({ page }) => {
  await page.goto('/#__shim')
  await page.waitForSelector('#ctlRange')

  const result = await page.evaluate(async () => {
    const el = document.querySelector('#ctlRange') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

    // 1. the agent's raw write — goes through React's tracker, gets swallowed
    el.value = '88'
    el.dispatchEvent(new Event('input', { bubbles: true }))
    const afterNaive = document.querySelector('#ctlRangeState')!.getAttribute('data-state')

    // 2. the proposed fix: same value, prototype setter, re-dispatch
    setter.call(el, '88')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    const afterResync = document.querySelector('#ctlRangeState')!.getAttribute('data-state')

    return { afterNaive, afterResync }
  })

  expect(result.afterNaive).toBe('50') // swallowed, as established
  // If this is '50' the re-sync is a no-op and the idea is dead.
  console.log('after re-sync attempt:', result.afterResync)
  expect(result.afterResync).toBe('50')
})
