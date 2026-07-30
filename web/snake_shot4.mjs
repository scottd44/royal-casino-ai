import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1050 } })
await p.goto('http://localhost:5176/#snakes')
await p.waitForLoadState('networkidle')
await p.evaluate(() => { window.SnakesAPI.setDifficulty(1); window.SnakesAPI.setInstant(true) })
for (let i = 0; i < 20; i++) {
  await p.evaluate(() => window.SnakesAPI.roll())
  await p.waitForTimeout(100)
  const inRound = await p.evaluate(() => window.SnakesAPI.inRound())
  const rolls = await p.evaluate(() => window.SnakesAPI.rolls())
  if (!inRound || rolls === 0) break
  if (rolls >= 1) break
}
await p.screenshot({ path: '/tmp/snakes_after_safe.png' })
await b.close()
