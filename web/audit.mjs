import { chromium } from 'playwright'

const routes = ['blackjack','dice','mines','holdem','limbo','plinko','crash','wheel','chicken','rps','coinflip','snakes','moles','keno','battleship','hilo','videopoker','baccarat','casinowar','threecard','reddog','slots','gems']

const viewports = [
  { w: 1400, h: 900 },
  { w: 1400, h: 800 },
]

const browser = await chromium.launch()
for (const vp of viewports) {
  console.log(`\n=== Viewport ${vp.w}x${vp.h} ===`)
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } })
  for (const route of routes) {
    await page.goto(`http://localhost:5174/#${route}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300)
    const result = await page.evaluate(() => {
      const el = document.querySelector('.app-main')
      if (!el) return null
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
    })
    if (!result) {
      console.log(`${route}: NO .app-main FOUND`)
      continue
    }
    const overflow = result.scrollHeight - result.clientHeight
    const flag = overflow > 20 ? '  <-- OVERFLOW' : ''
    console.log(`${route}: scrollHeight=${result.scrollHeight} clientHeight=${result.clientHeight} overflow=${overflow}${flag}`)
  }
  await page.close()
}
await browser.close()
