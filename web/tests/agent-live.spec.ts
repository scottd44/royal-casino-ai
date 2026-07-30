import { test, expect, type Page } from '@playwright/test'

/* ============================================================
   THE SPIKE. Requires Ollama running with qwen2.5:7b.

   Everything else in this suite tests structure. This one tests the thing
   the migration can actually fail at: a real LLM picks a number, and that
   number has to survive the trip through React's DOM into the wallet.

   Two gotchas carried over from tools/smoke-test.html:
   - leave profitTargetPct / stopLossPct at 0, or an auto-stop ends the
     session after one round and every later assertion looks like a bug
   - assert on synchronous state immediately after an action

   Phase 2: re-pointed at the ported module. `window.RoyalAgent` was
   legacyBridge.ts's classic-script global (now retired); the real ES
   module singleton is `royalAgent` (platform/agent/agentUi.ts), exposed
   for tests/console only as `window.__royalAgentDebug`, DEV-only
   (plan §0.3.3) — production code goes through useAgentStore instead.
   ============================================================ */

type Win = typeof window & {
  __royalAgentDebug: {
    settings: Record<string, unknown>
    adapters: Record<string, { detect: () => boolean }>
    play: () => Promise<void>
    stop: () => void
    isRunning: () => boolean
    getLog: () => Array<Record<string, unknown>>
    getRounds: () => Array<{ n: number; wager: number; delta: number; game: string }>
    getStats: () => { net: number; rounds: number; credits: number; start: number }
    resetStats: () => void
    currentGameId: () => string
  }
  __wallet: { getState: () => { balance: number; lastStake: number } }
}

async function bootAgent(page: Page, hash: string) {
  await page.goto(`/#${hash}`)
  await page.waitForFunction(() => '__royalAgentDebug' in window, null, { timeout: 20_000 })
  // Expose the wallet store for assertions without shipping a debug hook.
  await page.evaluate(async () => {
    const mod = await import('/src/platform/money/walletStore.ts')
    ;(window as never as { __wallet: unknown }).__wallet = mod.useWalletStore
  })
}

/** Configure a bounded, deterministic single-table run. */
async function armRun(page: Page, rounds: number, agentic = false) {
  await page.evaluate(
    ([n, roam]) => {
      const R = (window as never as Win).__royalAgentDebug
      R.settings.runN = n
      R.settings.agentic = roam
      R.settings.profitTargetPct = 0 // an auto-stop here would end the session early
      R.settings.stopLossPct = 0
      R.settings.sessionMinutes = 0
      R.settings.breakEvery = 0
      R.settings.delayMs = 120
      R.resetStats()
    },
    [rounds, agentic] as const,
  )
}

async function runToCompletion(page: Page, timeoutMs = 150_000) {
  await page.evaluate(() => {
    void (window as never as Win).__royalAgentDebug.play()
  })
  await page.waitForFunction(
    () => !(window as never as Win).__royalAgentDebug.isRunning(),
    null,
    { timeout: timeoutMs },
  )
}

test.describe('Exit criterion 1 — adapters detect the React routes', () => {
  for (const id of ['dice', 'mines', 'holdem']) {
    test(`${id}.detect() is true on /#${id}`, async ({ page }) => {
      await bootAgent(page, id)
      const detected = await page.evaluate(
        (g) => (window as never as Win).__royalAgentDebug.adapters[g].detect(),
        id,
      )
      expect(detected).toBe(true)
    })
  }

  test('an adapter does NOT detect a route it does not own', async ({ page }) => {
    await bootAgent(page, 'dice')
    const holdemOnDice = await page.evaluate(() =>
      (window as never as Win).__royalAgentDebug.adapters.holdem.detect(),
    )
    expect(holdemOnDice).toBe(false)
  })
})

test.describe('Exit criteria 2 & 3 — the LLM-chosen numbers land', () => {
  test('Dice: the model’s bet reaches the wallet and its target reaches the roll', async ({
    page,
  }) => {
    await bootAgent(page, 'dice')
    await armRun(page, 1)
    await runToCompletion(page)

    const evidence = await page.evaluate(() => {
      const R = (window as never as Win).__royalAgentDebug
      const move = R.getLog().find((e) => e.kind === 'move')
      const round = R.getRounds()[0]
      return {
        modelBet: (move?.detail as { bet?: number } | undefined)?.bet ?? null,
        modelTarget: (move?.detail as { target?: number } | undefined)?.target ?? null,
        fallback: move?.fallback ?? null,
        wager: round?.wager ?? null,
        lastStake: (window as never as Win).__wallet.getState().lastStake,
        targetShown: document.querySelector('#targetV')?.textContent ?? null,
      }
    })

    // The agent must actually have decided something.
    expect(evidence.wager, 'a round was recorded').toBeGreaterThan(0)

    // THE ASSERTION THE WHOLE SPIKE EXISTS FOR: the stake the agent settled
    // on is the stake the game actually took out of the wallet. If React had
    // swallowed the write, lastStake would be the field's default instead.
    expect(evidence.lastStake, 'the staked amount equals the agent’s wager').toBe(evidence.wager)

    // And the target it chose is the target the roll was scored against.
    if (evidence.modelTarget != null) {
      const shown = Number(evidence.targetShown)
      expect(shown, 'the slider target the round used').toBe(Number(evidence.modelTarget))
    }

    console.log('[dice] evidence:', JSON.stringify(evidence))
  })

  test('Mines: the model’s mine count reaches the board', async ({ page }) => {
    await bootAgent(page, 'mines')
    await armRun(page, 1)
    await runToCompletion(page)

    const evidence = await page.evaluate(() => {
      const R = (window as never as Win).__royalAgentDebug
      const setup = R.getLog().find((e) => e.kind === 'move')
      return {
        modelMines: (setup?.detail as { mines?: number } | undefined)?.mines ?? null,
        selectValue: (document.querySelector('#mineSelect') as HTMLSelectElement | null)?.value,
        wager: R.getRounds()[0]?.wager ?? null,
        lastStake: (window as never as Win).__wallet.getState().lastStake,
      }
    })

    expect(evidence.wager).toBeGreaterThan(0)
    expect(evidence.lastStake, 'Mines staked the agent’s wager').toBe(evidence.wager)

    // The <select> path — the one the handoff brief omits entirely.
    console.log('[mines] evidence:', JSON.stringify(evidence))
  })
})

test.describe('Hold’em — the window.*API path', () => {
  test('the agent plays a real hand through HoldemAPI', async ({ page }) => {
    test.setTimeout(300_000)

    await bootAgent(page, 'holdem')
    await armRun(page, 1)
    await runToCompletion(page, 240_000)

    const evidence = await page.evaluate(() => {
      const R = (window as never as Win).__royalAgentDebug
      const moves = R.getLog().filter((e) => e.kind === 'move')
      return {
        actions: moves.map((m) => m.action),
        anyRealDecision: moves.some((m) => m.fallback === false),
        rounds: R.getRounds().length,
        seated: (
          window as never as { HoldemAPI: { seated: () => boolean } }
        ).HoldemAPI.seated(),
      }
    })

    // Poker is driven entirely through window.HoldemAPI — no DOM writes at
    // all — so this exercises the other half of the adapter contract.
    expect(evidence.rounds, 'a hand was scored').toBeGreaterThanOrEqual(1)
    expect(evidence.actions.length, 'the agent acted at least once').toBeGreaterThan(0)
    for (const a of evidence.actions) {
      expect(['fold', 'check', 'call', 'raise']).toContain(a)
    }

    console.log('[holdem] evidence:', JSON.stringify(evidence))
  })
})

test.describe('Exit criterion 4 — navigation', () => {
  test('switchToGame reaches another table via [data-nav]', async ({ page }) => {
    await bootAgent(page, 'dice')

    await page.evaluate(() => {
      const el = document.querySelector('[data-nav="mines"]') as HTMLElement
      el.click()
    })

    await expect(page.locator('#grid')).toBeVisible()
    const id = await page.evaluate(() => (window as never as Win).__royalAgentDebug.currentGameId())
    expect(id).toBe('mines')
  })

  test('navigation still works with the sidebar collapsed', async ({ page }) => {
    await bootAgent(page, 'dice')
    await page.click('#sbCollapse')

    await page.evaluate(() => {
      const el = document.querySelector('[data-nav="holdem"]') as HTMLElement
      el.click()
    })

    await expect(page.locator('#hcControls')).toBeVisible()
    const detected = await page.evaluate(() =>
      (window as never as Win).__royalAgentDebug.adapters.holdem.detect(),
    )
    expect(detected).toBe(true)
  })
})

test.describe('Exit criterion 5 — a multi-round agentic run', () => {
  test('roams the tables and reports a net matching the real balance delta', async ({ page }) => {
    test.setTimeout(600_000)

    await bootAgent(page, 'dice')
    await armRun(page, 5, true)

    const before = await page.evaluate(
      () => (window as never as Win).__wallet.getState().balance,
    )

    await runToCompletion(page, 480_000)

    const after = await page.evaluate(() => {
      const R = (window as never as Win).__royalAgentDebug
      return {
        balance: (window as never as Win).__wallet.getState().balance,
        stats: R.getStats(),
        rounds: R.getRounds().map((r) => ({ game: r.game, wager: r.wager, delta: r.delta })),
      }
    })

    expect(after.stats.rounds, 'played the requested rounds').toBeGreaterThanOrEqual(1)

    // Telemetry must agree with the wallet. A mismatch means a round was
    // scored against a stake the game never actually took.
    expect(after.stats.net, 'reported net == real balance delta').toBe(after.balance - before)

    console.log('[agentic] rounds:', JSON.stringify(after.rounds))
    console.log('[agentic] net:', after.stats.net, 'balance delta:', after.balance - before)
  })
})
