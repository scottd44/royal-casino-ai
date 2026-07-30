import { test, expect } from '@playwright/test'

test('keno visual check', async ({ page }) => {
  await page.goto('http://localhost:5173/#/keno')
  await page.waitForSelector('#knBoard')
  // force a guaranteed win via cheat hook if present, else just play normally repeatedly
  const tiles = page.locator('#knBoard .tile')
  for (let i = 0; i < 10; i++) {
    await tiles.nth(i).click()
  }
  await page.click('#knPlay')
  await page.waitForTimeout(600)
  await page.screenshot({ path: '/tmp/keno-result.png', fullPage: false })
})
