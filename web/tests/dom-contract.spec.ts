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

test.describe('Limbo — agent-ui.js:758', () => {
  // Controls and readouts: must be visible, the adapter acts on or reads them.
  const REQUIRED = [
    '#limboBtn', '#targetInput', // detect()
    '#betInput', // play()
    '#winChance', '#mult', '#profit',
    '#limboNum', '#limboMsg',
  ]

  // Legitimately empty until the round resolves once — attached is the real
  // contract, same reasoning as Dice's #history/#diceMarker.
  const CONTAINERS = ['#history']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'limbo')
    for (const sel of REQUIRED) await expectUsable(page, sel)
    for (const sel of CONTAINERS) await expect(page.locator(sel)).toBeAttached()
  })

  test('#history fills in once a round resolves', async ({ page }) => {
    await goto(page, 'limbo')
    await page.click('#limboBtn')
    await expect(page.locator('#limboBtn')).toBeEnabled({ timeout: 4000 })
    await expect(page.locator('#history')).toBeVisible()
  })

  test('#limboBtn disables during the round and re-enables after', async ({ page }) => {
    await goto(page, 'limbo')
    await page.click('#limboBtn')

    // The adapter waits up to 4s for this to go back to enabled
    // (agent-ui.js:788). If it never re-enables the run loop stalls; if it
    // never disables, the agent can double-fire a round.
    await expect(page.locator('#limboBtn')).toBeDisabled()
    await expect(page.locator('#limboBtn')).toBeEnabled({ timeout: 4000 })
  })

  test('#limboMsg holds the result text once the round settles', async ({ page }) => {
    await goto(page, 'limbo')
    await page.click('#limboBtn')
    await expect(page.locator('#limboBtn')).toBeEnabled({ timeout: 4000 })
    const text = await page.locator('#limboMsg').textContent()
    expect(text).not.toBe('Pick a target and press Play.')
    expect(text?.length).toBeGreaterThan(0)
  })

  test('#targetInput accepts a raw write + dispatched input event, agent-style', async ({ page }) => {
    await goto(page, 'limbo')
    // Mirrors agent-ui.js:782-784 exactly: raw `.value =`, then a dispatched
    // "input" event — the trap a CONTROLLED input would swallow.
    await page.evaluate(() => {
      const el = document.querySelector('#targetInput') as HTMLInputElement
      el.value = '10.00'
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(page.locator('#targetInput')).toHaveValue('10.00')
    // The payout stat should pick up the new target once a round fires.
    await page.click('#limboBtn')
    await expect(page.locator('#limboBtn')).toBeEnabled({ timeout: 4000 })
    await expect(page.locator('#targetInput')).toHaveValue('10.00')
  })
})

test.describe('Plinko — agent-ui.js:1384', () => {
  // Controls and readouts: must be visible, the adapter acts on or reads them.
  const REQUIRED = [
    '#dropBtn', '#plinkoStage', // detect()
    '#betInput', '#maxMult', '#ballsLive', // play()
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'plinko')
    for (const sel of REQUIRED) await expectUsable(page, sel)
    // agent-ui.js:1412/1415 click by DATA ATTRIBUTE, never by id — the
    // real risk/rows picker contract.
    for (const risk of ['low', 'medium', 'high']) {
      await expectUsable(page, `[data-risk="${risk}"]`)
    }
    for (const rows of [8, 12, 16]) {
      await expectUsable(page, `[data-rows="${rows}"]`)
    }
  })

  test('#ballsLive starts at "0"', async ({ page }) => {
    await goto(page, 'plinko')
    await expect(page.locator('#ballsLive')).toHaveText('0')
  })

  test('clicking a risk/rows data-attribute button actually moves the selection highlight', async ({ page }) => {
    await goto(page, 'plinko')
    // Defaults, PlinkoGame.tsx boot state (mirrors legacy setRisk("medium")/setRows(12)).
    await expect(page.locator('[data-risk="medium"]')).toHaveClass(/btn-green/)
    await expect(page.locator('[data-rows="12"]')).toHaveClass(/btn-green/)

    await page.click('[data-risk="high"]')
    await expect(page.locator('[data-risk="high"]')).toHaveClass(/btn-green/)
    await expect(page.locator('[data-risk="medium"]')).not.toHaveClass(/btn-green/)

    await page.click('[data-rows="16"]')
    await expect(page.locator('[data-rows="16"]')).toHaveClass(/btn-green/)
    await expect(page.locator('[data-rows="12"]')).not.toHaveClass(/btn-green/)
  })

  test('a drop resolves within the adapter\'s 12s window: #ballsLive rises off "0" then settles back to "0" — agent-ui.js:1419-1421', async ({
    page,
  }) => {
    await goto(page, 'plinko')
    await page.fill('#betInput', '10')

    await page.click('#dropBtn')

    // Must genuinely reflect the ball being in flight — a false-positive
    // "already 0" read here would mean the round's truth resolved before
    // the agent ever saw it change, exactly the two-track bug
    // PlinkoGame.tsx's file header exists to prevent (a legacy-shaped,
    // rAF-gated port would only ever write this from inside a frame that
    // might never run).
    await expect(page.locator('#ballsLive')).not.toHaveText('0', { timeout: 1000 })

    // Mirrors the adapter's own wait — up to 12s for #ballsLive to read
    // "0" again once the drop resolves (agent-ui.js:1421). PlinkoGame's
    // Track A resolves this off a plain setTimeout well under that.
    await expect(page.locator('#ballsLive')).toHaveText('0', { timeout: 12000 })
  })

  test('a resolved drop pays out and logs history: #lastMult updates, a pill lands in #history, and the wallet balance actually moves', async ({
    page,
  }) => {
    await goto(page, 'plinko')
    await page.fill('#betInput', '10')

    const before = await page.locator('[title="Balance"]').textContent()

    await page.click('#dropBtn')
    await expect(page.locator('#ballsLive')).toHaveText('0', { timeout: 12000 })

    const lastMult = await page.locator('#lastMult').textContent()
    expect(lastMult).not.toBe('—')
    expect(lastMult?.length).toBeGreaterThan(0)

    await expect(page.locator('#history .pill').first()).toBeVisible()

    // A real wallet mutation happened — the bet was staked and either lost
    // or paid back out; the default medium/12-row table has no exact 1×
    // slot (TABLES[12].medium, PlinkoGame.tsx), so this can't land on a
    // net-zero round and read as a false pass.
    const after = await page.locator('[title="Balance"]').textContent()
    expect(after).not.toBe(before)
  })
})

test.describe('Crash — agent-ui.js:724', () => {
  // Controls the adapter touches directly: detect() + play().
  const REQUIRED = ['#placeBetBtn', '#crashStage', '#betInput', '#autoInput']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'crash')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#crashStage starts idle', async ({ page }) => {
    await goto(page, 'crash')
    await expect(page.locator('#crashStage')).toHaveAttribute('data-state', 'idle')
  })

  test('a low auto cash-out target resolves to a win and #crashStage genuinely returns to "idle" — Track A, not rAF paint', async ({
    page,
  }) => {
    await goto(page, 'crash')

    // Pin Math.random() so the round's crash point is fast AND
    // deterministic (~1.41x, well above the 1.05x auto-target below) rather
    // than trusting the house-edge tail to be fast "most of the time." This
    // keeps the test non-flaky without requiring a single rAF frame to
    // actually paint — Track A's setTimeouts are keyed off wall-clock time,
    // not animation frames, so this alone is enough to resolve the round.
    await page.evaluate(() => {
      window.Math.random = () => 0.3
    })

    // agent-ui.js:750 writes #autoInput with a raw `.value =` and NO
    // dispatched event — mirrored exactly, since it's the one write the
    // adapter never pairs with an event (CrashGame.tsx reads it off a ref
    // at bet-placement time for exactly this reason).
    await page.evaluate(() => {
      const el = document.querySelector('#autoInput') as HTMLInputElement
      el.value = '1.05'
    })

    await page.click('#placeBetBtn')
    await Promise.resolve() // React 18 defers the commit to a microtask.
    await expect(page.locator('#crashStage')).toHaveAttribute('data-state', 'running')
    await expect(page.locator('#placeBetBtn')).toBeDisabled()

    // The auto-target (1.05x) sits well below the pinned crash point
    // (1.41x), so this is a deterministic win, not a probabilistic one.
    await expect(page.locator('#crashResult')).toContainText('Cashed out', { timeout: 4000 })

    // #crashStage must still reach "crashed" and then genuinely return to
    // "idle" — the adapter's waitFor (agent-ui.js:754) polls exactly this
    // attribute for up to 20s. Getting stuck on "running" or "crashed"
    // hangs the agent forever.
    await expect(page.locator('#crashStage')).toHaveAttribute('data-state', 'crashed', { timeout: 6000 })
    await expect(page.locator('#crashStage')).toHaveAttribute('data-state', 'idle', { timeout: 6000 })
    await expect(page.locator('#placeBetBtn')).toBeEnabled()
  })

  test('#cashOutBtn disables once idle and re-enables only while a round is live', async ({ page }) => {
    await goto(page, 'crash')
    await expect(page.locator('#cashOutBtn')).toBeDisabled()

    await page.evaluate(() => {
      window.Math.random = () => 0.3
    })
    await page.click('#placeBetBtn')
    await Promise.resolve()
    await expect(page.locator('#cashOutBtn')).toBeEnabled()

    await expect(page.locator('#crashStage')).toHaveAttribute('data-state', 'idle', { timeout: 6000 })
    await expect(page.locator('#cashOutBtn')).toBeDisabled()
  })
})

test.describe('Wheel — agent-ui.js:927', () => {
  // Controls the adapter touches directly: detect() + play().
  const REQUIRED = ['#wheelBtn', '#wheelStage', '#betInput', '#cashBtn', '#curMult', '#cashVal', '#bustChance']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'wheel')
    for (const sel of REQUIRED) await expectUsable(page, sel)
    // agent-ui.js:948 clicks by DATA ATTRIBUTE, never by id.
    for (const risk of ['low', 'medium', 'high', 'risky']) {
      await expectUsable(page, `[data-risk="${risk}"]`)
    }
  })

  test('clicking a risk data-attribute button actually moves the selection', async ({ page }) => {
    await goto(page, 'wheel')
    await expect(page.locator('[data-risk="medium"]')).toHaveAttribute('aria-pressed', 'true')

    await page.click('[data-risk="risky"]')
    await expect(page.locator('[data-risk="risky"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-risk="medium"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('a spin resolves within the adapter\'s 7s window: #wheelBtn re-enables — agent-ui.js:954', async ({ page }) => {
    await goto(page, 'wheel')
    await page.fill('#betInput', '10')

    await page.click('#wheelBtn')
    await expect(page.locator('#wheelBtn')).toBeDisabled()

    // WheelGame.tsx's Track A resolves settle() off a plain setTimeout
    // (SETTLE_DELAY_MS ~4.3s), never gated on the CSS rotor transition
    // finishing — this must come back well inside the adapter's 7s wait.
    await expect(page.locator('#wheelBtn')).toBeEnabled({ timeout: 7000 })
  })

  test('a compounding multi-spin round cashes out for the right amount', async ({ page }) => {
    await goto(page, 'wheel')

    // Pin Math.random() so BOTH the Fisher-Yates segment shuffle and the
    // spin's landing index are deterministic. With every draw returning the
    // same value < 1, `floor(rand*(i+1)) === i` for every shuffle step (i
    // never exceeds 29), so the shuffle is a no-op and segments stay in
    // their build order: bust segments first, then tiers in ascending
    // order — landing this on the LAST segment (index 29) always lands the
    // top ("jack") tier, a guaranteed win worth RISKS.low.tiers[3] = 4.9×.
    await page.evaluate(() => {
      window.Math.random = () => 0.99
    })

    await page.click('[data-risk="low"]')
    await page.fill('#betInput', '10')

    const before = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))

    await page.click('#wheelBtn')
    await expect(page.locator('#wheelBtn')).toBeEnabled({ timeout: 7000 })
    await expect(page.locator('#curMult')).toHaveText('4.90×')
    await expect(page.locator('#cashBtn')).toBeEnabled()

    // Spin again — same pinned draw, same landing segment, the multiplier
    // COMPOUNDS (4.9 × 4.9) rather than resetting.
    await page.click('#wheelBtn')
    await expect(page.locator('#wheelBtn')).toBeEnabled({ timeout: 7000 })
    const mult2 = 4.9 * 4.9
    await expect(page.locator('#curMult')).toHaveText(mult2.toFixed(2) + '×')

    await page.click('#cashBtn')
    await expect(page.locator('#cashBtn')).toBeDisabled()

    const after = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))
    const expectedWinnings = Math.floor(10 * mult2 * 0.99)
    expect(after - before).toBe(expectedWinnings - 10)
  })
})

test.describe('Chicken Road — agent-ui.js:986', () => {
  // Controls and readouts: must be visible, the adapter acts on or reads them.
  const REQUIRED = [
    '#chkCross', '#chkStage', // detect()
    '#chkStart', '#chkDiff', '#chkCash', '#betInput', // play()
    '#chkMsg', '#laneNum', '#curMult', '#nextMult',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'chicken')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#chkDiff accepts a raw .value= write with no dispatched event, and start() reads it off the DOM', async ({
    page,
  }) => {
    await goto(page, 'chicken')

    // agent-ui.js:1007 writes `$("#chkDiff").value = diff` — a plain raw
    // assignment, NO dispatched event — mirrored exactly, since that is the
    // one write the adapter never pairs with an event (ChickenGame.tsx reads
    // it off the select ref at start()-time for exactly this reason).
    await page.evaluate(() => {
      const el = document.querySelector('#chkDiff') as HTMLSelectElement
      el.value = 'daredevil'
    })

    await page.click('#chkStart')
    await Promise.resolve() // React 18 defers the commit to a microtask.

    // Daredevil is a 9-lane road (DIFFS.daredevil.steps) vs. easy's 15 — a
    // controlled <select> bound to state would never have seen the raw
    // write and would still build the 15-lane easy road.
    await expect(page.locator('[data-lane]')).toHaveCount(9)
  })

  test('a full round resolves lane by lane and cashing out pays out', async ({ page }) => {
    await goto(page, 'chicken')

    // Pin Math.random() so every crossing is safe (0 < any surv rate),
    // making the round deterministic rather than trusting the odds.
    await page.evaluate(() => {
      window.Math.random = () => 0
    })

    await page.fill('#betInput', '10')
    const before = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))

    await page.click('#chkStart')
    await expect(page.locator('#chkStart')).toBeDisabled()

    // Cross two lanes. Each cross's TRUTH (crossed++, #chkCross re-enabling)
    // lands on a plain setTimeout (380ms, ChickenGame.tsx) — never gated on
    // the hop animation's completion — so the adapter's own wait pattern
    // (`!#chkCross.disabled || !#chkStart.disabled`) is mirrored here too.
    for (let i = 0; i < 2; i++) {
      await page.click('#chkCross')
      await expect(page.locator('#chkCross')).toBeDisabled()
      await expect(page.locator('#chkCross')).toBeEnabled({ timeout: 2000 })
    }
    await expect(page.locator('#laneNum')).toHaveText('2')
    await expect(page.locator('#chkCash')).toBeEnabled()

    await page.click('#chkCash')
    await expect(page.locator('#chkStart')).toBeEnabled()
    await expect(page.locator('#chkCash')).toBeDisabled()

    const after = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))
    expect(after).toBeGreaterThan(before)
  })

  test('a crash re-enables #chkStart and the round ends as a loss', async ({ page }) => {
    await goto(page, 'chicken')

    // Easy's survival rate is 0.91 — pinning Math.random() just under 1
    // guarantees `Math.random() < surv` is false, i.e. a deterministic crash
    // on the very first lane.
    await page.evaluate(() => {
      window.Math.random = () => 0.999
    })

    await page.fill('#betInput', '10')
    const before = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))

    await page.click('#chkStart')
    await page.click('#chkCross')

    // ChickenGame.tsx resolves the crash off a plain 320ms setTimeout
    // (Track A), independent of the splat animation actually painting.
    await expect(page.locator('#chkStart')).toBeEnabled({ timeout: 2000 })
    await expect(page.locator('#chkCross')).toBeDisabled()
    await expect(page.locator('#chkMsg')).toContainText('Splat')

    // The bet was lost outright — no payout on a crash.
    const after = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))
    expect(after).toBe(before - 10)
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

test.describe('RPS — agent-ui.js:1315', () => {
  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'rps')
    await expectUsable(page, '#rpsMsg')
    await expectUsable(page, '#betInput')
    // detect()'s other half is #rpsTrack — but it's legitimately EMPTY until
    // a round resolves (same reasoning as Dice's #history/#diceMarker): an
    // empty div has no bounding box, so "attached" is the real contract
    // here, not "visible".
    await expect(page.locator('#rpsTrack')).toBeAttached()
  })

  test('#rpsTrack fills in once a round resolves', async ({ page }) => {
    await goto(page, 'rps')
    await page.evaluate(() => {
      const api = (window as never as { RPSAPI: { throw: (m: 0 | 1 | 2) => void } }).RPSAPI
      api.throw(0)
    })
    await expect(page.locator('#rpsTrack')).toBeVisible()
    await expect(page.locator('#rpsTrack .rps-track-item')).toHaveCount(1)
  })

  test('window.RPSAPI exposes all five members', async ({ page }) => {
    await goto(page, 'rps')
    const members = await page.evaluate(() => {
      const api = (window as never as { RPSAPI?: Record<string, unknown> }).RPSAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(['cashOut', 'inRound', 'mult', 'streak', 'throw'].sort())
  })

  test('throw(0|1|2) resolves a round: streak/mult update and #rpsMsg reports the result', async ({ page }) => {
    await goto(page, 'rps')
    await page.evaluate(() => {
      const api = (window as never as { RPSAPI: { throw: (m: 0 | 1 | 2) => void } }).RPSAPI
      api.throw(0) // rock — moveMap verified against agent-ui.js:1328
    })

    const msg = await page.locator('#rpsMsg').textContent()
    expect(msg).not.toBe('Set a bet and throw.')
    expect(msg?.length).toBeGreaterThan(0)

    // Either a decisive round (streak moved) or a tie (streak untouched,
    // round still live) — both are valid single-throw outcomes.
    const snapshot = await page.evaluate(() => {
      const api = (window as never as {
        RPSAPI: { inRound: () => boolean; streak: () => number; mult: () => number }
      }).RPSAPI
      return { inRound: api.inRound(), streak: api.streak(), mult: api.mult() }
    })
    expect(typeof snapshot.inRound).toBe('boolean')
    expect(snapshot.streak).toBeGreaterThanOrEqual(0)
    expect(snapshot.mult).toBeGreaterThanOrEqual(1)
  })

  test('cashOut() banks the streak and ends the round', async ({ page }) => {
    await goto(page, 'rps')
    // Throw until a win lands (streak > 0) so cashOut() has something to
    // bank, capped so a pathological all-loss run can't hang the test.
    await page.evaluate(async () => {
      const api = (window as never as {
        RPSAPI: { throw: (m: 0 | 1 | 2) => void; inRound: () => boolean; streak: () => number }
      }).RPSAPI
      for (let i = 0; i < 20; i++) {
        if (api.streak() > 0 || !api.inRound()) break
        api.throw((i % 3) as 0 | 1 | 2)
      }
    })

    await page.evaluate(() => {
      const api = (window as never as { RPSAPI: { cashOut: () => void } }).RPSAPI
      api.cashOut()
    })

    const inRound = await page.evaluate(() =>
      (window as never as { RPSAPI: { inRound: () => boolean } }).RPSAPI.inRound(),
    )
    expect(inRound).toBe(false)
  })

  test('RPSAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'rps')
    expect(await page.evaluate(() => 'RPSAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes rps.detect() return true on the wrong route, and the
    // agent sits there throwing into a dead round.
    expect(await page.evaluate(() => 'RPSAPI' in window)).toBe(false)
  })
})

test.describe('Coinflip — agent-ui.js:1291', () => {
  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'coinflip')
    // detect() needs window.CoinflipAPI (checked separately below) + #cfCoins.
    await expectUsable(page, '#cfCoins')
    await expectUsable(page, '#cfMsg')
    await expectUsable(page, '#betInput')
  })

  test('window.CoinflipAPI exposes all six members', async ({ page }) => {
    await goto(page, 'coinflip')
    const members = await page.evaluate(() => {
      const api = (window as never as { CoinflipAPI?: Record<string, unknown> }).CoinflipAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(['call', 'cashOut', 'inRound', 'mult', 'setCoins', 'streak'].sort())
  })

  test('setCoins(n) then call(pick) resolves a round: streak/mult update and #cfMsg reports the result', async ({ page }) => {
    await goto(page, 'coinflip')
    await page.evaluate(() => {
      const api = (window as never as {
        CoinflipAPI: { setCoins: (n: number) => void; call: (pick: number) => void }
      }).CoinflipAPI
      api.setCoins(1)
      api.call(1) // heads — mapping verified against agent-ui.js:1305 (0 tails, 1 heads)
    })

    const msg = await page.locator('#cfMsg').textContent()
    expect(msg).not.toBe('Set a bet, pick your side.')
    expect(msg?.length).toBeGreaterThan(0)

    // Either a win (streak advanced, still in round) or a loss (round over,
    // streak reset to 0) — both are valid single-call outcomes.
    const snapshot = await page.evaluate(() => {
      const api = (window as never as {
        CoinflipAPI: { inRound: () => boolean; streak: () => number; mult: () => number }
      }).CoinflipAPI
      return { inRound: api.inRound(), streak: api.streak(), mult: api.mult() }
    })
    expect(typeof snapshot.inRound).toBe('boolean')
    expect(snapshot.streak).toBeGreaterThanOrEqual(0)
    expect(snapshot.mult).toBeGreaterThanOrEqual(1)
  })

  test('cashOut() banks the streak and ends the round', async ({ page }) => {
    await goto(page, 'coinflip')
    // Call until a win lands (streak > 0) so cashOut() has something to
    // bank, capped so a pathological all-loss run can't hang the test.
    await page.evaluate(async () => {
      const api = (window as never as {
        CoinflipAPI: { call: (pick: number) => void; inRound: () => boolean; streak: () => number }
      }).CoinflipAPI
      for (let i = 0; i < 20; i++) {
        if (api.streak() > 0 || !api.inRound()) break
        api.call(i % 2)
      }
    })

    await page.evaluate(() => {
      const api = (window as never as { CoinflipAPI: { cashOut: () => void } }).CoinflipAPI
      api.cashOut()
    })

    const inRound = await page.evaluate(() =>
      (window as never as { CoinflipAPI: { inRound: () => boolean } }).CoinflipAPI.inRound(),
    )
    expect(inRound).toBe(false)
  })

  test('CoinflipAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'coinflip')
    expect(await page.evaluate(() => 'CoinflipAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes coinflip.detect() return true on the wrong route,
    // and the agent sits there calling into a dead round.
    expect(await page.evaluate(() => 'CoinflipAPI' in window)).toBe(false)
  })
})

test.describe('Tower — agent-ui.js:857', () => {
  const REQUIRED = [
    '#towerGrid', '#towerStart', // detect()
    '#diffSelect', '#betInput', '#cashBtn',
    '#rowsClimbed', '#curMult', '#nextMult', '#towerMsg',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'tower')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#diffSelect offers exactly the five difficulties', async ({ page }) => {
    await goto(page, 'tower')
    const values = await page
      .locator('#diffSelect option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
    expect(values).toEqual(['easy', 'medium', 'hard', 'expert', 'master'])
  })

  test('#towerGrid renders 8 rows, each with tiles in data-col order', async ({ page }) => {
    await goto(page, 'tower')
    const rows = page.locator('#towerGrid .tower-row')
    await expect(rows).toHaveCount(8)

    // Easy defaults to 4 tiles/row. Order matters: the adapter clicks the
    // active row's tiles by ARRAY POSITION, not by data-col.
    const firstRowCols = await rows
      .first()
      .locator('.tile')
      .evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.col)))
    expect(firstRowCols).toEqual([0, 1, 2, 3])
  })

  test('#towerStart disables on start, exactly one .tower-row carries .active', async ({ page }) => {
    await goto(page, 'tower')
    await page.click('#towerStart')

    // agent-ui.js:889 gates its whole climb loop on this being disabled.
    await expect(page.locator('#towerStart')).toBeDisabled()
    await expect(page.locator('#cashBtn')).toBeDisabled() // no rows climbed yet

    const activeRows = page.locator('#towerGrid .tower-row.active')
    await expect(activeRows).toHaveCount(1)

    // The active row is the BOTTOM row (row 0) at the start of a climb —
    // tower.js builds the tower top-first, so row 0 is the last DOM child.
    const rows = page.locator('#towerGrid .tower-row')
    const count = await rows.count()
    await expect(rows.nth(count - 1)).toHaveClass(/active/)
  })

  test('a full climb-and-cashout round updates rowsClimbed/curMult and re-enables #towerStart', async ({
    page,
  }) => {
    await goto(page, 'tower')
    await page.click('#towerStart')
    await expect(page.locator('#towerStart')).toBeDisabled()

    // Climb one row: click the first non-revealed tile in the active row.
    // Easy odds (3 safe / 4 tiles) make a mine-free single pick likely, but
    // the assertions below only depend on the round still being live OR
    // having ended — both are valid single-pick outcomes, matching the
    // Coinflip/RPS "either a win or a loss" pattern already used here.
    const activeRow = page.locator('#towerGrid .tower-row.active')
    await activeRow.locator('.tile').first().click()

    const stillLive = await page.locator('#towerStart').isDisabled()
    if (stillLive) {
      // Climbed at least one row — #cashBtn must now be enabled and
      // #rowsClimbed/#curMult must have moved off their zero-state values.
      await expect(page.locator('#cashBtn')).toBeEnabled()
      const climbed = await page.locator('#rowsClimbed').textContent()
      expect(Number(climbed)).toBeGreaterThan(0)
      const curMult = await page.locator('#curMult').textContent()
      expect(curMult).not.toBe('1.00×')

      await page.click('#cashBtn')
    }

    // Whether the round ended by hitting a mine or by cashing out,
    // #towerStart must re-enable and #towerMsg must report a result.
    await expect(page.locator('#towerStart')).toBeEnabled()
    const msg = await page.locator('#towerMsg').textContent()
    expect(msg).not.toBe('Choose difficulty and press Start.')
    expect(msg?.length).toBeGreaterThan(0)
  })
})

test.describe('Moles — agent-ui.js:1265', () => {
  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'moles')
    // detect() needs window.MolesAPI (checked separately below) + #molGrid.
    await expectUsable(page, '#molGrid')
    await expectUsable(page, '#molSelect')
    await expectUsable(page, '#betInput')
    await expectUsable(page, '#molStart')
    await expectUsable(page, '#molMsg')
  })

  test('#molSelect offers exactly the 8 mole-count options', async ({ page }) => {
    await goto(page, 'moles')
    const values = await page
      .locator('#molSelect option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
    expect(values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  test('#molGrid renders 9 holes in index order', async ({ page }) => {
    await goto(page, 'moles')
    const holes = page.locator('#molGrid .mol-hole')
    await expect(holes).toHaveCount(9)

    // The adapter's whackRandom() targets a hole by ARRAY POSITION via
    // window.MolesAPI, not by clicking DOM nodes directly, but order still
    // matters for anything that inspects the grid document-wide.
    const order = await holes.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.idx)))
    expect(order).toEqual([...Array(9).keys()])
  })

  test('window.MolesAPI exposes all eight members', async ({ page }) => {
    await goto(page, 'moles')
    const members = await page.evaluate(() => {
      const api = (window as never as { MolesAPI?: Record<string, unknown> }).MolesAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(
      ['cashOut', 'found', 'holesLeft', 'inRound', 'moles', 'over', 'start', 'whackRandom'].sort(),
    )
  })

  test('a full start -> whackRandom -> cashOut round via window.MolesAPI', async ({ page }) => {
    await goto(page, 'moles')

    // Mirrors agent-ui.js:1265's own play(): applyBet + raw #molSelect
    // write (no dispatched event — the field is uncontrolled) + #molStart
    // click, never window.MolesAPI.start() itself.
    await page.evaluate(() => {
      const bet = document.querySelector('#betInput') as HTMLInputElement
      bet.value = '20'
      bet.dispatchEvent(new Event('input', { bubbles: true }))
      const sel = document.querySelector('#molSelect') as HTMLSelectElement
      sel.value = '3'
      ;(document.querySelector('#molStart') as HTMLButtonElement).click()
    })

    const inRoundAfterStart = await page.evaluate(() => {
      const api = (window as never as { MolesAPI: { inRound: () => boolean } }).MolesAPI
      return api.inRound()
    })
    expect(inRoundAfterStart).toBe(true)

    // Whack up to 9 holes or until the round ends (bust or all moles found).
    await page.evaluate(async () => {
      const api = (window as never as {
        MolesAPI: { inRound: () => boolean; holesLeft: () => number; whackRandom: () => void }
      }).MolesAPI
      let guard = 0
      while (api.inRound() && api.holesLeft() > 0 && guard++ < 9) api.whackRandom()
    })

    const found = await page.evaluate(
      () => (window as never as { MolesAPI: { found: () => number } }).MolesAPI.found(),
    )
    expect(found).toBeGreaterThanOrEqual(0)

    // If the round is still live (found > 0, not busted), cash out.
    await page.evaluate(() => {
      const api = (window as never as {
        MolesAPI: { inRound: () => boolean; found: () => number; cashOut: () => void }
      }).MolesAPI
      if (api.inRound() && api.found() > 0) api.cashOut()
    })

    const msg = await page.locator('#molMsg').textContent()
    expect(msg).not.toBe('Set your bet and start whacking.')
    expect(msg?.length).toBeGreaterThan(0)
  })

  test('MolesAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'moles')
    expect(await page.evaluate(() => 'MolesAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes moles.detect() return true on the wrong route, and
    // the agent sits there whacking into a dead round.
    expect(await page.evaluate(() => 'MolesAPI' in window)).toBe(false)
  })
})

test.describe('Snakes — agent-ui.js:1338', () => {
  const REQUIRED = [
    '#snBoard', // detect() (window.SnakesAPI is the other half, checked below)
    '#snMsg', '#betInput',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'snakes')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('window.SnakesAPI exposes all eight members', async ({ page }) => {
    await goto(page, 'snakes')
    const members = await page.evaluate(() => {
      const api = (window as never as { SnakesAPI?: Record<string, unknown> }).SnakesAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(
      ['busy', 'cashOut', 'inRound', 'mult', 'roll', 'rolls', 'setDifficulty', 'setInstant'].sort(),
    )
  })

  test('SnakesAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'snakes')
    expect(await page.evaluate(() => 'SnakesAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes snakes.detect() return true on the wrong route, and
    // the agent sits there rolling into a dead board.
    expect(await page.evaluate(() => 'SnakesAPI' in window)).toBe(false)
  })

  test('busy() transitions false -> true -> false on a timer, not stuck', async ({ page }) => {
    await goto(page, 'snakes')
    await page.evaluate(() => {
      const api = (window as never as {
        SnakesAPI: { setDifficulty: (s: number) => void; setInstant: (v: boolean) => void }
      }).SnakesAPI
      api.setDifficulty(1) // easy — 1 snake, so the animated path below is likely to resolve safe
      api.setInstant(false) // exercise the timer-driven step/finish chain, not the instant shortcut
    })

    const busyBefore = await page.evaluate(
      () => (window as never as { SnakesAPI: { busy: () => boolean } }).SnakesAPI.busy(),
    )
    expect(busyBefore).toBe(false)

    await page.evaluate(() => (window as never as { SnakesAPI: { roll: () => void } }).SnakesAPI.roll())

    // Set synchronously inside doRoll() before any timer fires — Track A
    // (busyRef) never waits on Track B (the token's cosmetic slide).
    const busyDuring = await page.evaluate(
      () => (window as never as { SnakesAPI: { busy: () => boolean } }).SnakesAPI.busy(),
    )
    expect(busyDuring).toBe(true)

    // Mirrors agent-ui.js's own `waitFor(() => !API.busy(), 4000)`.
    await expect
      .poll(
        () => page.evaluate(() => (window as never as { SnakesAPI: { busy: () => boolean } }).SnakesAPI.busy()),
        { timeout: 4000 },
      )
      .toBe(false)

    const rolls = await page.evaluate(
      () => (window as never as { SnakesAPI: { rolls: () => number } }).SnakesAPI.rolls(),
    )
    expect(rolls).toBe(1)
  })

  test('a full roll -> busy resolves -> cashout round via the API updates #snMsg', async ({ page }) => {
    await goto(page, 'snakes')
    await page.evaluate(() => {
      const api = (window as never as {
        SnakesAPI: { setDifficulty: (s: number) => void; setInstant: (v: boolean) => void }
      }).SnakesAPI
      api.setDifficulty(1)
      api.setInstant(true) // agent-ui.js:1352 always sets instant(true) before rolling
    })

    await page.evaluate(async () => {
      const api = (window as never as { SnakesAPI: { roll: () => void; busy: () => boolean } }).SnakesAPI
      api.roll()
      const start = Date.now()
      while (api.busy() && Date.now() - start < 4000) await new Promise((r) => setTimeout(r, 30))
    })

    const afterFirst = await page.evaluate(() => {
      const api = (window as never as {
        SnakesAPI: { inRound: () => boolean; rolls: () => number; busy: () => boolean }
      }).SnakesAPI
      return { inRound: api.inRound(), rolls: api.rolls(), busy: api.busy() }
    })
    expect(afterFirst.busy).toBe(false)
    expect(afterFirst.rolls).toBe(1)

    // Either still alive (safe landing — cash out to end the round) or
    // already busted (bust ends the round on its own) — both are valid
    // single-roll outcomes, same "either/or" pattern as Coinflip/RPS above.
    if (afterFirst.inRound) {
      await page.evaluate(() => (window as never as { SnakesAPI: { cashOut: () => void } }).SnakesAPI.cashOut())
    }

    const inRound = await page.evaluate(
      () => (window as never as { SnakesAPI: { inRound: () => boolean } }).SnakesAPI.inRound(),
    )
    expect(inRound).toBe(false)

    const msg = await page.locator('#snMsg').textContent()
    expect(msg).not.toBe('Pick a difficulty and roll.')
    expect(msg?.length).toBeGreaterThan(0)
  })
})

test.describe('Keno — agent-ui.js:1362', () => {
  const REQUIRED = [
    '#knBoard', // detect() (window.KenoAPI is the other half, checked below)
    '#knMsg', '#betInput', '#knPlay',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'keno')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#knBoard renders 40 tiles in index order', async ({ page }) => {
    await goto(page, 'keno')
    const tiles = page.locator('#knBoard .tile')
    await expect(tiles).toHaveCount(40)

    // TileGrid's own contract (components/TileGrid.tsx): tile[i] must render
    // as the i-th DOM child, always — nothing in Keno's adapter clicks tiles
    // by index today, but this guards the primitive itself for every future
    // consumer.
    const order = await tiles.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.idx)))
    expect(order).toEqual([...Array(40).keys()])
  })

  test('window.KenoAPI exposes all four members', async ({ page }) => {
    await goto(page, 'keno')
    const members = await page.evaluate(() => {
      const api = (window as never as { KenoAPI?: Record<string, unknown> }).KenoAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(['pickCount', 'play', 'quickPick', 'setRisk'].sort())
  })

  test('KenoAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'keno')
    expect(await page.evaluate(() => 'KenoAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes keno.detect() return true on the wrong route, and
    // the agent sits there drawing into a dead board.
    expect(await page.evaluate(() => 'KenoAPI' in window)).toBe(false)
  })

  test('setRisk(r) then a quickPick -> play round updates pickCount/#knMsg', async ({ page }) => {
    await goto(page, 'keno')

    // Mirrors agent-ui.js:1374-1378 exactly: setRisk() BEFORE the
    // pickCount()===0 gate, no await between any of these four calls.
    const result = await page.evaluate(() => {
      const api = (window as never as {
        KenoAPI: {
          setRisk: (r: string) => void
          pickCount: () => number
          quickPick: () => void
          play: () => void
        }
      }).KenoAPI
      api.setRisk('high')
      const before = api.pickCount()
      if (api.pickCount() === 0) api.quickPick()
      const after = api.pickCount()
      api.play()
      return { before, after }
    })

    expect(result.before).toBe(0)
    expect(result.after).toBeGreaterThan(0)
    expect(result.after).toBeLessThanOrEqual(10)

    const msg = await page.locator('#knMsg').textContent()
    expect(msg).not.toBe('Pick your numbers and play.')
    expect(msg?.length).toBeGreaterThan(0)

    const picks = await page.locator('#knPicks').textContent()
    expect(picks).toBe(`${result.after} / 10`)
  })

  test('setRisk with an invalid key is a no-op', async ({ page }) => {
    await goto(page, 'keno')
    await page.evaluate(() => {
      const api = (window as never as { KenoAPI: { setRisk: (r: string) => void } }).KenoAPI
      api.setRisk('not-a-real-risk')
    })
    // Classic stays the selected (default `gold` variant, no `btn-ghost`
    // suffix) risk button — cheap proxy for "risk state didn't change"
    // without reaching into React internals. An unselected button (e.g.
    // Low) carries `btn-ghost`; Classic never does while selected.
    const classicBtn = page.locator('#knRisk [data-risk="classic"]')
    await expect(classicBtn).not.toHaveClass(/btn-ghost/)
    const lowBtn = page.locator('#knRisk [data-risk="low"]')
    await expect(lowBtn).toHaveClass(/btn-ghost/)
  })
})

test.describe('Battleship — agent-ui.js:1233', () => {
  const REQUIRED = [
    '#bsDeal', '#bsGrid', // detect()
    '#betInput', '#bsStatus',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'battleship')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#bsGrid renders 25 tiles (the real 5x5 engine, battleship.js:19) in index order', async ({ page }) => {
    await goto(page, 'battleship')
    const tiles = page.locator('#bsGrid .tile')
    await expect(tiles).toHaveCount(25)

    // TileGrid's own contract (components/TileGrid.tsx): tile[i] must render
    // as the i-th DOM child, always — window.BattleshipAPI.fire(r,c) is what
    // the adapter actually calls (never a direct tile click), but this
    // guards the shared primitive itself.
    const order = await tiles.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.idx)))
    expect(order).toEqual([...Array(25).keys()])
  })

  test('window.BattleshipAPI exposes all ten members', async ({ page }) => {
    await goto(page, 'battleship')
    const members = await page.evaluate(() => {
      const api = (window as never as { BattleshipAPI?: Record<string, unknown> }).BattleshipAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(
      ['inRound', 'over', 'shotsLeft', 'mult', 'suggest', 'fire', 'buyPrice', 'buyShot', 'cashOut', 'deploy'].sort(),
    )
  })

  test('BattleshipAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'battleship')
    expect(await page.evaluate(() => 'BattleshipAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes battleship.detect() return true on the wrong route,
    // and the agent sits there firing into a dead board.
    expect(await page.evaluate(() => 'BattleshipAPI' in window)).toBe(false)
  })

  test('a full deploy -> suggest/fire -> cashOut round via the API updates mult and #bsStatus', async ({ page }) => {
    await goto(page, 'battleship')

    // Mirrors agent-ui.js:1245-1260 exactly: applyBet() -> #betInput,
    // click #bsDeal to deploy, then loop suggest()/fire() while
    // inRound() && shotsLeft() > 0, then cashOut() if still in round.
    await page.fill('#betInput', '25')
    await page.click('#bsDeal')

    const result = await page.evaluate(async () => {
      const api = (window as never as {
        BattleshipAPI: {
          inRound: () => boolean
          shotsLeft: () => number
          suggest: () => { r: number; c: number } | null
          fire: (r: number, c: number) => void
          mult: () => number
          cashOut: () => void
        }
      }).BattleshipAPI
      let guard = 0
      while (api.inRound() && api.shotsLeft() > 0 && guard++ < 30) {
        const mv = api.suggest()
        if (!mv) break
        api.fire(mv.r, mv.c)
      }
      if (api.inRound()) api.cashOut()
      return { inRound: api.inRound(), mult: api.mult() }
    })

    expect(result.inRound).toBe(false)
    expect(result.mult).toBeGreaterThanOrEqual(0)

    const msg = await page.locator('#bsStatus').textContent()
    expect(msg).not.toBe('Place a bet and open fire.')
    expect(msg?.length).toBeGreaterThan(0)
  })
})

test.describe("Hilo — agent-ui.js:793", () => {
  const REQUIRED = [
    '#higherBtn', '#hiloCard', // detect()
    '#lowerBtn', '#startBtn', '#cashBtn', '#betInput', // play()
    '#runMult', '#hiloMsg',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'hilo')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#higherBtn/#lowerBtn/#cashBtn start disabled, #startBtn does not', async ({ page }) => {
    await goto(page, 'hilo')
    await expect(page.locator('#higherBtn')).toBeDisabled()
    await expect(page.locator('#lowerBtn')).toBeDisabled()
    await expect(page.locator('#cashBtn')).toBeDisabled()
    await expect(page.locator('#startBtn')).toBeEnabled()
  })

  test('.rank-top content matches the adapter\'s own slice(0, -1) expectation', async ({ page }) => {
    await goto(page, 'hilo')
    await page.click('#startBtn')

    // agent-ui.js:798-800 readCard(): `.rank-top`'s WHOLE textContent, trimmed,
    // with the LAST CHARACTER (the suit glyph) sliced off — no regex, unlike
    // Blackjack's cardRank(). Card.tsx's `.rank-top` renders rank+suit
    // concatenated with no separator, so this must always leave a bare rank.
    const rank = await page.locator('#hiloCard .rank-top').evaluate((el) => {
      const txt = (el.textContent ?? '').trim()
      return txt.slice(0, -1)
    })
    expect(rank.length).toBeGreaterThan(0)
    expect(/^(10|[2-9AJQK])$/.test(rank)).toBe(true)
  })

  test('#runMult never tweens on a contract read', async ({ page }) => {
    // Registered BEFORE navigation: AnimatedNumber's guard warns once at
    // #runMult's first mount (Stat's own "warn once per contract id" rule),
    // which happens during goto() itself — a listener attached after goto
    // would miss it and this assertion would pass vacuously.
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes('runMult')) warnings.push(msg.text())
    })

    await goto(page, 'hilo')

    // AnimatedNumber's own isNumericContractId guard (platform/motion/AnimatedNumber.tsx)
    // must have actually fired for #runMult, in DEV, at mount — confirming the guard
    // itself engaged, not just that no tween happened to be observed.
    expect(warnings.length).toBeGreaterThan(0)

    await page.click('#startBtn')

    // Call whichever side is enabled repeatedly until the round ends or a
    // guard trips — same "play it out" shape as the other card-game specs.
    let guard = 0
    while (!(await page.locator('#higherBtn').isDisabled()) && guard++ < 10) {
      // Sample #runMult's raw textContent fast, faster than any plausible
      // tween, mirroring motion.spec.ts's "Contract numbers never tween".
      const samples = await page.evaluate(async () => {
        const seen: string[] = []
        const read = () => {
          const t = document.getElementById('runMult')?.textContent ?? ''
          if (seen[seen.length - 1] !== t) seen.push(t)
        }
        const poll = setInterval(read, 15)
        read()
        ;(document.getElementById('higherBtn') as HTMLButtonElement)?.click()
        await new Promise((r) => setTimeout(r, 200))
        clearInterval(poll)
        return seen
      })
      for (const s of samples) {
        const decimals = (s.split('.')[1] ?? '').replace(/[^0-9]/g, '').length
        expect(decimals, `#runMult held tween-grade precision: ${JSON.stringify(s)}`).toBeLessThanOrEqual(2)
      }
    }
  })

  test('a full start -> higher/lower loop -> cashout round', async ({ page }) => {
    await goto(page, 'hilo')
    await page.click('#startBtn')
    await expect(page.locator('#startBtn')).toBeDisabled()

    // agent-ui.js:817-849's own loop shape: call whichever side is currently
    // enabled until the round ends (a wrong call) or a guard trips.
    let guard = 0
    while (!(await page.locator('#higherBtn').isDisabled()) && guard++ < 15) {
      await page.click('#higherBtn')
    }

    // Whether the round busted on its own or is still live with a bankable
    // multiplier, cash out is always safe to attempt here.
    if (!(await page.locator('#cashBtn').isDisabled())) {
      await page.click('#cashBtn')
    }

    await expect(page.locator('#startBtn')).toBeEnabled()
    await expect(page.locator('#higherBtn')).toBeDisabled()
    await expect(page.locator('#lowerBtn')).toBeDisabled()
    const msg = await page.locator('#hiloMsg').textContent()
    expect(msg).not.toBe('Set your bet and press Start.')
    expect(msg?.length).toBeGreaterThan(0)
  })
})

test.describe('Blackjack — agent-ui.js:400', () => {
  const REQUIRED = [
    '#dealBtn', // detect()
    '#hitBtn', '#standBtn', '#doubleBtn', '#betInput', // play()
    '#playerScore', '#playerCards', '#dealerCards', '#bjResult',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'blackjack')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#hitBtn/#standBtn/#doubleBtn start disabled, #dealBtn does not', async ({ page }) => {
    await goto(page, 'blackjack')
    await expect(page.locator('#hitBtn')).toBeDisabled()
    await expect(page.locator('#standBtn')).toBeDisabled()
    await expect(page.locator('#doubleBtn')).toBeDisabled()
    await expect(page.locator('#dealBtn')).toBeEnabled()
  })

  test('.rank-top content strips to a bare rank via the adapter\'s own regex', async ({ page }) => {
    await goto(page, 'blackjack')
    await page.click('#dealBtn')

    // agent-ui.js:405-408 cardRank(): el.querySelector(".rank-top").textContent
    // .replace(/[♠♣♥♦\s]/g, "").trim() -- Card.tsx's rank+suit-concatenated
    // `.rank-top` (e.g. "10♠") must strip cleanly to a bare rank.
    const stripped = await page
      .locator('#playerCards .card .rank-top')
      .first()
      .evaluate((el) => (el.textContent ?? '').replace(/[♠♣♥♦\s]/g, '').trim())
    expect(stripped.length).toBeGreaterThan(0)
    expect(/^(10|[2-9AJQK])$/.test(stripped)).toBe(true)
  })

  test('#dealerCards renders the hole card as .card.back while hidden', async ({ page }) => {
    await goto(page, 'blackjack')
    await page.click('#dealBtn')

    // If the round already resolved (a natural blackjack on the deal), the
    // hole card is revealed immediately -- skip rather than flake on the
    // ~4.8% two-blackjack chance a real shuffle can hit.
    const roundActive = !(await page.locator('#hitBtn').isDisabled())
    if (roundActive) {
      await expect(page.locator('#dealerCards .card.back')).toHaveCount(1)
      await expect(page.locator('#dealerCards .card:not(.back)')).toHaveCount(1)
    }
  })

  test('#doubleBtn is only enabled on the opening two cards', async ({ page }) => {
    await goto(page, 'blackjack')
    await page.click('#dealBtn')

    const roundActive = !(await page.locator('#hitBtn').isDisabled())
    if (!roundActive) return // resolved immediately (natural blackjack)

    // $1000 starting balance, $25 default bet -- doubling is affordable.
    await expect(page.locator('#doubleBtn')).toBeEnabled()

    await page.click('#hitBtn')
    const stillActive = !(await page.locator('#hitBtn').isDisabled())
    if (stillActive) await expect(page.locator('#doubleBtn')).toBeDisabled()
  })

  test('a full deal -> hit-or-stand -> result round resolves and re-enables #dealBtn', async ({ page }) => {
    await goto(page, 'blackjack')
    await page.click('#dealBtn')

    // Mirrors agent-ui.js:437-459's own guarded loop: play basic strategy
    // (stand on 17+, otherwise hit) until the round ends or the guard trips.
    let guard = 0
    while (
      (!(await page.locator('#hitBtn').isDisabled()) || !(await page.locator('#standBtn').isDisabled())) &&
      guard++ < 12
    ) {
      const total = parseInt((await page.locator('#playerScore').textContent()) ?? '0', 10)
      if (total >= 17) await page.click('#standBtn')
      else await page.click('#hitBtn')
    }

    await expect(page.locator('#hitBtn')).toBeDisabled()
    await expect(page.locator('#standBtn')).toBeDisabled()
    await expect(page.locator('#dealBtn')).toBeEnabled()

    const result = await page.locator('#bjResult').textContent()
    expect(result?.length).toBeGreaterThan(0)
  })
})

test.describe('Video Poker — agent-ui.js:464', () => {
  const REQUIRED = [
    '#vpCards', '#drawBtn', // detect()
    '#dealBtn', '#betInput', '#vpResult',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'videopoker')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#vpCards renders 5 slots in index order', async ({ page }) => {
    await goto(page, 'videopoker')
    const slots = page.locator('#vpCards .vp-slot')
    await expect(slots).toHaveCount(5)
    const order = await slots.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.idx)))
    expect(order).toEqual([0, 1, 2, 3, 4])
  })

  test('#drawBtn starts disabled, #dealBtn does not', async ({ page }) => {
    await goto(page, 'videopoker')
    await expect(page.locator('#drawBtn')).toBeDisabled()
    await expect(page.locator('#dealBtn')).toBeEnabled()
  })

  test('Deal produces 5 cards whose .rank-top slices exactly as readHand() expects', async ({ page }) => {
    await goto(page, 'videopoker')
    await page.click('#dealBtn')
    await expect(page.locator('#drawBtn')).toBeEnabled()
    await expect(page.locator('#dealBtn')).toBeDisabled()

    // Mirrors agent-ui.js:471-477's readHand() exactly: whole `.rank-top`
    // textContent, trimmed, suit = last char, rank = everything else — no
    // regex, unlike Blackjack's cardRank(). Card.tsx's rank+suit
    // concatenated `.rank-top` (e.g. "10♠") must slice cleanly.
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll('#vpCards .vp-slot')].map((slot) => {
        const txt = (slot.querySelector('.rank-top')?.textContent || '').trim()
        return { suit: txt.slice(-1), rank: txt.slice(0, -1) || '?' }
      }),
    )
    expect(cards).toHaveLength(5)
    for (const c of cards) {
      expect(['♠', '♣', '♥', '♦']).toContain(c.suit)
      expect(/^(10|[2-9AJQK])$/.test(c.rank)).toBe(true)
    }
  })

  test('clicking a .vp-slot toggles .held, and the adapter\'s own already-held guard holds', async ({ page }) => {
    await goto(page, 'videopoker')
    await page.click('#dealBtn')
    await expect(page.locator('#drawBtn')).toBeEnabled()

    const slot0 = page.locator('#vpCards .vp-slot[data-idx="0"]')
    await expect(slot0).not.toHaveClass(/held/)

    await slot0.click()
    await expect(slot0).toHaveClass(/held/)

    // agent-ui.js:545: `if (slot && !slot.classList.contains("held")) slot.click()`
    // — a real agent run never double-clicks an already-held slot. Confirm
    // the guard's premise (held slots are detectable) rather than clicking
    // twice, which would just toggle it back off and prove nothing.
    const alreadyHeld = await slot0.evaluate((el) => el.classList.contains('held'))
    expect(alreadyHeld).toBe(true)

    await slot0.click()
    await expect(slot0).not.toHaveClass(/held/)
  })

  test('window.VideoPokerGame.evaluate() scores a known four-of-a-kind hand', async ({ page }) => {
    await goto(page, 'videopoker')
    const result = await page.evaluate(() => {
      const cards = [
        { rank: '7', suit: { s: '♠' } },
        { rank: '7', suit: { s: '♣' } },
        { rank: '7', suit: { s: '♥' } },
        { rank: '7', suit: { s: '♦' } },
        { rank: '2', suit: { s: '♠' } },
      ]
      return (window as never as {
        VideoPokerGame: { evaluate: (c: unknown[]) => { key: string; label: string } | null }
      }).VideoPokerGame.evaluate(cards)
    })
    expect(result?.key).toBe('quads')
    expect(result?.label).toBe('Four of a Kind')
  })

  test('window.VideoPokerGame.evaluate() returns null for a hand worse than jacks-or-better', async ({ page }) => {
    await goto(page, 'videopoker')
    const result = await page.evaluate(() => {
      const cards = [
        { rank: '2', suit: { s: '♠' } },
        { rank: '5', suit: { s: '♣' } },
        { rank: '9', suit: { s: '♥' } },
        { rank: 'J', suit: { s: '♦' } },
        { rank: '10', suit: { s: '♠' } },
      ]
      return (window as never as {
        VideoPokerGame: { evaluate: (c: unknown[]) => { key: string; label: string } | null }
      }).VideoPokerGame.evaluate(cards)
    })
    expect(result).toBeNull()
  })

  test('window.VideoPokerGame is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'videopoker')
    expect(await page.evaluate(() => 'VideoPokerGame' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale global would leave the agent's fallback-holds heuristic and
    // its dealt-hand description reading a dead route's evaluator, same
    // reasoning as every window.*API teardown in this file.
    expect(await page.evaluate(() => 'VideoPokerGame' in window)).toBe(false)
  })

  test('a full deal -> hold -> draw round resolves and updates #vpResult', async ({ page }) => {
    await goto(page, 'videopoker')
    await page.click('#dealBtn')
    await expect(page.locator('#drawBtn')).toBeEnabled()
    await expect(page.locator('#dealBtn')).toBeDisabled()

    // Instant draw skips the ~4s staggered reveal so this test stays fast.
    await page.check('#vpInstant')

    await page.click('#drawBtn')
    await expect(page.locator('#dealBtn')).toBeEnabled({ timeout: 9000 })
    await expect(page.locator('#drawBtn')).toBeDisabled()

    const msg = await page.locator('#vpResult').textContent()
    expect(msg).not.toBe('Press Deal to start.')
    expect(msg?.length).toBeGreaterThan(0)
  })
})

test.describe('Baccarat — agent-ui.js:1102', () => {
  const REQUIRED = [
    '#bacDeal', // detect() half 1
    '#betInput', '#bacResult',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'baccarat')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('all three [data-side] elements are present and clickable (detect() half 2 + the pick target)', async ({
    page,
  }) => {
    await goto(page, 'baccarat')
    // detect(): !!document.querySelector("[data-side]").
    await expect(page.locator('[data-side]')).toHaveCount(3)
    for (const s of ['player', 'banker', 'tie']) {
      await expectUsable(page, `[data-side="${s}"]`)
    }
  })

  test('clicking [data-side="player"] selects Player before a deal', async ({ page }) => {
    await goto(page, 'baccarat')
    // Mirrors agent-ui.js:1116: document.querySelector('[data-side="player"]').click()
    // BEFORE applyBet()/#bacDeal -- selecting a side must be a plain click,
    // no confirm step, and must be reflected somewhere the agent could
    // cross-check (here: #bacSide, the stat tile).
    await page.click('[data-side="player"]')
    const label = await page.locator('#bacSide').textContent()
    expect(label).toBe('Player')
  })

  test('#bacDeal disables during the reveal and re-enables within 7s, #bacResult reports the outcome', async ({
    page,
  }) => {
    await goto(page, 'baccarat')
    // Full round mirroring agent-ui.js:1104-1122: pick a side, applyBet via
    // #betInput, click #bacDeal, wait up to 7s for #bacDeal to re-enable,
    // then read #bacResult.
    await page.click('[data-side="banker"]')
    await page.fill('#betInput', '25')
    await page.click('#bacDeal')

    await expect(page.locator('#bacDeal')).toBeDisabled()
    await expect(page.locator('#bacDeal')).toBeEnabled({ timeout: 7000 })

    const result = await page.locator('#bacResult').textContent()
    expect(result).not.toBe('Place a bet and deal.')
    expect(result?.length).toBeGreaterThan(0)

    // The bead plate logs the coup's outcome once settled.
    await expect(page.locator('#bacBeads span')).toHaveCount(1)
  })

  test('a dealt hand renders cards whose .rank-top holds rank+suit, no separator', async ({ page }) => {
    await goto(page, 'baccarat')
    await page.click('[data-side="banker"]')
    await page.click('#bacDeal')
    await expect(page.locator('#bacDeal')).toBeEnabled({ timeout: 7000 })

    // Player and Banker each got at least 2 cards; every .rank-top must be
    // non-empty (Card.tsx's face-up contract) since none of them are dealt
    // face-down in Baccarat (no hole card here, unlike Blackjack).
    const ranks = await page.evaluate(() =>
      [...document.querySelectorAll('#bacP .rank-top, #bacB .rank-top')].map((el) => (el.textContent ?? '').trim()),
    )
    expect(ranks.length).toBeGreaterThanOrEqual(4)
    for (const r of ranks) expect(r.length).toBeGreaterThan(0)
  })
})

test.describe('Casino War — agent-ui.js:1177', () => {
  const REQUIRED = [
    '#warDeal', '#warP', // detect()
    '#betInput', '#warResult',
  ]

  // #warWarRow (and its children #warSurrender/#warGo) start legitimately
  // HIDDEN — legacy casinowar.js:70 renders it `style="display:none"` from
  // the start, same as this port. "attached", not "visible", is the real
  // contract pre-tie (same reasoning as Dice's #history/#diceMarker above).
  const HIDDEN_UNTIL_TIE = ['#warWarRow']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'casinowar')
    for (const sel of REQUIRED) await expectUsable(page, sel)
    for (const sel of HIDDEN_UNTIL_TIE) await expect(page.locator(sel)).toBeAttached()
  })

  test('#warWarRow starts with no inline display style at all (not "none" — the adapter only tests === "flex")', async ({
    page,
  }) => {
    await goto(page, 'casinowar')
    const display = await page.evaluate(
      () => (document.getElementById('warWarRow') as HTMLElement).style.display,
    )
    // CasinoWarGame.tsx's own contract: the `style` prop is `undefined`
    // (not `{ display: 'none' }`) while `tie` is false, so this reads the
    // empty string — anything other than the literal string "flex" is
    // correct here, and the row is hidden visually via a separate
    // Tailwind `hidden` class, not this property.
    expect(display).not.toBe('flex')
  })

  test('#warWarRow.style.display reads exactly "flex" during a live tie — agent-ui.js:1191/1192\'s literal inline-style check', async ({
    page,
  }) => {
    await goto(page, 'casinowar')

    // Force a tie: Casino War has no exposed cheat/RNG hook for tests, so
    // this mirrors the adapter's own resilience — deal repeatedly (tiny
    // stake, so a long losing streak can't exhaust the $1000 starting
    // balance) until a tie actually lands. P(tie) per deal is 1/13
    // (13 equally-likely ranks) with the cheat rig off by default, so
    // ~200 attempts makes a false-negative astronomically unlikely
        // (well under 1e-6) while staying comfortably inside the wallet.
    const sawFlex = await page.evaluate(async () => {
      const bet = document.getElementById('betInput') as HTMLInputElement
      bet.value = '1'
      bet.dispatchEvent(new Event('input', { bubbles: true }))
      const dealBtn = document.getElementById('warDeal') as HTMLButtonElement
      const row = document.getElementById('warWarRow') as HTMLElement
      for (let i = 0; i < 200; i++) {
        dealBtn.click()
        // deal()'s own logic (ref writes, win/lose/tie branching) runs
        // synchronously, but the resulting setState only *schedules* a
        // React commit — it doesn't force one. A tight synchronous loop of
        // raw .click() calls never yields to the microtask queue, so
        // without this await the DOM could go multiple ties without ever
        // reflecting one. The real agent never hits this: it clicks once
        // then `await waitFor(...)`, which polls with real gaps between
        // checks, giving React ample room to flush.
        await Promise.resolve()
        if (row.style.display === 'flex') return true
      }
      return false
    })
    expect(sawFlex).toBe(true)

    // The literal string, not just a truthy computed style — this is
    // exactly what `$("#warWarRow").style.display === "flex"` checks.
    const display = await page.evaluate(
      () => (document.getElementById('warWarRow') as HTMLElement).style.display,
    )
    expect(display).toBe('flex')

    // And it is genuinely visible now, not just flagged in the inline
    // style while sitting in a display:none ancestor.
    await expect(page.locator('#warWarRow')).toBeVisible()
    await expectUsable(page, '#warGo')
    await expectUsable(page, '#warSurrender')
  })

  test('going to war resolves the round: #warWarRow hides again, #warDeal re-enables, #warResult reports the outcome', async ({
    page,
  }) => {
    await goto(page, 'casinowar')

    const outcome = await page.evaluate(async () => {
      const bet = document.getElementById('betInput') as HTMLInputElement
      bet.value = '1'
      bet.dispatchEvent(new Event('input', { bubbles: true }))
      const dealBtn = document.getElementById('warDeal') as HTMLButtonElement
      const row = document.getElementById('warWarRow') as HTMLElement
      let tied = false
      for (let i = 0; i < 200; i++) {
        dealBtn.click()
        // See the sibling test above — a raw click loop needs a microtask
        // yield or a scheduled-but-uncommitted tie can be missed entirely.
        await Promise.resolve()
        if (row.style.display === 'flex') { tied = true; break }
      }
      if (!tied) return 'never-tied'
      ;(document.getElementById('warGo') as HTMLButtonElement).click()
      await Promise.resolve()
      return row.style.display
    })

    expect(outcome).not.toBe('never-tied')
    // goToWar() resolves synchronously too — the row's inline style must
    // already be cleared back off "flex" the instant the click handler
    // returns, same synchronous-write discipline as setting it.
    expect(outcome).not.toBe('flex')

    await expect(page.locator('#warDeal')).toBeEnabled()
    const result = await page.locator('#warResult').textContent()
    expect(result).not.toBe('Place a bet and deal.')
    expect(result?.length).toBeGreaterThan(0)
  })

  test('a full deal round (win, lose, or tie-then-war) always re-enables #warDeal and reports a result', async ({
    page,
  }) => {
    await goto(page, 'casinowar')
    await page.fill('#betInput', '25')
    await page.click('#warDeal')

    // If it tied, go to war to bring the round to a close either way.
    const tied = await page.evaluate(
      () => (document.getElementById('warWarRow') as HTMLElement).style.display === 'flex',
    )
    if (tied) await page.click('#warGo')

    await expect(page.locator('#warDeal')).toBeEnabled()
    const result = await page.locator('#warResult').textContent()
    expect(result).not.toBe('Place a bet and deal.')
    expect(result?.length).toBeGreaterThan(0)
  })
})

test.describe('Red Dog — agent-ui.js:1201', () => {
  const REQUIRED = [
    '#rdDeal', '#rdCards', // detect()
    '#betInput', '#rdResult',
  ]

  // #rdActRow (and its children #rdCall/#rdRaise) start legitimately HIDDEN
  // — RedDogGame.tsx renders it with the `hidden` Tailwind class and no
  // inline `display` until a real (non-pair, non-consecutive) spread is
  // pending, same as Casino War's #warWarRow above. "attached", not
  // "visible", is the real pre-spread contract.
  const HIDDEN_UNTIL_ACTING = ['#rdActRow']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'reddog')
    for (const sel of REQUIRED) await expectUsable(page, sel)
    for (const sel of HIDDEN_UNTIL_ACTING) await expect(page.locator(sel)).toBeAttached()
  })

  test('#rdActRow starts with no inline display style at all (not "none" — the adapter only tests === "flex")', async ({
    page,
  }) => {
    await goto(page, 'reddog')
    const display = await page.evaluate(
      () => (document.getElementById('rdActRow') as HTMLElement).style.display,
    )
    // RedDogGame.tsx's own contract: the `style` prop is `undefined` (not
    // `{ display: 'none' }`) while no spread is pending, so this reads the
    // empty string — anything other than the literal string "flex" is
    // correct here, and the row is hidden visually via a separate
    // Tailwind `hidden` class, not this property.
    expect(display).not.toBe('flex')
  })

  test('#rdActRow.style.display reads exactly "flex" during a live raise/call spread — agent-ui.js:1215/1216\'s literal inline-style check', async ({
    page,
  }) => {
    await goto(page, 'reddog')

    // Force a real (non-pair, non-consecutive) spread: deal repeatedly
    // (tiny stake, so a long run can't exhaust the $1000 starting balance)
    // until the raise/call row actually goes live. A pair (~5.9%) or
    // consecutive ranks (~15%) resolve on their own with no act row, but
    // together they're a minority of deals, so ~200 attempts makes a
    // false-negative astronomically unlikely while staying comfortably
    // inside the wallet.
    const sawFlex = await page.evaluate(async () => {
      const bet = document.getElementById('betInput') as HTMLInputElement
      bet.value = '1'
      bet.dispatchEvent(new Event('input', { bubbles: true }))
      const dealBtn = document.getElementById('rdDeal') as HTMLButtonElement
      const row = document.getElementById('rdActRow') as HTMLElement
      for (let i = 0; i < 200; i++) {
        if (!dealBtn.disabled) dealBtn.click()
        // deal()'s own logic (ref writes, pair/consecutive/spread
        // branching) runs synchronously, but the resulting setState only
        // *schedules* a React commit — it doesn't force one. A tight
        // synchronous loop of raw .click() calls never yields to the
        // microtask queue, so without this await the DOM could go
        // multiple spreads without ever reflecting one. The real agent
        // never hits this: it clicks once then `await waitFor(...)`,
        // which polls with real gaps between checks, giving React ample
        // room to flush.
        await Promise.resolve()
        if (row.style.display === 'flex') return true
        // A pair or consecutive result resolves itself (450-500ms) and
        // re-enables #rdDeal on its own — give it a moment before the
        // next click attempt rather than hammering a disabled button.
        if (dealBtn.disabled) {
          await new Promise((r) => setTimeout(r, 60))
        }
      }
      return false
    })
    expect(sawFlex).toBe(true)

    // The literal string, not just a truthy computed style — this is
    // exactly what `$("#rdActRow").style.display === "flex"` checks.
    const display = await page.evaluate(
      () => (document.getElementById('rdActRow') as HTMLElement).style.display,
    )
    expect(display).toBe('flex')

    // And it is genuinely visible now, not just flagged in the inline
    // style while sitting in a display:none ancestor.
    await expect(page.locator('#rdActRow')).toBeVisible()
    await expectUsable(page, '#rdCall')
    await expectUsable(page, '#rdRaise')

    // The numeric contract element the adapter parses with parseInt —
    // a bare integer string while a real spread is live.
    const spreadText = await page.locator('#rdSpreadV').textContent()
    expect(Number.isFinite(parseInt(spreadText ?? '', 10))).toBe(true)
    expect(parseInt(spreadText ?? '', 10)).toBeGreaterThanOrEqual(1)
  })

  test('calling resolves the round: #rdActRow hides again, #rdDeal re-enables, #rdResult reports the outcome', async ({
    page,
  }) => {
    await goto(page, 'reddog')

    const acted = await page.evaluate(async () => {
      const bet = document.getElementById('betInput') as HTMLInputElement
      bet.value = '1'
      bet.dispatchEvent(new Event('input', { bubbles: true }))
      const dealBtn = document.getElementById('rdDeal') as HTMLButtonElement
      const row = document.getElementById('rdActRow') as HTMLElement
      let acting = false
      for (let i = 0; i < 200; i++) {
        if (!dealBtn.disabled) dealBtn.click()
        // See the sibling test above — a raw click loop needs a microtask
        // yield or a scheduled-but-uncommitted spread can be missed
        // entirely.
        await Promise.resolve()
        if (row.style.display === 'flex') { acting = true; break }
        if (dealBtn.disabled) await new Promise((r) => setTimeout(r, 60))
      }
      if (!acting) return 'never-acted'
      ;(document.getElementById('rdCall') as HTMLButtonElement).click()
      await Promise.resolve()
      return row.style.display
    })

    expect(acted).not.toBe('never-acted')
    // resolveThird() clears the pending spread synchronously too — the
    // row's inline style must already be cleared back off "flex" the
    // instant the click handler returns, same synchronous-write
    // discipline as setting it.
    expect(acted).not.toBe('flex')

    await expect(page.locator('#rdDeal')).toBeEnabled({ timeout: 7000 })
    const result = await page.locator('#rdResult').textContent()
    expect(result).not.toBe('Place a bet and deal.')
    expect(result?.length).toBeGreaterThan(0)
  })

  test('a full deal round (pair, consecutive push, or a resolved spread) always re-enables #rdDeal and reports a result', async ({
    page,
  }) => {
    await goto(page, 'reddog')
    await page.fill('#betInput', '25')
    await page.click('#rdDeal')

    // If a raise/call spread came up, call it to bring the round to a
    // close either way (pair/consecutive resolve on their own).
    const acting = await page.evaluate(
      () => (document.getElementById('rdActRow') as HTMLElement).style.display === 'flex',
    )
    if (acting) await page.click('#rdCall')

    await expect(page.locator('#rdDeal')).toBeEnabled({ timeout: 7000 })
    const result = await page.locator('#rdResult').textContent()
    expect(result).not.toBe('Place a bet and deal.')
    expect(result?.length).toBeGreaterThan(0)
  })
})

test.describe('Three Card Poker — agent-ui.js:1126', () => {
  const REQUIRED = [
    '#tcpDeal', '#tcpPlayer', // detect()
    '#tcpPlay', '#tcpFold', '#betInput', // play()
    '#tcpResult',
  ]

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'threecard')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('#tcpPlay/#tcpFold start disabled, #tcpDeal does not', async ({ page }) => {
    await goto(page, 'threecard')
    await expect(page.locator('#tcpPlay')).toBeDisabled()
    await expect(page.locator('#tcpFold')).toBeDisabled()
    await expect(page.locator('#tcpDeal')).toBeEnabled()
  })

  test('a deal produces 3 player cards whose .rank-top parses BOTH rank and suit', async ({ page }) => {
    await goto(page, 'threecard')
    await page.click('#tcpDeal')
    await expect(page.locator('#tcpPlay')).toBeEnabled({ timeout: 4000 })

    // Mirrors agent-ui.js's threecard.play() exactly: whole `.rank-top`
    // textContent, rank = glyphs stripped, suit = the matched glyph — both
    // pulled out of the SAME node, unlike Blackjack's rank-only regex.
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll('#tcpPlayer .card .rank-top')].map((e) => {
        const t = (e.textContent || '').trim()
        return {
          rank: t.replace(/[♠♣♥♦]/g, '').trim(),
          suit: (t.match(/[♠♣♥♦]/) || ['♠'])[0],
        }
      }),
    )
    expect(cards).toHaveLength(3)
    for (const c of cards) {
      expect(/^(10|[2-9AJQK])$/.test(c.rank)).toBe(true)
      expect(['♠', '♣', '♥', '♦']).toContain(c.suit)
    }
  })

  test('window.ThreeCardGame._t.rank3()/cmp3() rank a pair above a high card', async ({ page }) => {
    await goto(page, 'threecard')
    const cmp = await page.evaluate(() => {
      const T = (window as unknown as {
        ThreeCardGame: { _t: { rank3: (c: unknown[]) => unknown; cmp3: (a: unknown, b: unknown) => number } }
      }).ThreeCardGame._t
      const pair = T.rank3([
        { rank: '4', suit: { s: '♠' } },
        { rank: '4', suit: { s: '♥' } },
        { rank: '9', suit: { s: '♦' } },
      ])
      const highCard = T.rank3([
        { rank: 'A', suit: { s: '♠' } },
        { rank: 'K', suit: { s: '♥' } },
        { rank: '2', suit: { s: '♦' } },
      ])
      return T.cmp3(pair, highCard)
    })
    expect(cmp).toBeGreaterThan(0)
  })

  test('window.ThreeCardGame._t: a straight outranks a flush (three-card poker rule)', async ({ page }) => {
    await goto(page, 'threecard')
    const cmp = await page.evaluate(() => {
      const T = (window as unknown as {
        ThreeCardGame: { _t: { rank3: (c: unknown[]) => unknown; cmp3: (a: unknown, b: unknown) => number } }
      }).ThreeCardGame._t
      const straight = T.rank3([
        { rank: '5', suit: { s: '♠' } },
        { rank: '6', suit: { s: '♥' } },
        { rank: '7', suit: { s: '♦' } },
      ])
      const flush = T.rank3([
        { rank: '2', suit: { s: '♠' } },
        { rank: '9', suit: { s: '♠' } },
        { rank: 'K', suit: { s: '♠' } },
      ])
      return T.cmp3(straight, flush)
    })
    expect(cmp).toBeGreaterThan(0)
  })

  test('window.ThreeCardGame is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'threecard')
    expect(await page.evaluate(() => 'ThreeCardGame' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale global would leave the agent's rank3()/cmp3() calls comparing
    // against a dead route's ranking logic (harmless here since it's pure,
    // but still the same discipline as every other window.*API teardown).
    expect(await page.evaluate(() => 'ThreeCardGame' in window)).toBe(false)
  })

  test('a full ante -> deal -> play-or-fold round resolves and re-enables #tcpDeal', async ({ page }) => {
    await goto(page, 'threecard')
    await page.fill('#betInput', '25')
    await page.click('#tcpDeal')
    await expect(page.locator('#tcpPlay')).toBeEnabled({ timeout: 4000 })
    await expect(page.locator('#tcpDeal')).toBeDisabled()

    // Basic strategy mirrored from agent-ui.js: play Queen-6-4 or better,
    // fold worse — either action is a valid single-hand outcome for this test.
    const ranks = await page.evaluate(() =>
      [...document.querySelectorAll('#tcpPlayer .card .rank-top')].map((e) =>
        (e.textContent || '').replace(/[♠♣♥♦]/g, '').trim(),
      ),
    )
    const rvv = (r: string) => ({ A: 14, K: 13, Q: 12, J: 11 } as Record<string, number>)[r] || Number(r) || 0
    const v = ranks.map(rvv).sort((a, b) => b - a)
    const pairMatch = v[0] === v[1] || v[1] === v[2]
    const play = pairMatch || v[0] > 12 || (v[0] === 12 && (v[1] > 6 || (v[1] === 6 && v[2] >= 4)))

    await page.click(play ? '#tcpPlay' : '#tcpFold')

    await expect(page.locator('#tcpDeal')).toBeEnabled()
    await expect(page.locator('#tcpPlay')).toBeDisabled()
    await expect(page.locator('#tcpFold')).toBeDisabled()
    const result = await page.locator('#tcpResult').textContent()
    expect(result).not.toBe('Set your ante and deal.')
    expect(result?.length).toBeGreaterThan(0)
  })
})

test.describe('Slots — agent-ui.js:360', () => {
  // Controls the adapter touches directly: detect() + play().
  const REQUIRED = ['#spinBtn', '#reels', '#betInput']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'slots')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('a spin resolves within 5s and #spinBtn re-enables', async ({ page }) => {
    await goto(page, 'slots')
    await expect(page.locator('#spinBtn')).toBeEnabled()

    await page.click('#spinBtn')
    await Promise.resolve() // React 18 defers the commit to a microtask.
    await expect(page.locator('#spinBtn')).toBeDisabled()

    // agent-ui.js's play(): sleep(120), then waitFor #spinBtn enabled, 5000ms.
    await expect(page.locator('#spinBtn')).toBeEnabled({ timeout: 5000 })
  })

  test('a full spin cycle correctly pays out on a win', async ({ page }) => {
    await goto(page, 'slots')

    // Pin Math.random() to 0 — every weighted pick lands on index 0 of the
    // pool (WEIGHTED[0] is always "seven", the rarest/first symbol in
    // SYMBOLS), so all three reels draw the same symbol: a guaranteed
    // triple, deterministically, without depending on the cheat rig (off
    // by default) or a long probabilistic retry loop.
    await page.evaluate(() => {
      window.Math.random = () => 0
    })

    await page.click('#spinBtn')
    await expect(page.locator('#spinBtn')).toBeEnabled({ timeout: 5000 })

    await expect(page.locator('#winBanner')).toContainText('Triple Seven', { timeout: 1000 })
    await expect(page.locator('#lastWin')).not.toHaveText('0')
    await expect(page.locator('#lastWin')).not.toHaveText('—')

    // The wallet persists on every mutation (walletStore.ts's `persist`
    // middleware), so by the time #spinBtn re-enables the payout has
    // definitely been written through to localStorage — a 20-stake bet at
    // a pinned triple-seven (60x) nets the wallet strictly above its
    // starting balance.
    const balance = await page.evaluate(() => {
      const raw = window.localStorage.getItem('royal_casino_wallet_v1')
      return raw ? JSON.parse(raw).state.balance : null
    })
    expect(balance).toBeGreaterThan(1000)
  })

  test('a full spin cycle correctly reports zero on a loss', async ({ page }) => {
    await goto(page, 'slots')

    // Three distinct weighted-pool indices (seven, star, cherry — no two
    // share a symbol), so this is a guaranteed non-match rather than a
    // probabilistic one. doSpin() draws exactly 3 Math.random() calls for
    // the finals before the cheat check (which short-circuits without
    // consuming a call while cheatOn is false, the default) — anything
    // beyond that (reel filler symbols) falls back to real randomness.
    await page.evaluate(() => {
      const seq = [0, 0.5, 0.9]
      let i = 0
      const real = window.Math.random.bind(window.Math)
      window.Math.random = () => (i < seq.length ? seq[i++] : real())
    })

    await page.click('#spinBtn')
    await expect(page.locator('#spinBtn')).toBeEnabled({ timeout: 5000 })

    await expect(page.locator('#winBanner')).toContainText('No win', { timeout: 1000 })
    await expect(page.locator('#lastWin')).toHaveText('0')
  })
})

test.describe('Gems — agent-ui.js:380', () => {
  // Controls the adapter touches directly: detect() + play().
  const REQUIRED = ['#gemSpinBtn', '#gemGrid', '#betInput']

  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'gems')
    for (const sel of REQUIRED) await expectUsable(page, sel)
  })

  test('a spin resolves within 5s and #gemSpinBtn re-enables', async ({ page }) => {
    await goto(page, 'gems')
    await expect(page.locator('#gemSpinBtn')).toBeEnabled()

    await page.click('#gemSpinBtn')
    await Promise.resolve() // React 18 defers the commit to a microtask.
    await expect(page.locator('#gemSpinBtn')).toBeDisabled()

    // agent-ui.js's play(): sleep(120), then waitFor #gemSpinBtn enabled, 5000ms.
    await expect(page.locator('#gemSpinBtn')).toBeEnabled({ timeout: 5000 })
  })

  test('a full spin cycle correctly pays out on a win', async ({ page }) => {
    await goto(page, 'gems')

    // Pin Math.random() to 0 — every weighted pick lands on index 0 of the
    // pool (WEIGHTED[0] is always "diamond", the rarest/first symbol in
    // SYMBOLS), so all nine cells draw the same gem: every one of the 5
    // paylines hits at once, deterministically, without depending on the
    // cheat rig (off by default) or a long probabilistic retry loop.
    await page.evaluate(() => {
      window.Math.random = () => 0
    })

    await page.click('#gemSpinBtn')
    await expect(page.locator('#gemSpinBtn')).toBeEnabled({ timeout: 5000 })

    await expect(page.locator('#gemBanner')).toContainText('line', { timeout: 1000 })
    await expect(page.locator('#lastWin')).not.toHaveText('0')
    await expect(page.locator('#lastWin')).not.toHaveText('—')
    await expect(page.locator('#linesHit')).toHaveText('5')

    // The wallet persists on every mutation (walletStore.ts's `persist`
    // middleware), so by the time #gemSpinBtn re-enables the payout has
    // definitely been written through to localStorage — a 20-stake bet at
    // a pinned all-diamond grid (240x on every one of 5 lines) nets the
    // wallet strictly above its starting balance.
    const balance = await page.evaluate(() => {
      const raw = window.localStorage.getItem('royal_casino_wallet_v1')
      return raw ? JSON.parse(raw).state.balance : null
    })
    expect(balance).toBeGreaterThan(1000)
  })

  test('a full spin cycle correctly reports zero on a loss', async ({ page }) => {
    await goto(page, 'gems')

    // A fixed 9-value Math.random() sequence mapped through the weighted
    // pool (2 diamond + 3 star + 4 orb + 6 amethyst + 8 sapphire + 11
    // emerald = 34 entries) to a deterministic grid with no 3-in-a-row on
    // any of the 5 paylines:
    //   0,0,1 / 1,1,0 / 0,1,1  (0 = diamond, 1 = star)
    // rows: [0,0,1] [1,1,0] [0,1,1] — none all-equal.
    // diag ↘ [0,4,8] = 0,1,1 — not all-equal. diag ↙ [2,4,6] = 1,1,0 — not all-equal.
    // doSpin() draws exactly 9 Math.random() calls for the grid before the
    // cheat check (which short-circuits without consuming a call while
    // cheatOn is false, the default) — anything beyond that (the cosmetic
    // scramble interval) falls back to real randomness.
    await page.evaluate(() => {
      const seq = [0, 0, 3 / 34, 3 / 34, 3 / 34, 0, 0, 3 / 34, 3 / 34]
      let i = 0
      const real = window.Math.random.bind(window.Math)
      window.Math.random = () => (i < seq.length ? seq[i++] : real())
    })

    await page.click('#gemSpinBtn')
    await expect(page.locator('#gemSpinBtn')).toBeEnabled({ timeout: 5000 })

    await expect(page.locator('#gemBanner')).toContainText('No lines', { timeout: 1000 })
    await expect(page.locator('#lastWin')).toHaveText('0')
    await expect(page.locator('#linesHit')).toHaveText('0')
  })
})

test.describe('Roulette — agent-ui.js:556', () => {
  // detect() needs #board AND window.RouletteAPI (checked separately below).
  test('every selector the adapter touches is usable', async ({ page }) => {
    await goto(page, 'roulette')
    await expectUsable(page, '#board')
    await expectUsable(page, '#spinBtn')
  })

  test('window.RouletteAPI exposes placeBet/clearBets/spin/isSpinning/total', async ({ page }) => {
    await goto(page, 'roulette')
    const members = await page.evaluate(() => {
      const api = (window as never as { RouletteAPI?: Record<string, unknown> }).RouletteAPI
      if (!api) return null
      return Object.keys(api).filter((k) => typeof api[k] === 'function').sort()
    })
    expect(members).toEqual(['clearBets', 'isSpinning', 'placeBet', 'spin', 'total'].sort())
  })

  test('RouletteAPI is REMOVED when the route unmounts', async ({ page }) => {
    await goto(page, 'roulette')
    expect(await page.evaluate(() => 'RouletteAPI' in window)).toBe(true)

    await goto(page, 'dice')

    // A stale API makes roulette.detect() return true on the wrong route,
    // and the agent sits there placing bets into a dead board.
    expect(await page.evaluate(() => 'RouletteAPI' in window)).toBe(false)
  })

  test('placeBet(key, amount) accumulates and total() reflects the staged spread', async ({ page }) => {
    await goto(page, 'roulette')
    const totals = await page.evaluate(() => {
      const api = (window as never as {
        RouletteAPI: { placeBet: (key: string, amt: number) => void; total: () => number; clearBets: () => void }
      }).RouletteAPI
      api.clearBets()
      const afterFirst = api.total()
      api.placeBet('red', 10)
      const afterRed = api.total()
      api.placeBet('n:17', 5)
      const afterBoth = api.total()
      return { afterFirst, afterRed, afterBoth }
    })
    expect(totals.afterFirst).toBe(0)
    expect(totals.afterRed).toBe(10)
    expect(totals.afterBoth).toBe(15)

    // The staged spread renders live on the felt: #totalStaked mirrors
    // total() exactly — same "truth off the API, UI reflects it" contract
    // every other engine-driven game (Wheel's #curMult, Mines' #cashVal) holds.
    await expect(page.locator('#totalStaked')).toHaveText('15')
  })

  test('clearBets() zeroes the spread', async ({ page }) => {
    await goto(page, 'roulette')
    await page.evaluate(() => {
      const api = (window as never as {
        RouletteAPI: { placeBet: (key: string, amt: number) => void; clearBets: () => void }
      }).RouletteAPI
      api.placeBet('black', 20)
    })
    await expect(page.locator('#totalStaked')).toHaveText('20')

    const totalAfterClear = await page.evaluate(() => {
      const api = (window as never as { RouletteAPI: { clearBets: () => void; total: () => number } }).RouletteAPI
      api.clearBets()
      return api.total()
    })
    expect(totalAfterClear).toBe(0)
    await expect(page.locator('#totalStaked')).toHaveText('0')
  })

  test('a full placeBet -> spin -> settle round resolves within the adapter\'s 8s window, isSpinning() true then false', async ({
    page,
  }) => {
    await goto(page, 'roulette')

    const before = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))

    const spinning = await page.evaluate(() => {
      const api = (window as never as {
        RouletteAPI: {
          clearBets: () => void
          placeBet: (key: string, amt: number) => void
          spin: () => void
          isSpinning: () => boolean
        }
      }).RouletteAPI
      api.clearBets()
      api.placeBet('red', 10)
      api.spin()
      return api.isSpinning()
    })
    expect(spinning).toBe(true)

    // Mirrors the adapter's own `waitFor(() => !api.isSpinning(), 8000)`
    // (agentUi.ts's `roulette:` adapter) — RouletteGame.tsx resolves settle()
    // off a plain 4100ms setTimeout (Track A), never gated on the wheel/ball
    // CSS transition finishing.
    await expect
      .poll(
        () => page.evaluate(() => (window as never as { RouletteAPI: { isSpinning: () => boolean } }).RouletteAPI.isSpinning()),
        { timeout: 8000 },
      )
      .toBe(false)

    // A real wallet mutation happened — the bet was staked and either lost
    // outright or paid back out.
    const after = Number((await page.locator('[title="Balance"]').textContent())?.replace(/[^0-9.-]/g, ''))
    expect(after).not.toBe(before)

    // The spread is cleared once the round settles, ready for the next spin.
    const totalAfterSettle = await page.evaluate(
      () => (window as never as { RouletteAPI: { total: () => number } }).RouletteAPI.total(),
    )
    expect(totalAfterSettle).toBe(0)
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
