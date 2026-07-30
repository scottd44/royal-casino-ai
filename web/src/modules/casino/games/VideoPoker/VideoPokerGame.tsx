import { useCallback, useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt } from '@/platform/money/format'
import { sound } from '@/platform/audio/soundStore'
import { toast } from '@/platform/ui/toast'
import type { ToastType } from '@/platform/ui/toast'
import { Card } from '../../components/Card'
import type { CardSuit } from '../../components/Card'
import { Felt } from '../../components/Felt'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'

/* ============================================================
   Video Poker — Jacks or Better, ported from js/games/videopoker.js.

   AGENT CONTRACT (agent-ui.js:464) — every one of these is load-bearing:
     detect()  #vpCards + #drawBtn
     readHand  querySelectorAll("#vpCards .vp-slot"), each slot's
               ".rank-top" textContent read WHOLE then sliced:
               suit = txt.slice(-1), rank = txt.slice(0, -1) — requires
               rank-immediately-followed-by-suit with nothing between them,
               which is exactly what Card.tsx's `rank<br/>suit` JSX
               produces (see Card.tsx's own `.rank-top` contract doc).
     holds     click ".vp-slot[data-idx=\"N\"]"; the adapter checks
               `!slot.classList.contains("held")` before clicking, so a
               slot must gain/lose `.held` when toggled and must not be
               double-toggled by a second click on an already-held slot.
     buttons   #dealBtn, #drawBtn, #vpResult.
     evaluate  window.VideoPokerGame.evaluate(cards) — see the dedicated
               note above the `window.VideoPokerGame` effect below; this
               is a pre-existing type contract, not a naming choice made
               in this file.

   ROUND STATE lives in REFS, not useState — same reasoning as
   BlackjackGame.tsx/HoldemGame.tsx: deal()/doDraw()/finishDraw() each
   read-then-write hand/held/phase synchronously (deal() evaluates the hand
   it just dealt; the animated draw's setInterval mutates the hand and
   checks completion tick-by-tick) without waiting on a React re-render
   round-trip. `repaint()` is the only thing that asks React to re-read
   the refs.
   ============================================================ */

// Suit wrapped in `{ s }` (not a bare `CardSuit`) to match legacy
// videopoker.js's own card shape (`{ rank, suit: { s, red } }`) AND
// agentUi.ts's pre-existing `Card` type (`{ rank; suit: { s } }`) — Card.tsx
// the COMPONENT takes a bare `suit: CardSuit` prop, so every render site
// below passes `card.suit.s`, not `card.suit`.
type HandCard = { rank: string; suit: { s: CardSuit } }

/**
 * The exact shape agentUi.ts's pre-existing `Card` type declares:
 * `{ rank: string; suit: { s: string } }` — `suit.s` a bare `string`, NOT
 * narrowed to this file's own `CardSuit` union. `evaluateHand` below is
 * typed against THIS, not `HandCard`, so that the `window.VideoPokerGame`
 * assignment near the bottom of this file is STRUCTURALLY IDENTICAL to
 * agentUi.ts's `VideoPokerGameType['evaluate']` and can be a plain
 * assignment with no `as unknown as` escape hatch — see that effect's own
 * comment for why that matters. (`HandCard` above is call-compatible with
 * this — `CardSuit` is a subtype of `string` — so `evaluateHand` also
 * accepts `HandCard[]` directly at every internal call site.)
 */
type EvalCard = { rank: string; suit: { s: string } }

const SUITS: CardSuit[] = ['♠', '♣', '♥', '♦']
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const RANK_VAL: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]))

type PayRow = { key: string; label: string; pay: number }

// Paytable is "for 1": the total returned per unit staked (so "Jacks or
// Better" paying 1 returns your bet — a push). 9/6 full-pay Jacks or
// Better, ~99.5% RTP — ported verbatim from videopoker.js:14-24.
const PAYTABLE: PayRow[] = [
  { key: 'royal', label: 'Royal Flush', pay: 800 },
  { key: 'sflush', label: 'Straight Flush', pay: 50 },
  { key: 'quads', label: 'Four of a Kind', pay: 25 },
  { key: 'full', label: 'Full House', pay: 9 },
  { key: 'flush', label: 'Flush', pay: 6 },
  { key: 'straight', label: 'Straight', pay: 4 },
  { key: 'trips', label: 'Three of a Kind', pay: 3 },
  { key: 'twopair', label: 'Two Pair', pay: 2 },
  { key: 'jacks', label: 'Jacks or Better', pay: 1 },
]
const PAY_BY_KEY = new Map(PAYTABLE.map((p) => [p.key, p]))

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
 * Evaluate a 5-card hand -> the best paying row, or null (worse than
 * jacks-or-better — no win). Ported verbatim from videopoker.js:51-87,
 * including the wheel-straight (A-2-3-4-5) and royal-vs-straight-flush
 * special cases. This IS the game; nothing here is approximated.
 */
function evaluateHand(cards: EvalCard[]): PayRow | null {
  const counts: Record<string, number> = {}
  cards.forEach((c) => {
    counts[c.rank] = (counts[c.rank] || 0) + 1
  })
  const groups = Object.values(counts).sort((a, b) => b - a) // e.g. [3, 2]

  const isFlush = cards.every((c) => c.suit.s === cards[0].suit.s)

  const vals = [...new Set(cards.map((c) => RANK_VAL[c.rank]))].sort((a, b) => a - b)
  let isStraight = vals.length === 5 && vals[4] - vals[0] === 4
  // Wheel straight: A-2-3-4-5 (Ace counts low).
  const isWheel =
    vals.length === 5 && vals[0] === 2 && vals[1] === 3 && vals[2] === 4 && vals[3] === 5 && vals[4] === 14
  if (isWheel) isStraight = true

  if (isStraight && isFlush) {
    // Royal = 10-J-Q-K-A of one suit (not the wheel).
    if (!isWheel && vals[0] === 10) return PAY_BY_KEY.get('royal')!
    return PAY_BY_KEY.get('sflush')!
  }
  if (groups[0] === 4) return PAY_BY_KEY.get('quads')!
  if (groups[0] === 3 && groups[1] === 2) return PAY_BY_KEY.get('full')!
  if (isFlush) return PAY_BY_KEY.get('flush')!
  if (isStraight) return PAY_BY_KEY.get('straight')!
  if (groups[0] === 3) return PAY_BY_KEY.get('trips')!
  if (groups[0] === 2 && groups[1] === 2) return PAY_BY_KEY.get('twopair')!
  if (groups[0] === 2) {
    // Only a pair of Jacks or higher pays.
    const pairRank = Object.keys(counts).find((r) => counts[r] === 2)!
    if (RANK_VAL[pairRank] >= 11) return PAY_BY_KEY.get('jacks')!
  }
  return null
}

const TONE_COLOR: Record<ToastType, string> = {
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
  info: 'var(--color-gold-2)',
}

// Same localStorage key/semantics as videopoker.js:146 — the instant-draw
// preference persists across sessions.
const INSTANT_KEY = 'royal_casino_vp_instant'

type Phase = 'idle' | 'draw' | 'drawing'
type Result = { text: string; tone: ToastType }

export default function VideoPokerGame() {
  const betRef = useBetRef()
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const deckRef = useRef<HandCard[]>([])
  const handRef = useRef<HandCard[]>([])
  const heldRef = useRef<boolean[]>([false, false, false, false, false])
  const phaseRef = useRef<Phase>('idle')
  const stakeRef = useRef(0)
  const dealtRef = useRef(false)
  const highlightRef = useRef<string | null>(null)
  const resultRef = useRef<Result>({ text: 'Press Deal to start.', tone: 'info' })
  const lastWinRef = useRef('—')
  const bestWinRef = useRef(0)
  // Indices currently showing a face-down back mid-draw (the staggered,
  // non-instant reveal) — NOT the same thing as `held`.
  const faceDownRef = useRef<Set<number>>(new Set())
  // Monotonic per-slot "generation" — see the `Reveal` doc block below for
  // why this drives each card's key instead of its array index.
  const genRef = useRef(0)
  const cardGenRef = useRef<number[]>([0, 0, 0, 0, 0])
  const instantRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    instantRef.current = localStorage.getItem(INSTANT_KEY) === '1'
    repaint()
  }, [repaint])

  const drawCard = useCallback((): HandCard => {
    if (deckRef.current.length === 0) deckRef.current = buildDeck()
    return deckRef.current.pop() as HandCard
  }, [])

  const setInstant = useCallback(
    (on: boolean) => {
      instantRef.current = on
      localStorage.setItem(INSTANT_KEY, on ? '1' : '0')
      repaint()
    },
    [repaint],
  )

  const finishDraw = useCallback(
    (finalHand: HandCard[]) => {
      phaseRef.current = 'idle'
      heldRef.current = [true, true, true, true, true]

      const result = evaluateHand(finalHand)
      const stake = stakeRef.current
      if (result) {
        const winAmount = stake * result.pay
        highlightRef.current = result.key
        const net = winAmount - stake
        if (net > 0) {
          resultRef.current = { text: `${result.label}! +${fmt(net)}`, tone: 'win' }
          toast(`${result.label} — won +${fmt(net)}!`, 'win')
          sound.play(result.pay >= 25 ? 'bigwin' : 'win')
        } else {
          resultRef.current = { text: `${result.label} — bet returned.`, tone: 'info' }
          toast(`${result.label} — push.`, 'info')
        }
        if (winAmount > 0) payout(winAmount)
        lastWinRef.current = '+' + fmt(winAmount)
        if (winAmount > bestWinRef.current) bestWinRef.current = winAmount
      } else if (cheatWin()) {
        // Rigged odds: refund the stake on a non-paying hand.
        payout(stake)
        highlightRef.current = null
        resultRef.current = { text: 'Lucky refund — stake returned.', tone: 'info' }
        toast('Lucky refund — stake returned.', 'info')
        lastWinRef.current = '+' + fmt(stake)
        sound.play('cashout')
      } else {
        highlightRef.current = null
        resultRef.current = { text: 'No win — deal again.', tone: 'lose' }
        toast('No paying hand.', 'lose')
        lastWinRef.current = '0'
        sound.play('lose')
      }

      repaint()
    },
    [payout, repaint],
  )

  const doDraw = useCallback(() => {
    if (phaseRef.current !== 'draw') return
    const toReplace: number[] = []
    for (let i = 0; i < 5; i++) if (!heldRef.current[i]) toReplace.push(i)

    phaseRef.current = 'drawing'
    resultRef.current = { text: toReplace.length ? 'Drawing…' : 'Standing pat…', tone: 'info' }
    repaint()

    // Instant draw: replace everything and resolve immediately. No
    // generation bump here either (see the note below) — `faceDown` never
    // goes true in this branch, so the slot's Card just re-renders with its
    // new rank/suit in place, no remount and no flip needed for "instant."
    if (instantRef.current || toReplace.length === 0) {
      const newHand = handRef.current.slice()
      for (const idx of toReplace) {
        newHand[idx] = drawCard()
      }
      handRef.current = newHand
      faceDownRef.current = new Set()
      finishDraw(newHand)
      return
    }

    // Held cards stay face up; the cards being replaced flip face-down
    // first, then reveal one at a time — ~4s total, matching
    // videopoker.js:236-266's own pacing.
    faceDownRef.current = new Set(toReplace)
    repaint()

    const perCard = Math.min(1200, Math.round(4200 / toReplace.length))
    let k = 0
    timerRef.current = setInterval(() => {
      const idx = toReplace[k]
      const newHand = handRef.current.slice()
      newHand[idx] = drawCard()
      // NO generation bump here — this slot's `Reveal` keeps its ORIGINAL
      // key from the deal, so the same `Card` instance stays mounted. The
      // rank/suit update below lands on the (currently rotated-away) front
      // face while the card is still showing its back, then the
      // `faceDownRef` write two lines down flips `faceDown` false and
      // triggers Card's own built-in 3D flip — front face now shows the
      // NEW card — the exact mechanism BlackjackGame.tsx's dealer hole
      // card already uses. This file used to force a fresh generation here
      // to remount the slot instead, which unmounted the face-down card and
      // mounted a brand new one starting at `Reveal`'s scaleIn `opacity: 0`
      // — a genuine blank frame before the fade-in, which is what read as
      // "the card goes blank" rather than flipping.
      handRef.current = newHand
      const stillDown = new Set(faceDownRef.current)
      stillDown.delete(idx)
      faceDownRef.current = stillDown
      sound.play('tick')
      repaint()
      k++
      if (k >= toReplace.length) {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        finishDraw(newHand)
      }
    }, perCard)
  }, [drawCard, finishDraw, repaint])

  const deal = useCallback(() => {
    if (phaseRef.current !== 'idle') return
    const stake = readBet(betRef)
    if (!placeBet(stake)) {
      resultRef.current = { text: 'Not enough cash for that bet.', tone: 'lose' }
      repaint()
      return
    }
    stakeRef.current = stake
    deckRef.current = buildDeck()
    const newHand = [drawCard(), drawCard(), drawCard(), drawCard(), drawCard()]
    handRef.current = newHand
    heldRef.current = [false, false, false, false, false]
    faceDownRef.current = new Set()
    // All 5 slots get a fresh generation — every deal is a genuine mount
    // for every card, even a re-deal that reuses the same 5 DOM positions.
    for (let i = 0; i < 5; i++) cardGenRef.current[i] = ++genRef.current
    phaseRef.current = 'draw'
    dealtRef.current = true

    // Show what was dealt so a made hand is obvious — hold it before drawing!
    const dealt = evaluateHand(newHand)
    if (dealt) {
      highlightRef.current = dealt.key
      resultRef.current = { text: `Dealt ${dealt.label} — HOLD these cards, then Draw to keep it.`, tone: 'win' }
    } else {
      highlightRef.current = null
      resultRef.current = { text: 'Hold the cards you want, then Draw.', tone: 'info' }
    }
    repaint()
  }, [betRef, drawCard, placeBet, repaint])

  const toggleHold = useCallback(
    (i: number) => {
      if (phaseRef.current !== 'draw') return
      const next = heldRef.current.slice()
      next[i] = !next[i]
      heldRef.current = next
      repaint()
    },
    [repaint],
  )

  /* ---------------- window.VideoPokerGame ----------------
     NOT called "VideoPokerAPI" like every sibling game's window global
     (HoldemAPI, BattleshipAPI, KenoAPI, ...) — this exact name and shape
     (`{ evaluate }`) is a HARD PRE-EXISTING TYPE CONTRACT already compiled
     into agentUi.ts (`VideoPokerGameType`, `window.VideoPokerGame?:` in
     its `declare global` block), not a naming convention invented here.
     agentUi.ts calls `window.VideoPokerGame!.evaluate(cards)` TWICE
     (agentUi.ts:697 for its own fallback-holds heuristic, :730 to describe
     the dealt hand to the model) — it is the SAME evaluator this
     component uses for its own scoring, exposed so the agent never
     re-derives poker hand ranking from scratch.

     Registered on mount, DELETED on unmount — same discipline as every
     other window.*API in this codebase (HoldemGame.tsx's window.HoldemAPI
     is the reference precedent): a stale global would make
     videopoker.detect() answer for a route that no longer has a live
     round, and the agent would evaluate/hold into a dead hand. */
  useEffect(() => {
    const api = { evaluate: evaluateHand }
    // Deliberately a PLAIN assignment — no `as unknown as` cast. The whole
    // point is to let tsc check `api` against agentUi.ts's own
    // `declare global { interface Window { VideoPokerGame?: VideoPokerGameType } }`
    // for real: `evaluateHand`'s parameter is typed as `EvalCard` (see its
    // doc comment above), which is structurally identical to agentUi.ts's
    // `Card` type, specifically so this line type-checks without a bypass.
    window.VideoPokerGame = api
    return () => {
      delete window.VideoPokerGame
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  /* ---------------- render ---------------- */
  const phase = phaseRef.current
  const hand = handRef.current
  const held = heldRef.current
  const faceDownSet = faceDownRef.current
  const result = resultRef.current
  const highlightKey = highlightRef.current
  const dealt = dealtRef.current
  const instant = instantRef.current

  return (
    <div>
      <PageHead
        title="Video Poker"
        sub="Jacks or Better. Deal five, hold the ones you want, and draw. Pair of jacks or higher pays."
        icon="club"
      />

      <GameLayout>
        <Panel className="min-w-0">
          <Felt>
            <div className="vp-cards flex flex-wrap gap-2 justify-center py-2" id="vpCards">
              {Array.from({ length: 5 }, (_, i) => {
                const card = dealt ? hand[i] : undefined
                const isHeld = dealt && held[i]
                return (
                  <div
                    key={i}
                    className={`vp-slot relative${isHeld ? ' held' : ''}`}
                    data-idx={i}
                    onClick={phase === 'draw' ? () => toggleHold(i) : undefined}
                    style={{ cursor: phase === 'draw' ? 'pointer' : 'default' }}
                  >
                    {isHeld && (
                      <div
                        className="vp-hold-badge absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                        style={{ background: 'var(--color-gold)', color: '#05070c' }}
                      >
                        HELD
                      </div>
                    )}
                    {/* Keyed by this slot's generation counter, NOT array
                        index (contrast BlackjackGame.tsx's `key={i}`) — only
                        a fresh DEAL bumps the generation (a re-deal reusing
                        the same 5 DOM positions still pops in via `Reveal`).
                        A draw-REPLACEMENT no longer bumps it (see doDraw()'s
                        own comment): the slot's `Card` instance stays
                        mounted through the whole replace cycle, and its
                        rank/suit + `faceDown` props changing in place is
                        what drives Card's real 3D flip instead of a
                        Reveal remount — no blank frame. See the module doc
                        block. */}
                    <Reveal
                      key={card ? cardGenRef.current[i] : `empty-${i}`}
                      as="div"
                      preset="scaleIn"
                      duration={0.24}
                    >
                      {card ? (
                        <Card rank={card.rank} suit={card.suit.s} faceDown={faceDownSet.has(i)} size="lg" />
                      ) : (
                        <Card rank="" suit="♠" faceDown size="lg" />
                      )}
                    </Reveal>
                  </div>
                )
              })}
            </div>
            <div
              className="bj-result text-center text-sm mt-3"
              id="vpResult"
              style={{ color: TONE_COLOR[result.tone] }}
            >
              {result.text}
            </div>
          </Felt>

          <div className="divider my-5 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="paytable">
            <table className="w-full border-collapse" id="vpPaytable">
              <tbody>
                {PAYTABLE.map((p) => {
                  const hit = p.key === highlightKey
                  return (
                    <tr key={p.key} data-row={p.key}>
                      <td
                        className="py-1 px-2 border-b border-line-soft"
                        style={{ color: hit ? 'var(--color-gold-2)' : undefined }}
                      >
                        {p.label}
                      </td>
                      <td className="py-1 px-2 border-b border-line-soft text-right">
                        <span
                          className="pay-mult font-bold"
                          style={{ color: hit ? 'var(--color-gold-2)' : 'var(--color-muted)' }}
                        >
                          {p.pay}×
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="payline-note text-xs text-muted mt-2">
              Payouts are total returned per $1 staked (Jacks pays 1× = your bet back).
            </p>
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} defaultValue={25} />

          <Button id="dealBtn" variant="green" size="lg" block disabled={phase !== 'idle'} onClick={deal}>
            Deal
          </Button>
          <Button
            id="drawBtn"
            variant="gold"
            size="lg"
            block
            disabled={phase !== 'draw'}
            onClick={doDraw}
            className="mt-2.5"
          >
            Draw
          </Button>

          <p className="hint text-xs text-faint mt-4">
            After the deal, click cards to <strong>Hold</strong> them, then press Draw to replace the rest.
          </p>

          <label className="vp-toggle flex items-center gap-2 text-xs text-muted mt-3">
            <input type="checkbox" id="vpInstant" checked={instant} onChange={(e) => setInstant(e.target.checked)} />
            Instant draw
            <span className="text-faint">— flip the new cards at once instead of dealing them one by one</span>
          </label>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-4">
            <Stat k="Last win" v={<span id="lastWin">{lastWinRef.current}</span>} />
            <Stat k="Best win" v={<span id="bestWin">{fmt(bestWinRef.current)}</span>} />
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
