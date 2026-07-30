import { useCallback, useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Button, cn } from '@/platform/ui'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
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
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Three Card Poker — ported from js/games/threecard.js. Ante up, see your
   three cards, then Play (match the ante) or Fold. Dealer needs Queen-high
   to qualify. Unlike 5-card poker, a STRAIGHT beats a FLUSH here (rarer
   with only three cards to work with) — js/games/threecard.js's own
   header comment says so explicitly, and its `rank3()` category order
   (CAT = ["High card","Pair","Flush","Straight","Three of a kind",
   "Straight flush"]) encodes it: Straight (index 3) outranks Flush
   (index 2). Reproduced verbatim below, not "fixed".

   AGENT CONTRACT (agent-ui.js — grepped `  threecard:`):
     detect()   #tcpDeal + #tcpPlayer
     play()     applyBet() the ante, click #tcpDeal, wait up to 4s for
                #tcpPlay to enable, then read #tcpPlayer .card .rank-top
                (rank AND suit both parsed out of the SAME node — see
                Card.tsx's `.rank-top` contract doc), decide play/fold via
                window.ThreeCardGame._t.rank3()/cmp3() (with a cruder
                high-card fallback in a try/catch if that throws), then
                click #tcpFold or #tcpPlay.

   window.ThreeCardGame._t — a HARD PRE-EXISTING TYPE CONTRACT, already
   compiled into agentUi.ts as `ThreeCardGameType`:
     type ThreeCardGameType = {
       _t: {
         rank3: (cards: Card[]) => unknown
         cmp3: (a: unknown, b: unknown) => number
       }
     }
   NOTE the NESTED `_t` wrapper — this mirrors legacy's own
   `return { render, _t: { rank3, cmp3, resolve, qualifies } }` shape
   (threecard.js:188), not a naming choice invented in this port. `rank3`
   takes an array of `{ rank, suit: { s } }` cards (agentUi.ts's own `Card`
   type — bare `suit.s: string`, not narrowed to this file's `CardSuit`
   union) and returns an opaque ranking (`unknown` from the caller's
   perspective); `cmp3` compares two such rankings, >0 if the first wins.
   #tcpFold was genuinely missing from contractIds.ts (only #tcpDeal,
   #tcpPlay, #tcpPlayer were transcribed) — added, since agent-ui.js does
   click `$(dec.action === 'fold' ? '#tcpFold' : '#tcpPlay')`.
   ============================================================ */

// Suit wrapped in `{ s }`, matching legacy threecard.js's own card shape
// AND agentUi.ts's pre-existing `Card` type — same reasoning as
// VideoPokerGame.tsx's `HandCard`. Card.tsx the COMPONENT still takes a
// bare `suit: CardSuit` prop, so every render site below passes `c.suit.s`.
type HandCard = { rank: string; suit: { s: CardSuit } }

/**
 * The exact shape agentUi.ts's pre-existing `Card` type declares:
 * `{ rank: string; suit: { s: string } }` — `suit.s` a bare `string`, not
 * narrowed to this file's own `CardSuit` union. `rank3` below is typed
 * against THIS (not `HandCard`) so the `window.ThreeCardGame` assignment
 * near the bottom of this file is a PLAIN assignment for `rank3` (no
 * `as unknown as` cast) — see that effect's own comment for why that
 * matters. `HandCard` is call-compatible with this (`CardSuit` is a
 * subtype of `string`), so every internal call site can pass `HandCard[]`
 * directly too.
 */
type EvalCard = { rank: string; suit: { s: string } }

const SUITS: CardSuit[] = ['♠', '♣', '♥', '♦']
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const rankValue = (r: string) => RANKS.indexOf(r) + 2 // 2..14

const CATEGORY_NAMES = ['High card', 'Pair', 'Flush', 'Straight', 'Three of a kind', 'Straight flush']

function buildDeck(): HandCard[] {
  const d: HandCard[] = []
  SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit: { s: suit } })))
  // Fisher–Yates shuffle, verbatim.
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

/**
 * Ranks a 3-card hand -> `[category, ...tiebreakers]`, higher category (and
 * then higher tiebreakers) wins. Ported verbatim from threecard.js:28-45,
 * including the A-2-3 wheel straight and the straight-beats-flush category
 * ordering (category 3 > category 2).
 *
 * Typed against `EvalCard[]` (not `HandCard[]`) specifically so the
 * `window.ThreeCardGame._t.rank3` assignment below is a plain assignment
 * against agentUi.ts's `(cards: Card[]) => unknown` — see the type doc
 * above `EvalCard`.
 */
function rank3(cards: EvalCard[]): number[] {
  const rs = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)
  const flush = cards[0].suit.s === cards[1].suit.s && cards[1].suit.s === cards[2].suit.s
  const uniq = [...new Set(rs)]
  let straight = false
  let sHigh = 0
  if (uniq.length === 3) {
    if (rs[0] - rs[2] === 2) {
      straight = true
      sHigh = rs[0]
    } else if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) {
      straight = true // A-2-3 (wheel)
      sHigh = 3
    }
  }
  const trips = rs[0] === rs[1] && rs[1] === rs[2]
  const pair = !trips && (rs[0] === rs[1] || rs[1] === rs[2] || rs[0] === rs[2])
  if (straight && flush) return [5, sHigh]
  if (trips) return [4, rs[0]]
  if (straight) return [3, sHigh]
  if (flush) return [2, rs[0], rs[1], rs[2]]
  if (pair) {
    const pr = rs[0] === rs[1] ? rs[0] : rs[1] === rs[2] ? rs[1] : rs[0]
    const kicker = rs.filter((r) => r !== pr)[0] || 0
    return [1, pr, kicker]
  }
  return [0, rs[0], rs[1], rs[2]]
}

/** Ported verbatim from threecard.js:46. Internal, typed-narrow use — the
 *  `window.ThreeCardGame._t.cmp3` wrapper below re-exposes this against the
 *  literal `unknown` params agentUi.ts declares. */
function cmp3(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x - y
  }
  return 0
}

const catName = (score: number[]) => CATEGORY_NAMES[score[0]]
/** Queen-high or better, threecard.js:48. */
const qualifies = (score: number[]) => score[0] > 0 || score[1] >= 12

type Resolution = {
  ret: number
  label: string
  anteBonusMult: number
}

/** Ported verbatim from threecard.js:51-61 — ante/play/ante-bonus/pair-plus
 *  payout structure, including the pair-plus multiplier table
 *  `[0,2,4,7,31,41]` indexed by hand category. */
function resolve(player: HandCard[], dealer: HandCard[], ante: number, pp: number): Resolution {
  const ps = rank3(player)
  const ds = rank3(dealer)
  let ret = 0
  const anteBonusMult = ps[0] === 5 ? 5 : ps[0] === 4 ? 4 : ps[0] === 3 ? 1 : 0
  ret += ante * anteBonusMult

  let label: string
  if (!qualifies(ds)) {
    ret += ante * 2 + ante
    label = "Dealer doesn't qualify — ante wins, play pushes"
  } else {
    const c = cmp3(ps, ds)
    if (c > 0) {
      ret += ante * 4
      label = `You win — ${catName(ps)} beats ${catName(ds)}`
    } else if (c < 0) {
      label = `Dealer wins with ${catName(ds)}`
    } else {
      ret += ante * 2
      label = 'Tie — push'
    }
  }

  if (pp > 0) {
    const ppMults = [0, 2, 4, 7, 31, 41]
    const m = ppMults[ps[0]]
    ret += m ? pp * m : 0
  }

  return { ret, label, anteBonusMult }
}

type Phase = 'bet' | 'decide'
type Result = { text: string; tone: ToastType }

const TONE_COLOR: Record<ToastType, string> = {
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
  info: 'var(--color-gold-2)',
}

export default function ThreeCardGame() {
  const betRef = useBetRef()
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  // Round state in REFS, not useState — deal()/fold()/play() each need to
  // read-then-write player/dealer/ante synchronously within one click
  // handler (play() evaluates the hand it just dealt), same discipline as
  // Blackjack/VideoPoker/Holdem. `repaint()` is the only thing that asks
  // React to re-read the refs.
  const deckRef = useRef<HandCard[]>([])
  const playerRef = useRef<HandCard[]>([])
  const dealerRef = useRef<HandCard[]>([])
  const anteRef = useRef(0)
  const ppRef = useRef(0)
  const phaseRef = useRef<Phase>('bet')
  const revealDealerRef = useRef(false)
  const resultRef = useRef<Result>({ text: 'Set your ante and deal.', tone: 'info' })
  const lastNetRef = useRef<number | null>(null)
  const ppCheckRef = useRef<HTMLInputElement | null>(null)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const draw = useCallback((): HandCard => {
    if (deckRef.current.length < 8) deckRef.current = buildDeck()
    return deckRef.current.pop() as HandCard
  }, [])

  const setControlsDisabled = useCallback(
    (deciding: boolean) => {
      if (betRef.current) betRef.current.disabled = deciding
      if (ppCheckRef.current) ppCheckRef.current.disabled = deciding
    },
    [betRef],
  )

  const deal = useCallback(() => {
    if (phaseRef.current !== 'bet') return
    const ante = readBet(betRef)
    const pp = ppCheckRef.current?.checked ? ante : 0
    if (!placeBet(ante + pp)) {
      toast('Not enough cash for that ante.', 'lose')
      return
    }
    anteRef.current = ante
    ppRef.current = pp
    if (deckRef.current.length < 12) deckRef.current = buildDeck()
    playerRef.current = [draw(), draw(), draw()]
    dealerRef.current = [draw(), draw(), draw()]

    // Rigged odds: deal until the player's hand outranks the dealer's
    // (threecard.js:150).
    if (cheatWin()) {
      let guard = 0
      while (guard++ < 300 && cmp3(rank3(playerRef.current), rank3(dealerRef.current)) <= 0) {
        playerRef.current = [draw(), draw(), draw()]
        dealerRef.current = [draw(), draw(), draw()]
      }
    }

    phaseRef.current = 'decide'
    revealDealerRef.current = false
    resultRef.current = { text: 'Play (match your ante) or Fold?', tone: 'info' }
    setControlsDisabled(true)
    sound.play('tick')
    repaint()
  }, [betRef, draw, placeBet, repaint, setControlsDisabled])

  const fold = useCallback(() => {
    if (phaseRef.current !== 'decide') return
    phaseRef.current = 'bet'
    revealDealerRef.current = true
    setControlsDisabled(false)
    const lost = anteRef.current + ppRef.current
    resultRef.current = { text: `Folded — lost ${money(lost)}.`, tone: 'lose' }
    lastNetRef.current = -lost
    sound.play('lose')
    repaint()
  }, [repaint, setControlsDisabled])

  const play = useCallback(() => {
    if (phaseRef.current !== 'decide') return
    const ante = anteRef.current
    if (!placeBet(ante)) {
      toast('Not enough for the Play bet.', 'lose')
      return
    }
    phaseRef.current = 'bet'
    revealDealerRef.current = true
    setControlsDisabled(false)

    const pp = ppRef.current
    const r = resolve(playerRef.current, dealerRef.current, ante, pp)
    const staked = ante * 2 + pp
    const net = r.ret - staked
    if (r.ret > 0) payout(r.ret)

    const extra = r.anteBonusMult ? ` · Ante bonus ${r.anteBonusMult}:1` : ''
    let text: string
    let tone: ToastType
    if (net > 0) {
      text = `${r.label}${extra} — +${fmt(net)}!`
      tone = 'win'
      sound.play(net >= ante * 6 ? 'bigwin' : 'win')
      toast(`Won +${fmt(net)}!`, 'win')
    } else if (net === 0) {
      text = `${r.label}${extra} — even.`
      tone = 'info'
      sound.play('cashout')
    } else {
      text = `${r.label}${extra}. Lost ${money(-net)}.`
      tone = 'lose'
      sound.play('lose')
    }
    resultRef.current = { text, tone }
    lastNetRef.current = net
    repaint()
  }, [payout, placeBet, repaint, setControlsDisabled])

  /* ---------------- window.ThreeCardGame ----------------
     Registered on mount, DELETED on unmount — same discipline as every
     other window.*API/window.*Game global in this codebase (HoldemAPI,
     VideoPokerGame): a stale global would leave threecard.detect() true
     for a route with no live hand, and the agent's rank3()/cmp3() calls
     would compare against nothing meaningful. */
  useEffect(() => {
    const api = {
      _t: {
        rank3,
        // Exposed with the LITERAL `unknown` params agentUi.ts declares
        // (not `number[]`) so this whole `api` object plain-assigns to
        // `window.ThreeCardGame` with no `as unknown as` cast — mirroring
        // rank3's own plain-assignability, see the type doc above.
        cmp3: (a: unknown, b: unknown): number => cmp3(a as number[], b as number[]),
      },
    }
    window.ThreeCardGame = api
    return () => {
      delete window.ThreeCardGame
    }
  }, [])

  /* ---------------- render ---------------- */
  const phase = phaseRef.current
  const player = playerRef.current
  const dealer = dealerRef.current
  const revealDealer = revealDealerRef.current
  const result = resultRef.current
  const deciding = phase === 'decide'

  const playerScoreText = player.length ? catName(rank3(player)) : '—'
  const dealerScoreText = revealDealer && dealer.length ? catName(rank3(dealer)) : '—'
  const lastWinText =
    lastNetRef.current === null
      ? '—'
      : lastNetRef.current > 0
        ? '+' + fmt(lastNetRef.current)
        : lastNetRef.current < 0
          ? '-' + fmt(-lastNetRef.current)
          : '0'

  const isMobile = useIsMobile()

  return (
    <div>
      <PageHead
        title="Three Card Poker"
        sub="Beat the dealer with three cards. Ante up, then Play or Fold. Add Pair Plus for bonus payouts on your own hand."
        icon="layers-2"
      />

      <GameLayout>
        <Panel className="min-w-0">
          <Felt>
            <div className={cn('tcp-seats flex flex-wrap items-center justify-center', isMobile ? 'gap-4' : 'gap-8')}>
              <div className="tcp-seat hand-row text-center">
                <div className="hand-label flex items-center justify-center gap-2 text-sm text-muted mb-3">
                  <span>Dealer</span>
                  <span className="hand-score num text-text" id="tcpDScore">
                    {dealerScoreText}
                  </span>
                </div>
                <div
                  className={cn('cards flex flex-wrap justify-center gap-2', isMobile ? 'min-h-[80px]' : 'min-h-[136px]')}
                  id="tcpDealer"
                >
                  {/* Same reasoning as BlackjackGame.tsx's dealer hole card:
                      dealer.length is fixed at 3 for the whole hand, so
                      key={i} keeps every slot mounted across the
                      revealDealer flip — only `faceDown` changes, handled by
                      Card's own internal flip, no remount/blank frame. */}
                  {dealer.map((c, i) => (
                    <Reveal key={i} as="div" preset="scaleIn" duration={0.22}>
                      <Card rank={c.rank} suit={c.suit.s} faceDown={!revealDealer} size="lg" />
                    </Reveal>
                  ))}
                </div>
              </div>

              <div className="tcp-vs text-muted font-bold text-sm">VS</div>

              <div className="tcp-seat hand-row text-center">
                <div className="hand-label flex items-center justify-center gap-2 text-sm text-muted mb-3">
                  <span>You</span>
                  <span className="hand-score num text-text" id="tcpPScore">
                    {playerScoreText}
                  </span>
                </div>
                <div
                  className={cn('cards flex flex-wrap justify-center gap-2', isMobile ? 'min-h-[80px]' : 'min-h-[136px]')}
                  id="tcpPlayer"
                >
                  {player.map((c, i) => (
                    <Reveal key={i} as="div" preset="scaleIn" duration={0.22}>
                      <Card rank={c.rank} suit={c.suit.s} size="lg" />
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="bj-result text-center text-sm min-h-[20px] mt-4"
              id="tcpResult"
              style={{ color: TONE_COLOR[result.tone] }}
            >
              {result.text}
            </div>
          </Felt>
        </Panel>

        <Panel>
          <BetField inputRef={betRef} defaultValue={25} label="Ante" />

          <label className="bj-beginner flex items-center gap-2 text-xs text-muted mt-1 mb-3.5">
            <input ref={ppCheckRef} type="checkbox" id="tcpPP" />
            Also bet <b>Pair Plus</b> (= ante)
          </label>

          {/* #tcpDeal.disabled IS the adapter's own signal it starts a fresh
              hand; #tcpPlay's re-enable is the other half of its `waitFor`
              (agent-ui.js: `waitFor(() => !$('#tcpPlay').disabled, 4000)`). */}
          <Button id="tcpDeal" variant="green" size="lg" block disabled={deciding} onClick={deal}>
            Deal
          </Button>

          <div className="hc-actrow grid grid-cols-2 gap-2 mt-2.5">
            <Button id="tcpFold" variant="ghost" disabled={!deciding} onClick={fold}>
              Fold
            </Button>
            <Button id="tcpPlay" variant="blue" disabled={!deciding} onClick={play}>
              Play
            </Button>
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-3.5">
            <div className="stat">
              <div className="k text-xs text-muted">Your hand</div>
              <div className="v num text-text" id="tcpHand">
                {playerScoreText}
              </div>
            </div>
            <div className="stat">
              <div className="k text-xs text-muted">Last win</div>
              <div className="v num text-text" id="tcpLast">
                {lastWinText}
              </div>
            </div>
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
