import { test } from '@playwright/test'

test('blackjack hole card flip DOM poll', async ({ page }) => {
  await page.goto('/#blackjack')
  await page.waitForLoadState('networkidle')
  await page.fill('#betInput', '10')
  await page.click('#dealBtn')
  await page.waitForTimeout(400)
  if (await page.locator('#standBtn').isDisabled()) {
    console.log('round already resolved on deal, skipping')
    return
  }

  const result = await page.evaluate(async () => {
    const cards = document.querySelectorAll('#dealerCards .card')
    const holeCard = cards[1] as HTMLElement // index 1 is hideHole target
    const inner = holeCard.querySelector(':scope > div') as HTMLElement // motion.div child
    const samples: Array<Record<string, unknown>> = []
    const start = performance.now()
    const poll = () => {
      const rankTops = holeCard.querySelectorAll('.rank-top')
      const rankTexts = Array.from(rankTops).map((n) => n.textContent)
      samples.push({
        t: Math.round(performance.now() - start),
        transform: inner ? getComputedStyle(inner).transform : null,
        inlineTransform: inner ? inner.style.transform : null,
        cardClass: holeCard.className,
        rankTexts,
        outerRect: holeCard.getBoundingClientRect().width,
      })
    }
    poll()
    ;(document.getElementById('standBtn') as HTMLButtonElement).click()
    const t0 = performance.now()
    while (performance.now() - t0 < 1500) {
      poll()
      await new Promise((r) => setTimeout(r, 15))
    }
    return samples
  })

  // Print a compact log.
  for (const s of result) {
    console.log(JSON.stringify(s))
  }
})
