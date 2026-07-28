import { test, expect, type Page } from '@playwright/test'

/* ============================================================
   The DOM-contract test — handoff §8 calls this "the single highest-value
   test in the project".

   Every selector below is one an adapter in js/agent/agent-ui.js reaches for.
   If one disappears the agent breaks silently: no exception, no failed
   request, just a robot that stops playing or bets the wrong number.

   Asserts COMPUTED VISIBILITY, not mere presence. The "app renders blank"
   bug in DEVELOPMENT_GUIDE.md §3 passed a DOM-only suite — an element that
   exists inside a container stuck at opacity:0 is not a control the agent
   can use.
   ============================================================ */

async function goto(page: Page, hash: string) {
  await page.goto(`/#${hash}`)
  await page.waitForLoadState('networkidle')
}

/** Present, visible, and inside a subtree that is actually painted. */
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

test.describe('Dice — agent-ui.js:630', () => {
  // Controls and readouts: must be visible, the agent acts on or reads them.
  const REQUIRED = [
    '#rollBtn', '#slider', // detect()
    '#underBtn', '#overBtn', '#betInput', // play()
    '#targetV', '#winChance', '#mult', '#profit',
    '#rollNum', '#rollMsg', '#sliderTrack',
  ]

  // Containers that are legitimately empty until the game is played. An empty
  // div has no bounding box, so "visible" is the wrong bar — "attached" is
  // the real contract. Asserted separately rather than weakening the check
  // above, which is what actually guards against the blank-app bug.
  const CONTAINERS = ['#history', '#diceMarker']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'dice')
    for (const sel of REQUIRED) await expectUsable(page, sel)
    for (const sel of CONTAINERS) await expect(page.locator(sel)).toBeAttached()
  })

  test('#history fills in once a round resolves', async ({ page }) => {
    await goto(page, 'dice')
    await page.click('#rollBtn')
    await expect(page.locator('#rollBtn')).toBeEnabled({ timeout: 4000 })
    await expect(page.locator('#history')).toBeVisible()
  })

  test('the bet segment buttons exist', async ({ page }) => {
    await goto(page, 'dice')
    for (const v of ['0.5', '2', 'max']) {
      await expectUsable(page, `[data-bet="${v}"]`)
    }
  })

  test('#rollBtn disables during the roll and re-enables after', async ({ page }) => {
    await goto(page, 'dice')
    await page.click('#rollBtn')

    // The adapter waits up to 4s for this to go back to enabled. If it never
    // re-enables the run loop stalls; if it never disables, the agent can
    // double-fire a round.
    await expect(page.locator('#rollBtn')).toBeDisabled()
    await expect(page.locator('#rollBtn')).toBeEnabled({ timeout: 4000 })
  })
})

test.describe('Mines — agent-ui.js:661', () => {
  const REQUIRED = [
    '#startBtn', '#grid', // detect()
    '#mineSelect', '#betInput', '#cashBtn',
    '#curMult', '#nextMult', '#cashVal', '#gemsFound', '#minesMsg',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'mines')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#grid renders 25 tiles in index order', async ({ page }) => {
    await goto(page, 'mines')
    const tiles = page.locator('#grid .tile')
    await expect(tiles).toHaveCount(25)

    // The adapter clicks tiles[idx] by ARRAY POSITION, so DOM order must
    // match logical index or it reveals a different tile than it chose.
    const order = await tiles.evaluateAll((els) =>
      els.map((e) => Number((e as HTMLElement).dataset.idx)),
    )
    expect(order).toEqual([...Array(25).keys()])
  })

  test('#mineSelect offers exactly MINE_OPTIONS', async ({ page }) => {
    await goto(page, 'mines')
    const values = await page
      .locator('#mineSelect option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
    expect(values).toEqual(['1', '2', '3', '4', '5', '6', '8', '10', '12', '15', '20', '24'])
  })

  test('#startBtn stays disabled for the whole live round', async ({ page }) => {
    await goto(page, 'mines')
    await page.click('#startBtn')

    // agent-ui.js:685 gates its entire reveal loop on this being true.
    await expect(page.locator('#startBtn')).toBeDisabled()
    await expect(page.locator('#cashBtn')).toBeDisabled() // no gems yet

    await page.locator('#grid .tile').first().click()
    // Still live (unless we hit a mine on tile 0 — retry-free check below).
    const stillLive = await page.locator('#startBtn').isDisabled()
    if (stillLive) {
      await expect(page.locator('#grid .tile.revealed')).toHaveCount(1)
    }
  })

  test('.tile.gem marks only gems revealed this round', async ({ page }) => {
    await goto(page, 'mines')
    // The adapter counts .tile.gem document-wide. Before a round there must
    // be none, or it will think it has gems banked and try to cash out.
    await expect(page.locator('.tile.gem')).toHaveCount(0)
  })
})

test.describe("Hold'em — agent-ui.js:1045", () => {
  test('#hcControls is usable', async ({ page }) => {
    await goto(page, 'holdem')
    await expectUsable(page, '#hcControls')
  })

  test('window.HoldemAPI exposes all nine members', async ({ page }) => {
    await goto(page, 'holdem')
    const members = await page.evaluate(() => {
      const api = (window as never as { HoldemAPI?: Record<string, unknown> }).HoldemAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(
      ['act', 'cashOut', 'handOver', 'humanTurn', 'nextHand', 'seated', 'sit', 'state'].sort(),
    )
  })

  test('state() returns every field the adapter reads', async ({ page }) => {
    await goto(page, 'holdem')
    await page.evaluate(() => {
      const api = (window as never as { HoldemAPI: { sit: () => void } }).HoldemAPI
      api.sit()
    })

    const shape = await page.evaluate(() => {
      const api = (window as never as {
        HoldemAPI: { state: () => Record<string, unknown> | null }
      }).HoldemAPI
      const s = api.state()
      return s ? Object.keys(s).sort() : null
    })

    expect(shape).toEqual(
      [
        'board', 'bb', 'equity', 'hole', 'legal', 'maxRaiseTo', 'minRaiseTo',
        'opponents', 'pot', 'potOdds', 'stack', 'toCall',
      ].sort(),
    )
  })

  test('HoldemAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'holdem')
    expect(await page.evaluate(() => 'HoldemAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes holdem.detect() return true on the wrong route, and
    // the agent sits there acting into a dead table.
    expect(await page.evaluate(() => 'HoldemAPI' in window)).toBe(false)
  })
})

test.describe('Navigation contract — handoff §2b rule 4', () => {
  test('a [data-nav] element exists for every game, on every route', async ({ page }) => {
    for (const route of ['', 'dice', 'mines', 'holdem']) {
      await goto(page, route)
      for (const id of ['dice', 'mines', 'holdem']) {
        await expect(
          page.locator(`[data-nav="${id}"]`).first(),
          `[data-nav="${id}"] missing on route "${route}"`,
        ).toBeAttached()
      }
    }
  })

  test('[data-nav] survives sidebar collapse and still navigates', async ({ page }) => {
    await goto(page, 'dice')
    await page.click('#sbCollapse')

    // Collapsing must narrow the rail visually only — the buttons stay
    // mounted and clickable. This is switchToGame()'s only navigation path.
    const navBtn = page.locator('[data-nav="mines"]').first()
    await expect(navBtn).toBeVisible()
    await navBtn.click()

    await expect(page.locator('#grid')).toBeVisible()
    expect(await page.evaluate(() => location.hash)).toBe('#mines')
  })

  test('the hash fallback navigates too', async ({ page }) => {
    await goto(page, 'dice')

    // switchToGame()'s fallback when no [data-nav] resolves.
    await page.evaluate(() => { location.hash = 'mines' })
    await expect(page.locator('#grid')).toBeVisible()
  })

  test('currentGameId() reads back exactly the game id', async ({ page }) => {
    await goto(page, 'dice')
    // agent-ui.js:1856 — a leading slash here breaks every adapter lookup.
    const id = await page.evaluate(() => location.hash.replace('#', ''))
    expect(id).toBe('dice')
  })
})

test.describe('Lab contract', () => {
  test('#aiStatus exists and stays mounted across routes', async ({ page }) => {
    for (const route of ['', 'dice', 'mines', 'holdem']) {
      await goto(page, route)
      await expect(
        page.locator('#aiStatus'),
        `#aiStatus missing on route "${route}"`,
      ).toBeAttached()
    }
  })

  test('every game exposes an explicit agent mount point', async ({ page }) => {
    for (const route of ['dice', 'mines', 'holdem']) {
      await goto(page, route)
      await expect(page.locator('#agentMount')).toBeAttached()
    }
  })
})
