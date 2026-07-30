import { useCallback, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Button, Stat, cn } from '@/platform/ui'
import { Icon } from '@/platform/icons'
import { Reveal } from '@/platform/motion'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import type { ToastType } from '@/platform/ui/toast'
import { Card } from '../../components/Card'
import type { CardSuit } from '../../components/Card'
import { Felt } from '../../components/Felt'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'

/* ============================================================
   Casino War — ported from js/games/casinowar.js. Highest card wins (Aces
   high, suits irrelevant), 1:1. A tie sends you to War: match your
   original bet, burn three cards, one more card each — tie-or-better on
   the raise wins even money (the original ante pushes); lose and you lose
   both bets. Surrendering a tie instead returns half your original bet.

   AGENT CONTRACT (agent-ui.js, grep "  casinowar:") — every one of these is
   load-bearing:
     detect()   !!$("#warDeal") && !!$("#warP")
     play()     applyBet() -> #betInput, click #warDeal, then
                waitFor(() => !$("#warDeal").disabled || $("#warWarRow").style.display === "flex", 4000)
                — if a war is live, click #warGo, then wait up to 4s for
                #warDeal to re-enable. Reads #warResult for the outcome text.

   *** THE #warWarRow LANDMINE ***
   The adapter's war-check is `$("#warWarRow").style.display === "flex"` —
   the element's literal INLINE style property, read straight off the DOM
   node, NOT the resolved/computed CSS display value. A Tailwind `flex`
   class or a stylesheet rule setting `display:flex` on some `.war-row`
   class would NOT satisfy this: `.style.display` only ever reflects an
   inline `style="display: ..."` attribute (or a JS `el.style.display = `
   write). So `#warWarRow`'s `style` prop below is driven directly off
   `tie` state and NOTHING ELSE — see the render section for the literal
   `style={tie ? { display: 'flex' } : undefined}` — do not "clean this up"
   into a Tailwind class or the agent will stall on every tied round until
   its 4s timeout, forever.

   That write also happens SYNCHRONOUSLY inside deal()'s own tie branch
   (setting `tieRef.current = true` then `repaint()`), never inside a
   Framer Motion `onAnimationComplete` or any other deferred callback. React
   commits the DOM update (and therefore the real inline `style.display`)
   before the click handler returns, well within the adapter's 60ms poll
   interval — Track A (the agent's poll) is never gated on Track B (any
   visual polish/animation this component might apply elsewhere).

   Round state lives in REFS, not useState, same reasoning as
   Blackjack/Holdem/Mines: deal() must read-then-write pRef/dRef/tieRef
   synchronously within one click handler (checking the tie condition on
   the cards it just drew) without waiting on a React re-render round-trip.
   `repaint()` is the only thing that asks React to re-read the refs.
   ============================================================ */

type HandCard = { rank: string; suit: CardSuit }

const SUITS: CardSuit[] = ['♠', '♣', '♥', '♦']
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

/** Card value for comparison — Aces high, matches casinowar.js's `rv()`. */
function rv(c: HandCard): number {
  return RANKS.indexOf(c.rank) + 2
}

function buildDeck(): HandCard[] {
  const d: HandCard[] = []
  SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })))
  // Fisher-Yates shuffle, verbatim.
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

type Result = { msg: string; tone: ToastType }

const TONE_COLOR: Record<ToastType, string> = {
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
  info: 'var(--color-gold-2)',
}

/** One dealt-card slot: the real card once one exists, a decorative
 *  face-down placeholder before the first deal of the session (mirrors
 *  casinowar.js's own `cardHTML(null, true)` idle state).
 *  `revealKey` (dealGenRef/warGenRef below) only bumps in the same write
 *  that assigns a genuinely NEW card into `card` — never a bare faceDown
 *  toggle on an already-shown card — so this never races Card's own
 *  internal flip with an unnecessary remount. */
function Seat({
  label,
  card,
  revealKey,
  id,
}: {
  label: string
  card: HandCard | null
  revealKey: number
  id?: string
}) {
  return (
    <div className="war-seat text-center">
      <div className="hand-label text-sm text-muted mb-2">{label}</div>
      <div id={id} className="cards flex justify-center">
        <Reveal key={revealKey} as="div" preset="scaleIn" duration={0.25}>
          {card ? <Card rank={card.rank} suit={card.suit} size="lg" /> : <Card rank="A" suit="♠" faceDown size="lg" />}
        </Reveal>
      </div>
    </div>
  )
}

export default function CasinoWarGame() {
  const betRef = useBetRef()
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const deckRef = useRef<HandCard[]>([])
  const pRef = useRef<HandCard | null>(null)
  const dRef = useRef<HandCard | null>(null)
  const warPRef = useRef<HandCard | null>(null)
  const warDRef = useRef<HandCard | null>(null)
  const wagerRef = useRef(0)
  const busyRef = useRef(false)
  const tieRef = useRef(false)
  const resultRef = useRef<Result | null>(null)
  const lastNetRef = useRef<number | null>(null)
  const bestRef = useRef(0)
  const dealGenRef = useRef(0)
  const warGenRef = useRef(0)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const draw = useCallback((): HandCard => {
    if (deckRef.current.length < 12) deckRef.current = buildDeck()
    return deckRef.current.pop() as HandCard
  }, [])

  /** Ends the round: sets the result banner, re-enables #warDeal/#betInput,
   *  and tracks the "Last result"/"Best win" stats. Payout, when there is
   *  one, is always applied by the caller BEFORE this runs (casinowar.js's
   *  own `done(net, msg, type)` never pays out itself either). */
  const finish = useCallback((net: number, msg: string, tone: ToastType) => {
    resultRef.current = { msg, tone }
    lastNetRef.current = net
    if (net > bestRef.current) bestRef.current = net
    busyRef.current = false
    tieRef.current = false
    repaint()
  }, [repaint])

  const deal = useCallback(() => {
    if (busyRef.current) return
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      toast('Not enough cash for that bet.', 'lose')
      return
    }
    wagerRef.current = bet
    busyRef.current = true
    tieRef.current = false
    warPRef.current = null
    warDRef.current = null
    resultRef.current = null

    let p = draw()
    let d = draw()
    // Rigged odds (casinowar.js:106): redraw until the player is strictly
    // ahead, capped so a pathological deck can't spin forever.
    if (cheatWin() && rv(p) <= rv(d)) {
      let guard = 0
      while (guard++ < 200 && rv(p) <= rv(d)) {
        p = draw()
        d = draw()
      }
    }
    pRef.current = p
    dRef.current = d
    dealGenRef.current += 1
    repaint()

    if (rv(p) > rv(d)) {
      payout(bet * 2)
      finish(bet, `Your ${p.rank} beats ${d.rank} — +${fmt(bet)}!`, 'win')
    } else if (rv(p) < rv(d)) {
      finish(-bet, `Dealer's ${d.rank} beats your ${p.rank}. You lose.`, 'lose')
    } else {
      // Tie -> war. `tieRef.current = true` here IS the write that puts
      // #warWarRow's inline style at `display:flex` on the next render —
      // see the render section and the file-level comment above.
      tieRef.current = true
      resultRef.current = { msg: `Tie at ${p.rank}! Go to war or surrender.`, tone: 'info' }
      repaint()
    }
  }, [betRef, placeBet, draw, finish, payout, repaint])

  const surrender = useCallback(() => {
    if (!tieRef.current) return
    const back = Math.floor(wagerRef.current / 2)
    if (back > 0) payout(back)
    finish(-back, `Surrendered — got back ${money(back)}.`, 'info')
  }, [finish, payout])

  const goToWar = useCallback(() => {
    if (!tieRef.current) return
    if (!placeBet(wagerRef.current)) {
      toast('Not enough to go to war.', 'lose')
      return
    }
    // Hiding the row is also a direct, synchronous state write — same
    // requirement as showing it, just the reverse edge.
    tieRef.current = false
    repaint()

    // Burn three, then one card each.
    draw()
    draw()
    draw()
    let wp = draw()
    let wd = draw()
    if (cheatWin() && rv(wp) < rv(wd)) {
      let guard = 0
      while (guard++ < 200 && rv(wp) < rv(wd)) {
        wp = draw()
        wd = draw()
      }
    }
    warPRef.current = wp
    warDRef.current = wd
    warGenRef.current += 1
    repaint()

    const bet = wagerRef.current
    if (rv(wp) >= rv(wd)) {
      // Raise wins, ante pushes: 2x the raise back (stake + win) plus the
      // original ante refunded — casinowar.js:140 pays `bet * 3` total.
      payout(bet * 3)
      finish(bet, `War won! ${wp.rank} vs ${wd.rank} — +${fmt(bet)}!`, 'win')
    } else {
      finish(-bet * 2, `War lost — ${wd.rank} tops your ${wp.rank}. Lost ${money(bet * 2)}.`, 'lose')
    }
  }, [draw, finish, payout, placeBet, repaint])

  /* ---------------- render ---------------- */
  const busy = busyRef.current
  const tie = tieRef.current
  const p = pRef.current
  const d = dRef.current
  const warP = warPRef.current
  const warD = warDRef.current
  const result = resultRef.current
  const lastNet = lastNetRef.current

  const lastResultText =
    lastNet == null ? '—' : lastNet > 0 ? `+${fmt(lastNet)}` : lastNet < 0 ? `-${fmt(-lastNet)}` : 'push'

  return (
    <div>
      <PageHead
        title="Casino War"
        sub="Highest card wins — that's it. Tie? Go to war for the pot."
        icon="swords"
      />

      <GameLayout>
        <Panel className="min-w-0">
          <Felt>
            <div className="war-hands flex flex-wrap justify-center items-center gap-8">
              {/* #warP/#warD — casinowar.js:60/62's permanent card-container
                  ids, required (not just visited) by detect():
                  `!!$("#warDeal") && !!$("#warP")`. Legacy reuses these same
                  two elements for the war round too (innerHTML swap); this
                  port renders the war round as its own block below instead,
                  which is fine — the adapter only ever checks for #warP's
                  *existence*, never touches it during play(). */}
              <Seat label="You" card={p} revealKey={dealGenRef.current} id="warP" />
              <div className="war-vs text-muted font-bold text-sm">VS</div>
              <Seat label="Dealer" card={d} revealKey={dealGenRef.current} id="warD" />
            </div>

            {/* War cards only ever exist once goToWar() has actually drawn
                them — a genuine mount, not a persistently-rendered container
                being toggled, so this whole block conditionally renders. */}
            {(warP || warD) && (
              <div
                className="war-hands flex flex-wrap justify-center items-center gap-8 mt-4 pt-4 border-t"
                style={{ borderColor: 'var(--glass-line)' }}
              >
                <Seat label="Your war card" card={warP} revealKey={warGenRef.current} />
                <div className="war-vs text-muted font-bold text-sm">VS</div>
                <Seat label="Dealer's war card" card={warD} revealKey={warGenRef.current} />
              </div>
            )}

            <div
              className="bj-result text-center text-sm mt-4 min-h-[20px]"
              id="warResult"
              style={{ color: result ? TONE_COLOR[result.tone] : undefined }}
            >
              {result?.msg ?? 'Place a bet and deal.'}
            </div>
          </Felt>
        </Panel>

        <Panel>
          <BetField inputRef={betRef} defaultValue={25} />

          <Button id="warDeal" variant="green" size="lg" block disabled={busy} onClick={deal}>
            Deal
          </Button>

          {/* #warWarRow — THE inline-style contract element (see the
              file-level comment). `style` carries a literal
              `display: 'flex'` ONLY while `tie` is true; it is `undefined`
              (not `display: 'none'`) otherwise, so `.style.display` reads
              exactly `''` when hidden and exactly `'flex'` when live,
              matching agent-ui.js's `=== "flex"` check precisely either
              way. Visual show/hide is handled separately by the `hidden`
              Tailwind class below — never let that class carry the
              `display` value the agent reads. */}
          <div
            id="warWarRow"
            className={cn('hc-actrow flex gap-2 mt-2.5', !tie && 'hidden')}
            style={tie ? { display: 'flex' } : undefined}
          >
            <Button variant="ghost" id="warSurrender" onClick={surrender} className="flex-1">
              Surrender (½)
            </Button>
            <Button variant="red" id="warGo" onClick={goToWar} className="flex-1">
              <Icon name="swords" size={14} className="inline -mt-0.5 mr-1" />
              Go to War
            </Button>
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-4">
            <Stat k="Last result" v={lastResultText} />
            <Stat k="Best win" v={fmt(bestRef.current)} />
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
