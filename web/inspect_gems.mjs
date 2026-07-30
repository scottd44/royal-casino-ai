import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://localhost:5174/#gems')
await page.waitForLoadState('networkidle')
const info = await page.evaluate(() => {
  const sel = (s) => document.querySelector(s)
  const rect = (el) => el ? { h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width } : null
  return {
    appMain: rect(document.querySelector('.app-main')),
    panels: [...document.querySelectorAll('.panel, [class*="panel"]')].map(el => ({cls: el.className, h: el.getBoundingClientRect().height})),
    gemGrid: rect(sel('#gemGrid')),
    gemHousing: rect(document.querySelector('.gem-housing')),
    paytable: rect(document.querySelector('.paytable')),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
