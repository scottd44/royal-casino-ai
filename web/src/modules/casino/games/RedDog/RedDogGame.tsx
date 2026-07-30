import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { GameLayout, Panel, PageHead, Button, Stat, cn } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import type { ToastType } from '@/platform/ui/toast'
import { Card } from '../../components/Card'
import type { CardSuit } from '../../components/Card'
import { Felt } from '../../components/Felt'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Red Dog (Acey-Deucey) — ported from js/games/reddog.js. Two cards are
   dealt; the "spread" is how many ranks sit strictly between them. A
   third card is drawn: land it inside the spread and you win (odds
   shrink as the spread widens: 5:1 / 4:1 / 2:1 / 1:1 for spread
   1/2/3/4+). Consecutive cards (spread 0) are an automatic push. A pair
   draws a third card immediately — three of a kind pays 11:1, otherwise
   push. On a real spread you may Call (leave your bet) or Raise (double
   it) before the third card falls.

   AGENT CONTRACT (agent-ui.js, grep "  reddog:") — every one of these is
   load-bearing:
     detect()   !!$("#rdDeal") && !!$("#rdCards")
     play()     applyBet() -> #betInput, click #rdDeal, then
                waitFor(() => !$("#rdDeal").disabled || $("#rdActRow").style.display === "flex", 4000)
                — if the act row is live: reads
                parseInt($("#rdSpreadV").textContent, 10) (NaN -> 0, which is
                exactly what "Pair"/"Consecutive" parse to — see the note on
                spreadVRef below, don't "fix" that) and $("#rdPays").textContent,
                raises (2x) only on a spread >= 7, otherwise calls, clicks
                #rdCall or #rdRaise, then waits up to 4s for #rdDeal to
                re-enable. Reads #rdResult for the outcome text.

   *** THE #rdActRow LANDMINE — same one CasinoWarGame.tsx's #warWarRow
   hits, see that file's header for the full reasoning. Short version:
   agent-ui.js's spread-check is `$("#rdActRow").style.display === "flex"`,
   the element's literal INLINE style property read straight off the DOM
   node — a Tailwind `flex` class or a stylesheet rule does NOT satisfy
   this, only a real inline `style="display:flex"` attribute does. So
   `#rdActRow`'s `style` prop below is driven directly off `acting`
   (`pendingRef.current !== null`) and NOTHING ELSE: `style={{display:'flex'}}`
   while live, `undefined` (not `display:'none'`) otherwise — never a class.
   That write happens SYNCHRONOUSLY inside deal()'s own spread branch
   (`pendingRef.current = {...}` then `repaint()`), never inside a deferred
   animation callback, so the DOM commit lands well within the adapter's
   60ms poll interval.

   Round state (the dealt hand, the pending raise/call spread, busy/result)
   lives in REFS, not useState — same reasoning as CasinoWar/Baccarat/Mines:
   deal() and resolveThird() each read-then-write hand state synchronously
   within one click handler. `repaint()` (a tick useState) is the only thing
   that asks React to re-read the refs.
   ============================================================ */

type HandCard = { rank: string; suit: CardSuit }
type Pending = { lo: number; hi: number; spread: number; odds: number }
type Result = { msg: string; tone: ToastType }

const SUITS: CardSuit[] = ['♠', '♣', '♥', '♦']
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

/** Card value for comparison — Aces high, matches reddog.js's `rv()`. */
function rv(c: HandCard): number {
  return RANKS.indexOf(c.rank) + 2
}

function buildDeck(): HandCard[] {
  const d: HandCard[] = []
  SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })))
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

/** A card of a specific rank value, random suit — reddog.js's `cardOfVal`,
 *  used only by the rig to force a pair into trips or a raise/call into
 *  the winning window. */
function cardOfVal(v: number): HandCard {
  return { rank: RANKS[v - 2], suit: SUITS[Math.floor(Math.random() * SUITS.length)] }
}

/** reddog.js's `oddsFor`: spread 1 -> 5:1, 2 -> 4:1, 3 -> 2:1, 4+ -> 1:1. */
function oddsFor(spread: number): number {
  return spread === 1 ? 5 : spread === 2 ? 4 : spread === 3 ? 2 : 1
}

/** Inclusive random int, reddog.js's own `Casino.randInt`. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const TONE_COLOR: Record<ToastType, string> = {
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
  info: 'var(--color-gold-2)',
}

/** The third-card slot: a "?" placeholder until it's actually drawn and
 *  revealed, matching reddog.js's own `#rdGap` -> `outerHTML` swap. Sits
 *  visually BETWEEN the first two cards (legacy markup order is
 *  card1, gap, card2) — the "does it land between" table, literally.
 *  Sized to match the `lg` Card box (96x136) so the gap reads as a real
 *  third seat in the row rather than a small orphaned square between two
 *  now much-larger cards. */
function GapSlot({ mobile }: { mobile: boolean }) {
  return (
    <div
      className={cn(
        'rd-gap flex items-center justify-center rounded-[10px] border text-muted',
        mobile ? 'w-14 h-20 text-lg' : 'w-24 h-[136px] text-3xl',
      )}
      style={{ borderColor: 'var(--glass-line)' }}
    >
      ?
    </div>
  )
}

export default function RedDogGame(): JSX.Element {
  const betRef = useBetRef()
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const deckRef = useRef<HandCard[]>([])
  const c1Ref = useRef<HandCard | null>(null)
  const c2Ref = useRef<HandCard | null>(null)
  const c3Ref = useRef<HandCard | null>(null)
  const pairRef = useRef(false)
  const pendingRef = useRef<Pending | null>(null)
  const wagerRef = useRef(0)
  const busyRef = useRef(false)
  const resultRef = useRef<Result | null>(null)
  const spreadVRef = useRef('—')
  const paysRef = useRef('—')
  const spreadMsgRef = useRef<{ text: string; color: string } | null>(null)
  const lastNetRef = useRef<number | null>(null)
  const bestRef = useRef(0)
  // Bumped only alongside a genuine new card write (c1Ref/c2Ref in deal(),
  // c3Ref in the two setTimeout callbacks below) — Red Dog's Card never
  // takes a `faceDown` prop at all (c1/c2/c3 are conditionally rendered
  // `card && <Reveal>`, never toggled in place), so there's no
  // VideoPoker-style faceDown-only bump to guard against here.
  const dealGenRef = useRef(0)
  const thirdGenRef = useRef(0)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
    },
    [],
  )

  const draw = useCallback((): HandCard => {
    if (deckRef.current.length < 8) deckRef.current = buildDeck()
    return deckRef.current.pop() as HandCard
  }, [])

  /** Ends the round: posts the result, clears the pending spread (also the
   *  thing hiding #rdActRow), re-enables #rdDeal/#betInput. Payout, when
   *  there is one, is always applied by the caller first — reddog.js's own
   *  `endRound(net, msg, type)` never pays out itself either. */
  const finish = useCallback(
    (net: number, msg: string, tone: ToastType) => {
      resultRef.current = { msg, tone }
      lastNetRef.current = net
      if (net > bestRef.current) bestRef.current = net
      busyRef.current = false
      pendingRef.current = null
      sound.play(tone === 'win' ? (net >= wagerRef.current * 4 ? 'bigwin' : 'win') : tone === 'lose' ? 'lose' : 'cashout')
      repaint()
    },
    [repaint],
  )

  const deal = useCallback(() => {
    if (busyRef.current) return
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      toast('Not enough cash for that bet.', 'lose')
      return
    }
    wagerRef.current = bet
    busyRef.current = true
    pendingRef.current = null
    pairRef.current = false
    resultRef.current = null
    spreadMsgRef.current = null
    c3Ref.current = null

    const c1 = draw()
    const c2 = draw()
    c1Ref.current = c1
    c2Ref.current = c2
    dealGenRef.current += 1
    sound.play('tick')
    const a = rv(c1)
    const b = rv(c2)

    if (a === b) {
      // Pair — a third card decides trips (11:1) or push.
      pairRef.current = true
      spreadVRef.current = 'Pair'
      paysRef.current = '11:1 on trips'
      let c3 = draw()
      if (cheatWin()) c3 = cardOfVal(a)
      repaint()
      revealTimerRef.current = setTimeout(() => {
        c3Ref.current = c3
        thirdGenRef.current += 1
        if (rv(c3) === a) {
          payout(bet * 12)
          finish(bet * 11, `Trip ${c1.rank}s! +${fmt(bet * 11)}!`, 'win')
        } else {
          payout(bet)
          finish(0, `Pair of ${c1.rank}s, no trips — push.`, 'info')
        }
      }, 500)
      return
    }

    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const spread = hi - lo - 1
    if (spread === 0) {
      // Consecutive ranks — automatic push, no raise/call step.
      spreadVRef.current = 'Consecutive'
      paysRef.current = 'push'
      repaint()
      revealTimerRef.current = setTimeout(() => {
        payout(bet)
        finish(0, 'Consecutive cards — push, bet returned.', 'info')
      }, 450)
      return
    }

    const odds = oddsFor(spread)
    // This write IS what puts #rdActRow's inline style at `display:flex`
    // on the next render — see the render section and the file header.
    pendingRef.current = { lo, hi, spread, odds }
    spreadVRef.current = String(spread)
    paysRef.current = `${odds}:1`
    spreadMsgRef.current = { text: `Spread ${spread} — pays ${odds}:1. Raise or call?`, color: 'var(--color-gold-2)' }
    repaint()
  }, [betRef, draw, finish, payout, placeBet, repaint])

  const resolveThird = useCallback(
    (wager: number) => {
      const pending = pendingRef.current
      if (!pending) return
      const { lo, hi, odds } = pending
      // Hiding the row is also a direct, synchronous state write — same
      // requirement as showing it, just the reverse edge.
      pendingRef.current = null
      spreadMsgRef.current = null
      repaint()

      let c3 = draw()
      if (cheatWin() && !(rv(c3) > lo && rv(c3) < hi)) c3 = cardOfVal(randInt(lo + 1, hi - 1))
      revealTimerRef.current = setTimeout(() => {
        c3Ref.current = c3
        thirdGenRef.current += 1
        if (rv(c3) > lo && rv(c3) < hi) {
          payout(wager * (odds + 1))
          finish(wager * odds, `${c3.rank} lands between — +${fmt(wager * odds)}!`, 'win')
        } else {
          finish(-wager, `${c3.rank} is outside. Lost ${money(wager)}.`, 'lose')
        }
      }, 450)
    },
    [draw, finish, payout, repaint],
  )

  const call = useCallback(() => resolveThird(wagerRef.current), [resolveThird])

  const raise = useCallback(() => {
    if (!pendingRef.current) return
    if (!placeBet(wagerRef.current)) {
      toast('Not enough to raise.', 'lose')
      return
    }
    resolveThird(wagerRef.current * 2)
  }, [placeBet, resolveThird])

  /* ---------------- render ---------------- */
  const busy = busyRef.current
  const acting = pendingRef.current !== null
  const c1 = c1Ref.current
  const c2 = c2Ref.current
  const c3 = c3Ref.current
  const result = resultRef.current
  const spreadMsg = spreadMsgRef.current
  const lastNet = lastNetRef.current

  const lastResultText =
    lastNet == null ? '—' : lastNet > 0 ? `+${fmt(lastNet)}` : lastNet < 0 ? `-${fmt(-lastNet)}` : 'push'

  const isMobile = useIsMobile()

  return (
    <div>
      <PageHead
        title="Red Dog"
        sub="Bet the third card lands between the first two. Wider spread = better odds of hitting, smaller payout. Raise on a big spread."
        icon="circle-dot"
      />

      <GameLayout>
        <Panel className="min-w-0">
          <Felt>
            <div className={cn('flex flex-col items-center justify-center py-2', isMobile ? 'min-h-[160px]' : 'min-h-[260px]')}>
              <div
                className={cn('cards rd-cards flex flex-wrap justify-center items-center', isMobile ? 'gap-2' : 'gap-5')}
                id="rdCards"
              >
                {c1 ? (
                  <Reveal key={`c1-${dealGenRef.current}`} as="div" preset="scaleIn" duration={0.25}>
                    <Card rank={c1.rank} suit={c1.suit} size="lg" />
                  </Reveal>
                ) : (
                  <Card rank="A" suit="♠" faceDown size="lg" className="opacity-40" />
                )}
                {c1 && c2 ? (
                  c3 ? (
                    <Reveal key={`c3-${thirdGenRef.current}`} as="div" preset="scaleIn" duration={0.25}>
                      <Card rank={c3.rank} suit={c3.suit} size="lg" />
                    </Reveal>
                  ) : (
                    <GapSlot mobile={isMobile} />
                  )
                ) : (
                  <GapSlot mobile={isMobile} />
                )}
                {c2 ? (
                  <Reveal key={`c2-${dealGenRef.current}`} as="div" preset="scaleIn" duration={0.25}>
                    <Card rank={c2.rank} suit={c2.suit} size="lg" />
                  </Reveal>
                ) : (
                  <Card rank="K" suit="♦" faceDown size="lg" className="opacity-40" />
                )}
              </div>

              <div className="rd-spread text-sm text-center mt-4 min-h-[20px]" id="rdSpread" style={{ color: spreadMsg?.color }}>
                {spreadMsg?.text ?? ''}
              </div>

              <div
                className="bj-result text-center text-sm mt-2 min-h-[20px]"
                id="rdResult"
                style={{ color: result ? TONE_COLOR[result.tone] : undefined }}
              >
                {result?.msg ?? 'Place a bet and deal.'}
              </div>
            </div>
          </Felt>
        </Panel>

        <Panel>
          <BetField inputRef={betRef} defaultValue={25} />

          <Button id="rdDeal" variant="green" size="lg" block disabled={busy} onClick={deal}>
            Deal
          </Button>

          {/* #rdActRow — THE inline-style contract element (see the file
              header). `style` carries a literal `display: 'flex'` ONLY
              while `acting` is true; it is `undefined` (not
              `display: 'none'`) otherwise, so `.style.display` reads
              exactly `''` when hidden and exactly `'flex'` when live,
              matching agent-ui.js's `=== "flex"` check precisely either
              way. Visual show/hide is handled separately by the `hidden`
              Tailwind class below — never let that class carry the
              `display` value the agent reads. */}
          <div
            id="rdActRow"
            className={cn('hc-actrow flex gap-2 mt-2.5', !acting && 'hidden')}
            style={acting ? { display: 'flex' } : undefined}
          >
            <Button variant="blue" id="rdCall" onClick={call} className="flex-1">
              Call
            </Button>
            <Button variant="purple" id="rdRaise" onClick={raise} className="flex-1">
              Raise (2×)
            </Button>
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-4">
            <Stat k="Spread" v={spreadVRef.current} id="rdSpreadV" />
            <Stat
              k="Pays"
              v={
                <span className="multiplier-tag" id="rdPays">
                  {paysRef.current}
                </span>
              }
            />
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-2">
            <Stat k="Last result" v={lastResultText} />
            <Stat k="Best win" v={fmt(bestRef.current)} />
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
