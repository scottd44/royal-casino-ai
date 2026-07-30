import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1050 } })
await p.goto('http://localhost:5176/#snakes')
await p.waitForLoadState('networkidle')
await p.evaluate(() => { window.SnakesAPI.setDifficulty(9); window.SnakesAPI.setInstant(true) })
for (let i = 0; i < 5; i++) {
  await p.evaluate(() => window.SnakesAPI.roll())
  await p.waitForTimeout(150)
  const busy = await p.evaluate(() => window.SnakesAPI.busy())
  const inRound = await p.evaluate(() => window.SnakesAPI.inRound())
  if (!inRound) break
}
await p.screenshot({ path: '/tmp/snakes_after_resolved.png' })
await b.close()
