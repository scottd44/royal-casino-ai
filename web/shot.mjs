import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://localhost:5174/#gems')
await page.waitForLoadState('networkidle')
await page.screenshot({ path: '/tmp/gems.png' })
await browser.close()
