import { test, expect, type Page } from '@playwright/test'

/* ============================================================
   Icon-registry guardrails — PHASE_1_MOTION_ICONS_PLAN.md §11,
   HANDOFF §6.8 and §6.9, DEVELOPMENT_GUIDE §2.

   Two rules, both of which shipped as bugs in the vanilla build:

   1. Never guess an icon name. Lucide has no snake and no rock; the guesses
      rendered a SWIMMER and a COFFEE MUG in production. The registry's
      static-import design makes a bad name a compile error, so what's left
      to test at runtime is that every registered name actually PAINTS —
      a name can resolve to a component and still render nothing.

   2. No emoji in the chrome. Emoji ignore `color`, ignore stroke weight and
      render as a different picture per OS. Only card suits and dice pips
      survive, deliberately.
   ============================================================ */

const ROUTES = ['', 'dice', 'mines', 'holdem']

/** The deliberate exceptions, DEVELOPMENT_GUIDE §2: card suits and dice pips. */
const ALLOWED = /[♠♡♢♣♤♥♦♧⚀-⚅]/u

/**
 * Emoji proper — pictographic codepoints. Deliberately does NOT match the
 * Miscellaneous Symbols block that contains ♠♥♦♣, nor U+2680-2685 (dice
 * pips), which are the two allowlisted cases.
 */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u

async function goto(page: Page, hash: string) {
  await page.goto(`/#${hash}`)
  await page.waitForLoadState('networkidle')
}

test.describe('No emoji in the chrome', () => {
  for (const route of ROUTES) {
    test(`route "${route || 'lobby'}" renders no emoji`, async ({ page }) => {
      await goto(page, route)

      const offenders = await page.evaluate(() => {
        const found: { text: string; where: string }[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node: Node | null = walker.nextNode()
        while (node) {
          const text = node.textContent ?? ''
          if (text.trim()) {
            const el = node.parentElement
            found.push({
              text,
              where: el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}` : '?',
            })
          }
          node = walker.nextNode()
        }
        return found
      })

      const bad = offenders.filter((o) => EMOJI.test(o.text) && !ALLOWED.test(o.text))
      expect(
        bad,
        `emoji found in chrome: ${bad.map((b) => `${b.where} -> ${JSON.stringify(b.text)}`).join(' | ')}`,
      ).toEqual([])
    })
  }
})

test.describe('Icons paint', () => {
  test('every rendered icon is a non-empty svg', async ({ page }) => {
    for (const route of ROUTES) {
      await goto(page, route)

      const broken = await page.evaluate(() => {
        const bad: string[] = []
        for (const svg of Array.from(document.querySelectorAll('svg.ico'))) {
          // A registered-but-empty icon renders an <svg> with no geometry —
          // exactly what a silently-missing mark looks like.
          const hasGeometry = svg.querySelector('path, circle, rect, line, polyline, polygon')
          if (!hasGeometry) bad.push(svg.outerHTML.slice(0, 120))
        }
        return bad
      })

      expect(broken, `empty icon(s) on route "${route}"`).toEqual([])
    }
  })

  test('icons inherit currentColor rather than hard-coding a fill', async ({ page }) => {
    await goto(page, 'dice')

    // An icon must behave like text as far as the design system is concerned
    // (DEVELOPMENT_GUIDE §2) — that is the whole reason emoji are banned and
    // stroke SVGs are used instead.
    const strokes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('svg.ico')).map((s) => s.getAttribute('stroke')),
    )
    expect(strokes.length).toBeGreaterThan(0)
    for (const stroke of strokes) {
      expect(stroke).toBe('currentColor')
    }
  })

  test('the sidebar draws an icon for every game', async ({ page }) => {
    await goto(page, 'dice')

    // registry.ts now carries `icon` per game, so sidebar, lobby card and
    // page title cannot drift apart. If a game's icon goes missing this is
    // where it shows up.
    for (const id of ['dice', 'mines', 'holdem']) {
      const icon = page.locator(`[data-nav="${id}"] svg.ico`).first()
      await expect(icon, `[data-nav="${id}"] should draw an icon`).toBeAttached()
    }
  })
})
