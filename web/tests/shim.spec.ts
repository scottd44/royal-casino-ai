import { test, expect, type Page } from '@playwright/test'

/* ============================================================
   The single highest-risk item in the migration.

   Each field on /#__shim is a REAL React controlled component, and the
   assertions read `data-state`, which is rendered from React state — not
   from the DOM node. So a passing assertion means React accepted the
   change, not merely that the input looked right for a frame.

   Part 1 proves the trap is real under this exact React version.
   Part 2 proves setNativeValue defeats it.
   ============================================================ */

const SHIM_SRC = '/src/platform/dom/setNativeValue.ts'

async function gotoShim(page: Page) {
  await page.goto('/#__shim')
  await page.waitForSelector('#ctlNumber')
}

/** The naive write agent-ui.js does today: raw .value, then the event. */
async function naiveWrite(page: Page, selector: string, value: string, eventType: string) {
  await page.evaluate(
    ([sel, val, evt]) => {
      const el = document.querySelector(sel) as HTMLInputElement
      el.value = val
      el.dispatchEvent(new Event(evt, { bubbles: true }))
    },
    [selector, value, eventType] as const,
  )
}

/** The same write routed through the shim. */
async function shimWrite(page: Page, selector: string, value: string) {
  await page.evaluate(
    async ([sel, val, src]) => {
      const { setNativeValue } = await import(/* @vite-ignore */ src)
      setNativeValue(document.querySelector(sel), val)
    },
    [selector, value, SHIM_SRC] as const,
  )
}

const state = (page: Page, id: string) =>
  page.locator(`#${id}`).getAttribute('data-state')

test.describe('Part 1 — the trap is real', () => {
  test('raw .value + input event does NOT reach React state (number)', async ({ page }) => {
    await gotoShim(page)
    expect(await state(page, 'ctlNumberState')).toBe('20')

    await naiveWrite(page, '#ctlNumber', '777', 'input')

    // React's value tracker swallowed it. This is the silent-failure trap:
    // every AI bet would use the stale stake and nothing would throw.
    expect(await state(page, 'ctlNumberState')).toBe('20')
  })

  test('raw .value + input event does NOT reach React state (range)', async ({ page }) => {
    await gotoShim(page)
    expect(await state(page, 'ctlRangeState')).toBe('50')

    // This is verbatim what agent-ui.js:650-651 does for the Dice target.
    await naiveWrite(page, '#ctlRange', '88', 'input')

    expect(await state(page, 'ctlRangeState')).toBe('50')
  })

  test('raw .value with NO event does NOT reach React state (select)', async ({ page }) => {
    await gotoShim(page)
    expect(await state(page, 'ctlSelectState')).toBe('3')

    // This is verbatim agent-ui.js:678 — a bare assignment, no event at all.
    await page.evaluate(() => {
      const el = document.querySelector('#ctlSelect') as HTMLSelectElement
      el.value = '12'
    })

    // React never hears about it. The mine count silently stays at the default.
    expect(await state(page, 'ctlSelectState')).toBe('3')
  })

  test('MEASURED: a select DOES accept a raw write once the change event fires', async ({
    page,
  }) => {
    await gotoShim(page)

    await naiveWrite(page, '#ctlSelect', '12', 'change')

    // Deliberately pinned. React installs its value tracker on input/textarea
    // only, so there is nothing to swallow a select's change event — unlike
    // the number and range cases above, which DO get swallowed.
    //
    // This is why the shim's select branch dispatches "change" rather than
    // "input": the event, not the prototype setter, is what a select needs.
    // Do not "simplify" that branch to match the input branch.
    expect(await state(page, 'ctlSelectState')).toBe('12')
  })
})

test.describe('Part 2 — setNativeValue defeats it', () => {
  test('number input reaches React state', async ({ page }) => {
    await gotoShim(page)
    await shimWrite(page, '#ctlNumber', '777')
    expect(await state(page, 'ctlNumberState')).toBe('777')
    await expect(page.locator('#ctlNumber')).toHaveValue('777')
  })

  test('range input reaches React state', async ({ page }) => {
    await gotoShim(page)
    await shimWrite(page, '#ctlRange', '88')
    expect(await state(page, 'ctlRangeState')).toBe('88')
    await expect(page.locator('#ctlRange')).toHaveValue('88')
  })

  test('select reaches React state', async ({ page }) => {
    await gotoShim(page)
    await shimWrite(page, '#ctlSelect', '12')
    expect(await state(page, 'ctlSelectState')).toBe('12')
    await expect(page.locator('#ctlSelect')).toHaveValue('12')
  })

  test('a second write to the same element also lands', async ({ page }) => {
    await gotoShim(page)
    await shimWrite(page, '#ctlNumber', '333')
    expect(await state(page, 'ctlNumberState')).toBe('333')
    // Repeat writes matter: the agent sets a fresh stake every single round.
    await shimWrite(page, '#ctlNumber', '444')
    expect(await state(page, 'ctlNumberState')).toBe('444')
  })
})
