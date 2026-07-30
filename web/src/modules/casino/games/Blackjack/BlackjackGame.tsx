import { useCallback, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Button, cn } from '@/platform/ui'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { Reveal } from '@/platform/motion'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import type { ToastType } from '@/platform/ui/toast'
import { blackjackSounds } from './sounds'
import { Card } from '../../components/Card'
import type { CardSuit } from '../../components/Card'
import { Felt } from '../../components/Felt'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'

/* ============================================================
   Blackjack — ported from js/games/blackjack.js. Dealer stands on 17 (the
   legacy loop is a flat `while (handValue(dealer) < 17) dealer.push(draw())`
   — no special-cased soft-17 hit, so this reproduces it exactly the same
   way, not the "hits soft 17" house-rule variant). Blackjack pays 3:2.

   AGENT CONTRACT (agent-ui.js:400) — every one of these is load-bearing:
     detect()        !!$("#dealBtn")
     round-active    !$("#hitBtn").disabled || !$("#standBtn").disabled
     cardRank(el)    reads `.rank-top`'s textContent and strips suit
                     glyphs/whitespace via regex — Card.tsx's rank+suit
                     concatenated `.rank-top` (e.g. "10♠") strips to "10"
     state           #playerCards .card / #dealerCards .card:not(.back)
                     (dealer's HOLE card must carry `.back` while hidden —
                     Card's `faceDown` prop) / #playerScore (parsed int)
     buttons         #hitBtn #standBtn #doubleBtn individually disabled
                     per legal move, #dealBtn disabled while a round is live
     result          #bjResult textContent

   Legacy's beginner-mode strategy hint (bjHint/bjBeginner/bjHelp — a
   basicStrategy() advisor + localStorage preference + a How-To modal) is
   NOT part of the DOM contract (absent from contractIds.ts) and no other
   Wave 4 card game has a help-modal primitive yet, so it's left out of
   this pass — dealing/hit/stand/double/payout is the faithful port this
   brief asks for, not the tutorial layer bolted on top of it.

   Round state lives in REFS, not useState: deal()/hit()/stand()/double()
   each need to read-then-write the same hand synchronously within one
   click handler (deal() checks isBlackjack() on the hand it just dealt;
   hit() checks handValue() on the card it just pushed) without waiting on
   a React re-render round-trip — the same reasoning Holdem/Mines follow.
   `repaint()` is the only thing that asks React to re-read the refs.
   ============================================================ */

type HandCard = { rank: string; suit: CardSuit }

const SUITS: CardSuit[] = ['♠', '♣', '♥', '♦']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

function buildDeck(): HandCard[] {
  const d: HandCard[] = []
  SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })))
  // Fisher–Yates shuffle, verbatim.
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function handValue(hand: HandCard[]): number {
  let total = 0
  let aces = 0
  hand.forEach((c) => {
    if (c.rank === 'A') {
      total += 11
      aces++
    } else if (['K', 'Q', 'J', '10'].includes(c.rank)) total += 10
    else total += Number(c.rank)
  })
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return total
}

function isBlackjack(hand: HandCard[]): boolean {
  return hand.length === 2 && handValue(hand) === 21
}

type Result = { msg: string; tone: ToastType }

const TONE_COLOR: Record<ToastType, string> = {
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
  info: 'var(--color-gold-2)',
}

export default function BlackjackGame() {
  const betRef = useBetRef()
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)
  const balance = useWalletStore((s) => s.balance)

  const deckRef = useRef<HandCard[]>([])
  const playerRef = useRef<HandCard[]>([])
  const dealerRef = useRef<HandCard[]>([])
  const wagerRef = useRef(0)
  const inRoundRef = useRef(false)
  const hideHoleRef = useRef(true)
  const resultRef = useRef<Result | null>(null)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const draw = useCallback((): HandCard => {
    if (deckRef.current.length < 10) deckRef.current = buildDeck()
    return deckRef.current.pop() as HandCard
  }, [])

  const endRound = useCallback(
    (message: string, tone: ToastType, winAmount: number) => {
      let finalMsg = message
      let finalTone = tone
      let finalWin = winAmount
      // Rigged odds: turn a loss into a stake refund (js/games/blackjack.js:206).
      if (tone === 'lose' && cheatWin()) {
        finalTone = 'info'
        finalWin = wagerRef.current
        finalMsg = 'Lucky break — your stake is refunded.'
        blackjackSounds.cashout()
      }
      inRoundRef.current = false
      hideHoleRef.current = false
      resultRef.current = { msg: finalMsg, tone: finalTone }
      if (finalWin > 0) payout(finalWin)
      if (finalTone === 'win') blackjackSounds.win()
      else if (finalTone === 'lose') blackjackSounds.lose()
      toast(finalMsg, finalTone)
      repaint()
    },
    [payout, repaint],
  )

  const dealerPlayAndSettle = useCallback(() => {
    while (handValue(dealerRef.current) < 17) dealerRef.current = [...dealerRef.current, draw()]
    hideHoleRef.current = false
    const pv = handValue(playerRef.current)
    const dv = handValue(dealerRef.current)
    const bet = wagerRef.current
    repaint()
    if (dv > 21) endRound(`Dealer busts at ${dv}. You win +${fmt(bet)}!`, 'win', bet * 2)
    else if (dv > pv) endRound(`Dealer wins ${dv} to ${pv}. You lose.`, 'lose', 0)
    else if (dv < pv) endRound(`You win ${pv} to ${dv}! +${fmt(bet)}`, 'win', bet * 2)
    else endRound(`Push at ${pv}. Bet returned.`, 'info', bet)
  }, [draw, endRound, repaint])

  const playerBust = useCallback(() => {
    endRound(`Bust at ${handValue(playerRef.current)}. You lose.`, 'lose', 0)
  }, [endRound])

  const deal = useCallback(() => {
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      toast('Not enough cash for that bet.', 'lose')
      return
    }
    wagerRef.current = bet
    inRoundRef.current = true
    hideHoleRef.current = true
    resultRef.current = null
    if (deckRef.current.length < 15) deckRef.current = buildDeck()
    playerRef.current = [draw(), draw()]
    dealerRef.current = [draw(), draw()]
    repaint()

    // Immediate blackjack resolution, verbatim.
    const pBJ = isBlackjack(playerRef.current)
    const dBJ = isBlackjack(dealerRef.current)
    if (pBJ || dBJ) {
      if (pBJ && dBJ) endRound('Push — both blackjack. Bet returned.', 'info', bet)
      else if (pBJ) endRound(`Blackjack! Paid 3:2 (+${fmt(Math.floor(bet * 1.5))}).`, 'win', Math.floor(bet * 2.5))
      else endRound('Dealer has blackjack. You lose.', 'lose', 0)
    }
  }, [betRef, placeBet, draw, endRound, repaint])

  const hit = useCallback(() => {
    if (!inRoundRef.current) return
    playerRef.current = [...playerRef.current, draw()]
    repaint()
    const v = handValue(playerRef.current)
    if (v > 21) playerBust()
    else if (v === 21) dealerPlayAndSettle()
  }, [dealerPlayAndSettle, draw, playerBust, repaint])

  const stand = useCallback(() => {
    if (!inRoundRef.current) return
    dealerPlayAndSettle()
  }, [dealerPlayAndSettle])

  const double = useCallback(() => {
    if (!inRoundRef.current || playerRef.current.length !== 2) return
    if (!placeBet(wagerRef.current)) {
      toast('Not enough cash to double.', 'lose')
      return
    }
    wagerRef.current *= 2
    playerRef.current = [...playerRef.current, draw()]
    repaint()
    const v = handValue(playerRef.current)
    if (v > 21) playerBust()
    else dealerPlayAndSettle()
  }, [dealerPlayAndSettle, draw, placeBet, playerBust, repaint])

  /* ---------------- render ---------------- */
  const active = inRoundRef.current
  const player = playerRef.current
  const dealer = dealerRef.current
  const hideHole = hideHoleRef.current
  const result = resultRef.current

  const playerScoreText = player.length === 0 ? '—' : String(handValue(player))
  const dealerScoreText =
    dealer.length === 0 ? '—' : hideHole ? `${handValue([dealer[0]])} + ?` : String(handValue(dealer))

  // Double only allowed on the opening two cards with funds available —
  // `balance` already reflects the stake deducted at deal() (js/games/blackjack.js:200).
  const canDouble = active && player.length === 2 && balance >= wagerRef.current
  const isMobile = useIsMobile()

  return (
    <div>
      <PageHead
        title="Blackjack"
        sub="Beat the dealer without going over 21. Blackjack pays 3:2. Dealer stands on 17."
        icon="spade"
      />

      <GameLayout>
        <Panel className="min-w-0">
          <Felt className={cn('flex flex-col justify-center gap-4', isMobile ? 'min-h-[280px]' : 'min-h-[440px]')}>
            <div className="hand-row">
              <div className="hand-label flex items-center justify-center gap-3 text-sm text-muted mb-3">
                <span>Dealer</span>
                <span className="hand-score num text-text" id="dealerScore">
                  {dealerScoreText}
                </span>
              </div>
              <div
                className={cn(
                  'cards flex flex-wrap justify-center gap-3',
                  isMobile ? 'min-h-[80px]' : 'min-h-[136px]',
                )}
                id="dealerCards"
              >
                {/* key={i} is array-index-stable across the hole-card reveal:
                    dealer.length never changes when hideHole flips false, so
                    this Reveal/Card at i===1 stays mounted and only its
                    `faceDown` prop changes — Card's own internal 3D flip
                    (Card.tsx "THE 3D FLIP") handles that transition, no
                    remount, no VideoPoker-style blank frame. */}
                {dealer.map((c, i) => (
                  <Reveal key={i} as="div" preset="scaleIn" duration={0.22}>
                    <Card rank={c.rank} suit={c.suit} faceDown={hideHole && i === 1} size="lg" />
                  </Reveal>
                ))}
              </div>
            </div>

            <div className="hand-divider flex items-center gap-3" style={{ color: 'var(--color-faint)' }}>
              <span className="flex-1 border-t" style={{ borderColor: 'var(--glass-line)' }} />
              <span className="text-xs font-bold tracking-widest opacity-60">VS</span>
              <span className="flex-1 border-t" style={{ borderColor: 'var(--glass-line)' }} />
            </div>

            <div className="hand-row">
              <div className="hand-label flex items-center justify-center gap-3 text-sm text-muted mb-3">
                <span>You</span>
                <span className="hand-score num text-text" id="playerScore">
                  {playerScoreText}
                </span>
              </div>
              <div
                className={cn(
                  'cards flex flex-wrap justify-center gap-3',
                  isMobile ? 'min-h-[80px]' : 'min-h-[136px]',
                )}
                id="playerCards"
              >
                {player.map((c, i) => (
                  <Reveal key={i} as="div" preset="scaleIn" duration={0.22}>
                    <Card rank={c.rank} suit={c.suit} size="lg" />
                  </Reveal>
                ))}
              </div>
            </div>

            <div
              className="bj-result text-center text-sm font-semibold min-h-[20px] rounded-xl py-2 px-3 transition-all"
              id="bjResult"
              style={{
                color: result ? TONE_COLOR[result.tone] : undefined,
                background: result
                  ? `color-mix(in srgb, ${TONE_COLOR[result.tone]} 14%, transparent)`
                  : undefined,
                boxShadow: result ? `0 0 24px color-mix(in srgb, ${TONE_COLOR[result.tone]} 25%, transparent)` : undefined,
              }}
            >
              {result?.msg ?? ''}
            </div>
          </Felt>
        </Panel>

        <Panel>
          <BetField inputRef={betRef} defaultValue={25} />

          {/* #dealBtn.disabled IS the adapter's "a round is live" half-signal
              (the other half being #hitBtn/#standBtn). */}
          <Button id="dealBtn" variant="green" size="lg" block disabled={active} onClick={deal} className="mb-4">
            Deal
          </Button>

          <div className="bj-actions grid grid-cols-3 gap-2">
            <Button id="hitBtn" variant="blue" disabled={!active} onClick={hit}>
              Hit
            </Button>
            <Button id="standBtn" variant="ghost" disabled={!active} onClick={stand}>
              Stand
            </Button>
            <Button id="doubleBtn" variant="ghost" disabled={!canDouble} onClick={double}>
              Double
            </Button>
          </div>

          <p className="hint text-xs text-faint mt-4">
            <strong>Double</strong> doubles your bet, deals one card, then stands.
          </p>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
