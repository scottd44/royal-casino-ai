import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1050 } })
await p.goto('http://localhost:5176/#snakes')
await p.waitForLoadState('networkidle')
await p.screenshot({ path: '/tmp/snakes_after_idle.png' })

// trigger a roll via API for a mid-round shot with instant off first? Use non-instant to see token, then wait
await p.evaluate(() => { window.SnakesAPI.setDifficulty(3) })
await p.click('#snRollBtn')
await p.waitForTimeout(900)
await p.screenshot({ path: '/tmp/snakes_after_midroll.png' })
await b.close()
