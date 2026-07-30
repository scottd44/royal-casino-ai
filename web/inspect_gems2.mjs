import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://localhost:5174/#gems')
await page.waitForLoadState('networkidle')
const info = await page.evaluate(() => {
  const rect = (el) => el ? { h: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top } : null
  return {
    appMain: rect(document.querySelector('.app-main')),
    pageHead: rect(document.querySelector('.app-main > div > *:first-child')),
    gameLayout: rect(document.querySelector('.app-main').firstElementChild),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
