import { test, expect, type Page } from '@playwright/test'

/* ============================================================
   The motion-safety suite — PHASE_1_MOTION_ICONS_PLAN.md §0 and §12.

   These tests exist to fail the day someone writes
   `onAnimationComplete={() => setPhase('idle')}`.

   The threat model is specific and has shipped before: Framer Motion, GSAP
   and CountUp all tick on requestAnimationFrame, and rAF is FULLY SUSPENDED
   in a backgrounded tab. js/agent/agent-ui.js:262-270 polls raw DOM every
   60ms for 4-20s. So any state transition that waits on an animation
   callback simply never happens for the agent, and the round dies of a
   timeout with no error anywhere.

   Rather than trying to background a tab (which Playwright can't do
   faithfully), these stub rAF into a no-op before the app boots. That is a
   strictly harsher environment than a background tab: every rAF-driven
   tween is dead on arrival, permanently. Track A (state, disabled flags,
   contract textContent) must still work perfectly.
   ============================================================ */

/** Kill requestAnimationFrame before any app code runs. */
async function killRaf(page: Page) {
  await page.addInitScript(() => {
    // Returning 0 and never invoking the callback is exactly what a
    // suspended background tab looks like to a tween library.
    window.requestAnimationFrame = () => 0
    window.cancelAnimationFrame = () => {}
  })
}

async function goto(page: Page, hash: string) {
  await page.goto(`/#${hash}`)
  await page.waitForLoadState('networkidle')
}

/** Present, visible, and inside a subtree that is actually painted. Shared
    with dom-contract.spec.ts: "the element exists" is worthless under a dead
    rAF — an entrance that hid its target and never ran leaves a node that is
    present and invisible. */
async function expectUsable(page: Page, selector: string) {
  const el = page.locator(selector)
  await expect(el, `${selector} should exist`).toHaveCount(1)
  await expect(el, `${selector} should be visible`).toBeVisible()

  const painted = await el.evaluate((node) => {
    let cur: Element | null = node
    while (cur) {
      const cs = getComputedStyle(cur)
      if (cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none') return false
      cur = cur.parentElement
    }
    return true
  })
  expect(painted, `${selector} should not sit in a transparent/hidden subtree`).toBe(true)
}

test.describe('Track A survives a dead requestAnimationFrame', () => {
  test.beforeEach(async ({ page }) => {
    await killRaf(page)
  })

  test('Dice: a full round resolves and #rollBtn re-enables', async ({ page }) => {
    await goto(page, 'dice')
    await expectUsable(page, '#rollBtn')

    await page.click('#rollBtn')

    // agent-ui.js:657 waits up to 4s for exactly this. If a stalled entrance
    // or result animation gates the phase transition, this is where it dies.
    await expect(page.locator('#rollBtn')).toBeEnabled({ timeout: 4000 })

    // And the readouts the adapter parses must hold real numbers, not the
    // blank/zero state an unfired tween would leave behind.
    const rollNum = await page.locator('#rollNum').textContent()
    expect(Number.parseFloat(rollNum ?? '')).not.toBeNaN()
  })

  test('Mines: the grid is usable and a round starts', async ({ page }) => {
    await goto(page, 'mines')
    await expectUsable(page, '#grid')
    await expect(page.locator('#grid .tile')).toHaveCount(25)

    await page.click('#startBtn')
    await expect(page.locator('#startBtn')).toBeDisabled()

    // The tiles must be clickable immediately — not after an entrance
    // cascade that will never run here. Two legitimate outcomes: a safe
    // tile reveals just itself (1), a mine reveals the whole board on loss
    // (25) — this test asserts the click produced SOME immediate response
    // under a dead rAF, not which of Mines' own RNG outcomes landed.
    await page.locator('#grid .tile').first().click()
    const revealed = page.locator('#grid .tile.revealed')
    await expect(async () => {
      const n = await revealed.count()
      expect(n === 1 || n === 25, `expected 1 (safe) or 25 (mine) revealed tiles, got ${n}`).toBe(true)
    }).toPass({ timeout: 10000 })
  })

  test('every contract readout is parseable after a round', async ({ page }) => {
    await goto(page, 'mines')
    await page.click('#startBtn')

    // These four are read with parseFloat by the mines adapter. A mid-tween
    // or unfired-tween value here is the silent-failure class this whole
    // phase exists to prevent.
    for (const id of ['#curMult', '#nextMult', '#cashVal']) {
      const raw = await page.locator(id).textContent()
      const n = Number.parseFloat((raw ?? '').replace(/[^0-9.-]/g, ''))
      expect(n, `${id} should parse as a number, got ${JSON.stringify(raw)}`).not.toBeNaN()
    }
  })

  test('no watchdog is left pending once the app settles', async ({ page }) => {
    await goto(page, 'dice')
    await page.click('#rollBtn')
    await expect(page.locator('#rollBtn')).toBeEnabled({ timeout: 4000 })

    // Every armed watchdog must have fired and drained itself. A permanently
    // pending entry means something armed a watchdog and the grace period
    // never elapsed — i.e. content could still be stuck invisible.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as { __royalMotion?: { pending: () => number } }
            return w.__royalMotion?.pending() ?? 0
          }),
        { timeout: 5000 },
      )
      .toBe(0)
  })
})

test.describe('Reduced motion', () => {
  /* NOTE: `test.use({ reducedMotion: 'reduce' })` does NOT take effect under
     this repo's playwright.config.ts — the project-level `use` block wins and
     matchMedia still reports false, so the emulation silently does nothing and
     the tests below would pass while proving nothing. page.emulateMedia() is
     applied per-page and verifiably works. */
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('Dice plays a full round with motion disabled', async ({ page }) => {
    await goto(page, 'dice')
    await page.click('#rollBtn')
    await expect(page.locator('#rollBtn')).toBeEnabled({ timeout: 4000 })
    await expectUsable(page, '#rollNum')
  })

  test('the motion policy itself reports instant', async ({ page }) => {
    await goto(page, 'dice')

    // Assert the POLICY, not the raw media query: motionPolicy() folds in
    // document.hidden and the user override as well, so checking matchMedia
    // alone would still pass if reducedMotion.ts ignored the OS setting.
    const policy = await page.evaluate(() => {
      const w = window as unknown as { __royalMotion?: { policy?: () => string } }
      return w.__royalMotion?.policy?.() ?? null
    })
    expect(policy).toBe('instant')
  })

  test('the policy reports full when nothing asks for reduced motion', async ({ page }) => {
    // The negative case — proves the assertion above is actually sensitive
    // to the setting rather than hard-wired to 'instant'.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await goto(page, 'dice')

    const policy = await page.evaluate(() => {
      const w = window as unknown as { __royalMotion?: { policy?: () => string } }
      return w.__royalMotion?.policy?.() ?? null
    })
    expect(policy).toBe('full')
  })
})

test.describe('Contract numbers never tween', () => {
  test('#curMult only ever holds values the game actually held', async ({ page }) => {
    await goto(page, 'mines')
    await page.click('#startBtn')

    /* Sample faster than any plausible tween while revealing tiles. Every
       observed value must be a legal multiplier for the number of gems
       found so far — an interpolated frame (e.g. 1.0374 between 1.00 and
       1.08) would prove a count-up is running on a contract node, which is
       precisely what makes the agent cash out at a multiplier that never
       existed. */
    const samples = await page.evaluate(async () => {
      const seen: string[] = []
      const read = () => {
        const t = document.getElementById('curMult')?.textContent ?? ''
        if (seen[seen.length - 1] !== t) seen.push(t)
      }
      const tiles = Array.from(document.querySelectorAll<HTMLElement>('#grid .tile'))
      const poll = setInterval(read, 15)
      read()
      for (const tile of tiles.slice(0, 4)) {
        tile.click()
        await new Promise((r) => setTimeout(r, 220))
      }
      clearInterval(poll)
      return seen
    })

    // Distinct values should be few and discrete — one per reveal, not the
    // dozens of intermediate frames a tween would produce.
    expect(samples.length, `saw ${samples.length} distinct #curMult values: ${samples.join(', ')}`)
      .toBeLessThanOrEqual(8)

    for (const s of samples) {
      const n = Number.parseFloat(s.replace(/[^0-9.]/g, ''))
      expect(n, `#curMult held an unparseable value: ${JSON.stringify(s)}`).not.toBeNaN()
      // Multipliers are quoted to 2dp everywhere in this codebase. A tween's
      // raw onUpdate value would carry more precision than the game ever set.
      const decimals = (s.split('.')[1] ?? '').replace(/[^0-9]/g, '').length
      expect(decimals, `#curMult value ${JSON.stringify(s)} has tween-grade precision`)
        .toBeLessThanOrEqual(2)
    }
  })
})
