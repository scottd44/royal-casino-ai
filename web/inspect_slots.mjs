import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.goto('http://localhost:5174/#slots')
await page.waitForLoadState('networkidle')
const info = await page.evaluate(() => {
  const rect = (el) => el ? { h: el.getBoundingClientRect().height } : null
  return {
    appMain: rect(document.querySelector('.app-main')),
    leftPanel: rect(document.querySelectorAll('.panel')[0]),
    reels: rect(document.querySelector('#reels')),
    paytable: rect(document.querySelector('.paytable')),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
