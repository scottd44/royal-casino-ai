import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { Icon } from '@/platform/icons'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { AnimatedNumber, Reveal } from '@/platform/motion'
import { Card, type CardSuit } from '../../components/Card'
import { Felt } from '../../components/Felt'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money, randInt, pick } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'

/* ============================================================
   Hilo — ported from js/games/hilo.js. Higher/lower card guessing with a
   compounding multiplier; correct calls chain, one wrong call busts.

   AGENT CONTRACT (agent-ui.js:793-853) — every one of these is load-bearing:

     detect()   #higherBtn + #hiloCard present
     reads      `$("#hiloCard .rank-top").textContent.trim().slice(0, -1)`
                — the WHOLE textContent minus the last char (the suit glyph).
                `Card` renders `.rank-top` as `{rank}<br/>{suit}` (no
                separator — Card.tsx's own contract note), so this slice
                lands on exactly the rank string, same as every other
                card-reading adapter in this codebase.
     buttons    #startBtn, #higherBtn, #lowerBtn, #cashBtn — individually
                disabled per phase (see setControls()/updateGuessButtons()
                below, ported 1:1 from hilo.js:105-127).
     numbers    #runMult — read raw via `parseFloat(...)`. NUMERIC_CONTRACT_IDS
                (platform/agent/contractIds.ts) already lists it; AnimatedNumber's
                own isNumericContractId guard refuses to tween it, so the id is
                just passed straight through here, honestly.
     result     #hiloMsg textContent, read once the loop exits.

   ACE IS LOW — hilo.js:4, restated because it is the one detail in this file
   most likely to get "corrected" by mistake: `rankOf = {A:1, J:11, Q:12, K:13}`
   in the adapter (agent-ui.js:796), matching hilo.js's own `rankLabel`. A King
   (13) is the HIGH card here, not an Ace. Every odds formula below is built on
   that ordering — flipping it would silently invert every call's true chance.

   ODDS / STEP MULTIPLIER — hilo.js:26-28, and re-derived independently by the
   adapter itself (agent-ui.js:822) for its own gameState, so this must match
   EXACTLY or the agent's stated odds diverge from what actually pays out:
     chanceHigher(r) = (14 - r) / 13   -- P(next rank >= r), ties count as a win
     chanceLower(r)  = r / 13          -- P(next rank <= r), ties count as a win
     multFor(chance) = HOUSE_EDGE / chance   (HOUSE_EDGE = 0.99)
   The rarer the call (smaller chance), the bigger the step — a low-probability
   call compounds the running multiplier by a bigger factor, exactly mirroring
   the adapter's own "the low-chance call pays more" framing (agent-ui.js:838).
   Chances OVERLAP at the tie rank (hilo.js:25's own comment) — that overlap is
   what makes "or same" a genuine tie-wins-both-ways rule, not a rounding quirk.

   The deck does NOT deplete (hilo.js:23's drawCard draws a fresh independent
   card every time) — no card-counting angle here, next card is always drawn
   from a full 52-card deck.
   ============================================================ */

const HOUSE_EDGE = 0.99
const SUITS: CardSuit[] = ['♠', '♣', '♥', '♦']

type HiloCard = { rank: number; suit: CardSuit }
type HistoryEntry = { label: string; win?: boolean }
type MsgTone = 'idle' | 'live' | 'win' | 'lose'

/** 1 -> "A", 11 -> "J", 12 -> "Q", 13 -> "K", else the number itself.
 *  Verbatim hilo.js:22 — this is also exactly what the adapter's own
 *  `rankOf` (agent-ui.js:796) inverts when it reads the card back. */
function rankLabel(r: number): string {
  return r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r)
}

function chanceHigher(r: number): number {
  return (14 - r) / 13
}

function chanceLower(r: number): number {
  return r / 13
}

function multFor(chance: number): number {
  return HOUSE_EDGE / chance
}

function drawCard(): HiloCard {
  return { rank: randInt(1, 13), suit: pick(SUITS) }
}

const TONE_COLOR: Record<MsgTone, string> = {
  idle: 'var(--color-muted)',
  live: 'var(--color-gold-2)',
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
}

export default function HiloGame(): JSX.Element {
  const isMobile = useIsMobile()
  const betRef = useBetRef()

  const [current, setCurrent] = useState<HiloCard | null>(null)
  const [runMult, setRunMult] = useState(1)
  const [active, setActive] = useState(false)
  const [stake, setStake] = useState(0)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [msg, setMsg] = useState('Set your bet and press Start.')
  const [msgTone, setMsgTone] = useState<MsgTone>('idle')
  // Bumped on every fresh deal so the wrapping <Reveal> below genuinely
  // remounts (a real mount/unmount, not the same node persisting) — the
  // "each new card is a genuine mount moment" case Reveal.tsx's own doctrine
  // requires (never wrap a persistent container).
  // Unlike VideoPoker's old bug, this is never a bare `faceDown` toggle on
  // an already-dealt card racing a remount: the idle placeholder (rank
  // "A"/"♠", faceDown) is purely decorative flavor, never real deal state
  // that later gets revealed in place, and every bump in start()/guess()
  // below lands in the SAME write that assigns a brand-new `current` card
  // — so the remount+scaleIn is the intended "next card lands" animation,
  // not two states of one card fighting each other.
  const [cardKey, setCardKey] = useState(0)

  // Truth for the guess()/cashOut() guards lives in refs: the agent fires
  // higher/lower back-to-back (agent-ui.js:848's loop), and a stale closure
  // over state (rather than a synchronous read) is exactly how a double-call
  // could race a not-yet-committed React update. Same reasoning as Mines'
  // minesRef/revealedRef/activeRef.
  const currentRef = useRef<HiloCard | null>(null)
  const runMultRef = useRef(1)
  const activeRef = useRef(false)
  const stakeRef = useRef(0)

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  function start() {
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      setMsg('Not enough cash for that bet.')
      setMsgTone('lose')
      return
    }

    const card = drawCard()
    currentRef.current = card
    runMultRef.current = 1
    activeRef.current = true
    stakeRef.current = bet

    setCurrent(card)
    setRunMult(1)
    setActive(true)
    setStake(bet)
    setHistory([{ label: rankLabel(card.rank) }])
    setCardKey((k) => k + 1)
    setMsg('Higher or lower?')
    setMsgTone('live')
  }

  function guess(side: 'higher' | 'lower') {
    if (!activeRef.current || !currentRef.current) return
    const rank = currentRef.current.rank
    const chance = side === 'higher' ? chanceHigher(rank) : chanceLower(rank)

    let next = drawCard()
    // Rigged odds (hilo.js:150): draw a card on the winning side of the call
    // instead of a fresh independent one.
    if (cheatWin()) {
      const r = side === 'higher' ? randInt(rank, 13) : randInt(1, rank)
      next = { rank: r, suit: pick(SUITS) }
    }

    // Tie wins either way — `>=`/`<=`, not `>`/`<` (hilo.js:156).
    const won = side === 'higher' ? next.rank >= rank : next.rank <= rank
    const dealtLabel = rankLabel(next.rank)

    currentRef.current = next
    setCurrent(next)
    setCardKey((k) => k + 1)

    if (won) {
      const mult = runMultRef.current * multFor(chance)
      runMultRef.current = mult
      setRunMult(mult)
      setHistory((h) => [...h, { label: dealtLabel, win: true }])
      setMsg(`${dealtLabel} — correct! Now ${mult.toFixed(2)}×.`)
      setMsgTone('win')
      // Round stays live — startBtn/betInput stay locked, cashBtn unlocks
      // once runMult clears 1 (see the cashBtn disabled expression below).
    } else {
      activeRef.current = false
      setActive(false)
      setHistory((h) => [...h, { label: dealtLabel, win: false }])
      setMsg(`${dealtLabel} — wrong. You lose ${money(stakeRef.current)}.`)
      setMsgTone('lose')
      runMultRef.current = 1
      setRunMult(1)
    }
  }

  function cashOut() {
    if (!activeRef.current || runMultRef.current <= 1) return
    const mult = runMultRef.current
    const winnings = Math.floor(stakeRef.current * mult)
    payout(winnings)
    activeRef.current = false
    setActive(false)
    setMsg(`Cashed out ${mult.toFixed(2)}× — +${fmt(winnings - stakeRef.current)} profit!`)
    setMsgTone('win')
  }

  const rank = current?.rank ?? null
  const chHigher = rank != null ? chanceHigher(rank) : 0
  const chLower = rank != null ? chanceLower(rank) : 0
  const canCash = active && runMult > 1

  return (
    <div>
      <PageHead
        title="Hilo"
        sub="Will the next card be higher or lower? Ace is low. A tie wins either way. Chain correct calls for a bigger multiplier and cash out any time."
        icon="arrow-up-down"
      />

      <GameLayout>
        <Panel className="min-w-0">
          <Felt>
            <div className={`flex flex-col items-center justify-center py-2 ${isMobile ? 'min-h-[160px] gap-2' : 'min-h-[240px] gap-4'}`}>
              <div id="hiloCard" className="cards flex justify-center">
                <Reveal key={cardKey} preset="scaleIn" duration={0.25}>
                  {current ? (
                    <Card rank={rankLabel(current.rank)} suit={current.suit} size="lg" />
                  ) : (
                    <Card rank="A" suit="♠" faceDown size="lg" className="opacity-40" />
                  )}
                </Reveal>
              </div>
              <div
                id="hiloMsg"
                className="text-center text-sm font-medium"
                style={{ color: TONE_COLOR[msgTone] }}
              >
                {msg}
              </div>
            </div>
          </Felt>

          <div className="my-4 border-t" style={{ borderColor: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Recent cards</h4>
            <div id="history" className="flex flex-wrap gap-1.5">
              {history
                .slice(-14)
                .reverse()
                .map((h, i) => (
                  <span
                    key={i}
                    className={`rounded-md num border ${isMobile ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}
                    style={{
                      borderColor: 'var(--glass-line)',
                      background:
                        h.win === undefined
                          ? 'var(--glass)'
                          : h.win
                            ? 'color-mix(in srgb, var(--color-green) 18%, transparent)'
                            : 'color-mix(in srgb, var(--color-red) 18%, transparent)',
                      color:
                        h.win === undefined
                          ? 'var(--color-text)'
                          : h.win
                            ? 'var(--color-green)'
                            : 'var(--color-red)',
                    }}
                  >
                    {h.label}
                  </span>
                ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <BetField inputRef={betRef} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
              Your call
            </label>
            <Button
              id="higherBtn"
              variant="green"
              block
              disabled={!active}
              onClick={() => guess('higher')}
              className="mb-2"
              style={{ padding: '12px' }}
            >
              <Icon name="chevron-up" size={16} className="inline -mt-0.5" />{' '}
              {active
                ? `Higher or same · ${(chHigher * 100).toFixed(1)}% · ${multFor(chHigher).toFixed(2)}×`
                : 'Higher or same'}
            </Button>
            <Button
              id="lowerBtn"
              variant="blue"
              block
              disabled={!active}
              onClick={() => guess('lower')}
              style={{ padding: '12px' }}
            >
              <Icon name="chevron-down" size={16} className="inline -mt-0.5" />{' '}
              {active
                ? `Lower or same · ${(chLower * 100).toFixed(1)}% · ${multFor(chLower).toFixed(2)}×`
                : 'Lower or same'}
            </Button>
          </div>

          <div className={`stat-grid grid grid-cols-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            <Stat
              k="Multiplier"
              v={<AnimatedNumber value={runMult} format={(n) => `${n.toFixed(2)}×`} id="runMult" />}
            />
            <Stat
              k="Cash out"
              v={
                canCash ? (
                  <AnimatedNumber value={Math.floor(stake * runMult)} id="cashVal" />
                ) : (
                  <span id="cashVal">—</span>
                )
              }
            />
          </div>

          <Button
            id="startBtn"
            variant="gold"
            size="lg"
            block
            disabled={active}
            onClick={start}
            className="mt-4"
          >
            Start Game
          </Button>
          <Button
            id="cashBtn"
            variant="green"
            size="lg"
            block
            disabled={!canCash}
            onClick={cashOut}
            className="mt-2.5"
          >
            Cash Out
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
