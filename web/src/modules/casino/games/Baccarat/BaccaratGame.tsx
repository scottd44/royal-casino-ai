import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { GameLayout, Panel, PageHead, Button, Stat, cn } from '@/platform/ui'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { Reveal } from '@/platform/motion'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt } from '@/platform/money/format'
import { baccaratSounds } from './sounds'
import { toast } from '@/platform/ui/toast'
import type { ToastType } from '@/platform/ui/toast'
import { Card } from '../../components/Card'
import type { CardSuit } from '../../components/Card'
import { Felt } from '../../components/Felt'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'

/* ============================================================
   Baccarat (Punto Banco) — ported from js/games/baccarat.js. Bet Player,
   Banker, or Tie; two fixed-rule hands are dealt, closest to 9 wins. You
   never choose a card — the third-card table below decides everything.
   Payouts: Player 1:1, Banker 1:1 minus 5% commission (0.95:1), Tie 8:1.
   Player/Banker push on a tie.

   AGENT CONTRACT (agent-ui.js:1102) — every one of these is load-bearing:
     detect()   !!$("#bacDeal") && !!document.querySelector("[data-side]")
                — a DATA-ATTRIBUTE selector, not an id (contractIds.ts's
                own note: [data-side] isn't tracked there, only real ids
                are). Three elements below carry data-side="player" /
                "banker" / "tie".
     play()     clicks `[data-side="<pick>"]` to SELECT a side BEFORE
                applying the bet and dealing (agent-ui.js:1116-1117) —
                selection must be a plain click handler, no two-step
                confirm.
     round      clicks #bacDeal, then waits up to 7s for #bacDeal to
                re-enable (agent-ui.js:1121) — the reveal animation below
                (card-by-card, 340ms/step, baccarat.js:190-196) must
                finish and settle well inside that window.
     result     #bacResult textContent (agent-ui.js:1122).

   THIRD-CARD DRAWING TABLE — the highest-fidelity-risk part of this port,
   reproduced verbatim from baccarat.js:30-38/44-48, not approximated:
     1. Natural: if either hand totals 8 or 9 on the first two cards, NO
        further cards are drawn for either side (baccarat.js:44 `pt < 8 &&
        bt < 8` guards the whole draw phase).
     2. Player draws a third card iff its own two-card total is 0-5
        (`pt <= 5`); otherwise it stands. `p3v` records that drawn card's
        VALUE (0-9, ten/face = 0) — or stays `null` if Player stood, which
        matters below.
     3. Banker's draw/stand depends on BOTH its own total AND — only when
        Player drew — the VALUE of Player's third card specifically
        (bankerDraws()):
          bt<=2            -> always draws
          bt===3           -> draws unless Player's 3rd card was an 8
          bt===4           -> draws iff Player's 3rd card was 2-7
          bt===5           -> draws iff Player's 3rd card was 4-7
          bt===6           -> draws iff Player's 3rd card was 6-7
          bt===7           -> always stands
          Player stood (p3v === null) -> Banker draws iff bt <= 5
     Totals are recomputed AFTER both draw decisions (baccarat.js:49) since
     a card drawn by either side changes both hands' final totals.

   Round state deliberately does NOT need refs the way Blackjack/Mines do —
   a coup is computed as one atomic pure function (dealCoup below), never a
   multi-click sequence read-then-written mid-round — so plain useState is
   enough; only the reveal timer needs a ref (for cleanup on unmount).
   ============================================================ */

type Side = 'player' | 'banker' | 'tie'
type HandCard = { rank: string; suit: CardSuit }
type CoupResult = 'P' | 'B' | 'T'
type Coup = { P: HandCard[]; B: HandCard[]; pt: number; bt: number; result: CoupResult }

const SUITS: CardSuit[] = ['♠', '♣', '♥', '♦']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

function buildShoe(): HandCard[] {
  // 8 decks, verbatim (baccarat.js:20-24).
  const d: HandCard[] = []
  for (let n = 0; n < 8; n++) SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })))
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function cardVal(rank: string): number {
  return rank === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(rank) ? 0 : Number(rank)
}

function total(cards: HandCard[]): number {
  return cards.reduce((a, c) => a + cardVal(c.rank), 0) % 10
}

/** The banker's draw/stand table — see the file-header note above. */
function bankerDraws(bt: number, p3v: number | null): boolean {
  if (p3v === null) return bt <= 5 // player stood
  if (bt <= 2) return true
  if (bt === 3) return p3v !== 8
  if (bt === 4) return p3v >= 2 && p3v <= 7
  if (bt === 5) return p3v >= 4 && p3v <= 7
  if (bt === 6) return p3v >= 6 && p3v <= 7
  return false // 7 stands
}

/** One full coup, dealt by fixed rule — verbatim baccarat.js:41-51. */
function dealCoup(draw: () => HandCard): Coup {
  const P = [draw(), draw()]
  const B = [draw(), draw()]
  let pt = total(P)
  let bt = total(B)
  if (pt < 8 && bt < 8) {
    // no natural
    let p3v: number | null = null
    if (pt <= 5) {
      const c = draw()
      P.push(c)
      p3v = cardVal(c.rank)
    }
    if (bankerDraws(bt, p3v)) B.push(draw())
  }
  pt = total(P)
  bt = total(B)
  return { P, B, pt, bt, result: pt > bt ? 'P' : bt > pt ? 'B' : 'T' }
}

/** Total returned (incl. stake) for a bet on `side` given `result` — verbatim baccarat.js:54-58. */
function payoutFor(side: Side, result: CoupResult, bet: number): number {
  if (side === 'player') return result === 'P' ? bet * 2 : result === 'T' ? bet : 0
  if (side === 'banker') return result === 'B' ? Math.floor(bet * 1.95) : result === 'T' ? bet : 0
  return result === 'T' ? bet * 9 : 0 // tie 8:1
}

const wins = (side: Side, r: CoupResult): boolean =>
  (side === 'player' && r === 'P') || (side === 'banker' && r === 'B') || (side === 'tie' && r === 'T')

type Result = { msg: string; tone: ToastType }

const TONE_COLOR: Record<ToastType, string> = {
  win: 'var(--color-green)',
  lose: 'var(--color-red)',
  info: 'var(--color-gold-2)',
}

const SIDE_LABEL: Record<Side, string> = { player: 'Player', banker: 'Banker', tie: 'Tie' }
const SIDE_MULT: Record<Side, number> = { player: 1, banker: 0.95, tie: 8 }

export default function BaccaratGame(): JSX.Element {
  const betRef = useBetRef()
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const shoeRef = useRef<HandCard[]>([])
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [side, setSide] = useState<Side>('banker')
  const [dealing, setDealing] = useState(false)
  const [shownP, setShownP] = useState<HandCard[]>([])
  const [shownB, setShownB] = useState<HandCard[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [beads, setBeads] = useState<CoupResult[]>([])

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current)
    },
    [],
  )

  const draw = useCallback((): HandCard => {
    if (shoeRef.current.length < 6) shoeRef.current = buildShoe()
    return shoeRef.current.pop() as HandCard
  }, [])

  const finish = useCallback(
    (coup: Coup, bet: number, roundSide: Side) => {
      const ret = payoutFor(roundSide, coup.result, bet)
      const net = ret - bet
      if (ret > 0) payout(ret)
      setBeads((h) => [...h, coup.result])

      const label =
        coup.result === 'P'
          ? `Player wins ${coup.pt}–${coup.bt}`
          : coup.result === 'B'
            ? `Banker wins ${coup.bt}–${coup.pt}`
            : `Tie at ${coup.pt}`

      if (net > 0) {
        setResult({ msg: `${label} — +${fmt(net)}!`, tone: 'win' })
        toast(`${label} — won +${fmt(net)}!`, 'win')
        if (roundSide === 'tie') baccaratSounds.bigwin()
        else baccaratSounds.win()
      } else if (net === 0) {
        setResult({ msg: `${label} — push, bet returned.`, tone: 'info' })
        baccaratSounds.cashout()
      } else {
        setResult({ msg: `${label}. You lose.`, tone: 'lose' })
        toast(`${label} — no win.`, 'lose')
        baccaratSounds.lose()
      }
      setDealing(false)
    },
    [payout],
  )

  const doDeal = useCallback(() => {
    if (dealing) return
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      toast('Not enough cash for that bet.', 'lose')
      return
    }

    // Captured at deal-time, not re-read live off `side` during the reveal
    // -- the agent never touches [data-side] mid-round anyway (it selects
    // BEFORE dealing, agent-ui.js:1116-1119), so this only affects what a
    // human clicking the side buttons during the ~2s reveal would see; a
    // captured stake side is the less surprising behaviour of the two.
    const roundSide = side

    let coup = dealCoup(draw)
    // Rigged odds: keep dealing fresh coups until the picked side wins (baccarat.js:174).
    if (cheatWin() && !wins(roundSide, coup.result)) {
      for (let i = 0; i < 400 && !wins(roundSide, coup.result); i++) coup = dealCoup(draw)
    }

    setDealing(true)
    setResult(null)
    setShownP([])
    setShownB([])

    // Reveal card-by-card for drama, matching baccarat.js:184-196's own
    // interleaved P/B sequence (Player's slot i, then Banker's slot i) --
    // each push is a genuine new-card mount, which is what makes wrapping
    // these in <Reveal> below honest rather than decorative.
    const seq: Array<['P' | 'B', HandCard]> = []
    const maxLen = Math.max(coup.P.length, coup.B.length)
    for (let i = 0; i < maxLen; i++) {
      if (coup.P[i]) seq.push(['P', coup.P[i]])
      if (coup.B[i]) seq.push(['B', coup.B[i]])
    }

    let i = 0
    const step = () => {
      if (i >= seq.length) {
        finish(coup, bet, roundSide)
        return
      }
      const [who, card] = seq[i]
      if (who === 'P') setShownP((s) => [...s, card])
      else setShownB((s) => [...s, card])
      baccaratSounds.tick()
      i++
      revealTimer.current = setTimeout(step, 340)
    }
    step()
  }, [betRef, dealing, draw, finish, placeBet, side])

  const pScoreText = shownP.length === 0 ? '—' : String(total(shownP))
  const bScoreText = shownB.length === 0 ? '—' : String(total(shownB))

  const bet = readBet(betRef)
  const profitText = bet > 0 ? `+${fmt(Math.floor(bet * SIDE_MULT[side]))}` : '—'
  const isMobile = useIsMobile()

  return (
    <div>
      <PageHead
        title="Baccarat"
        sub="Back the Player or Banker to land closest to 9 — or take the Tie. Banker is the smartest bet; Tie pays 8:1 but rarely hits."
        icon="heart"
      />

      <GameLayout>
        <Panel className="min-w-0">
          <Felt>
            <div
              className={cn(
                'bac-hands flex flex-wrap justify-center items-start',
                isMobile ? 'gap-3' : 'gap-6 sm:gap-8',
              )}
            >
              <div className="bac-hand text-center">
                <div className="hand-label flex items-center justify-center gap-2 text-sm text-muted mb-2">
                  <span>Player</span>
                  <span className="hand-score num text-text" id="bacPScore">
                    {pScoreText}
                  </span>
                </div>
                <div
                  className={cn(
                    'cards flex flex-wrap justify-center gap-2 max-w-[340px]',
                    isMobile ? 'min-h-[80px]' : 'min-h-[136px]',
                  )}
                  id="bacP"
                >
                  {/* No faceDown prop is ever passed to Card here — Baccarat
                      never hides a dealt card — so there's no toggle that
                      could race a `key={i}` remount; each i only ever
                      mounts once, when its card is pushed into shownP. */}
                  {shownP.map((c, i) => (
                    <Reveal key={i} as="div" preset="scaleIn" duration={0.22}>
                      <Card rank={c.rank} suit={c.suit} size="lg" />
                    </Reveal>
                  ))}
                </div>
              </div>

              <div className={cn('bac-vs text-muted font-bold text-sm shrink-0', isMobile ? 'mt-6' : 'mt-8')}>VS</div>

              <div className="bac-hand text-center">
                <div className="hand-label flex items-center justify-center gap-2 text-sm text-muted mb-2">
                  <span>Banker</span>
                  <span className="hand-score num text-text" id="bacBScore">
                    {bScoreText}
                  </span>
                </div>
                <div
                  className={cn(
                    'cards flex flex-wrap justify-center gap-2 max-w-[340px]',
                    isMobile ? 'min-h-[80px]' : 'min-h-[136px]',
                  )}
                  id="bacB"
                >
                  {shownB.map((c, i) => (
                    <Reveal key={i} as="div" preset="scaleIn" duration={0.22}>
                      <Card rank={c.rank} suit={c.suit} size="lg" />
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="bj-result text-center text-sm mt-4 min-h-[20px]"
              id="bacResult"
              style={{ color: result ? TONE_COLOR[result.tone] : undefined }}
            >
              {result?.msg ?? 'Place a bet and deal.'}
            </div>
          </Felt>

          <div className="my-4 border-t" style={{ borderColor: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Bead plate</h4>
            <div className="bac-beads flex flex-wrap gap-1.5" id="bacBeads">
              {beads.slice(-42).map((r, i) => (
                <span
                  key={i}
                  className={`bac-bead ${r} px-2 py-1 rounded-md text-xs num border`}
                  style={{
                    borderColor: 'var(--glass-line)',
                    background:
                      r === 'P'
                        ? 'color-mix(in srgb, var(--color-blue) 18%, transparent)'
                        : r === 'B'
                          ? 'color-mix(in srgb, var(--color-red) 18%, transparent)'
                          : 'color-mix(in srgb, var(--color-gold) 18%, transparent)',
                    color:
                      r === 'P' ? 'var(--color-blue)' : r === 'B' ? 'var(--color-red)' : 'var(--color-gold)',
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <BetField inputRef={betRef} defaultValue={25} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Bet on</label>
            {/* Three [data-side] elements -- the adapter's own detect() half
                (agent-ui.js:1103) and its play() selection target
                (agent-ui.js:1116, `document.querySelector('[data-side="banker"]')`
                etc.) BEFORE applying the bet and dealing. */}
            <div className="bet-row flex gap-2">
              <Button
                id="bacPlayer"
                data-side="player"
                variant={side === 'player' ? 'green' : 'ghost'}
                className="flex-1 flex-col items-center gap-0.5"
                onClick={() => setSide('player')}
              >
                Player <small className="opacity-70">1:1</small>
              </Button>
              <Button
                id="bacBanker"
                data-side="banker"
                variant={side === 'banker' ? 'green' : 'ghost'}
                className="flex-1 flex-col items-center gap-0.5"
                onClick={() => setSide('banker')}
              >
                Banker <small className="opacity-70">0.95:1</small>
              </Button>
              <Button
                id="bacTie"
                data-side="tie"
                variant={side === 'tie' ? 'green' : 'ghost'}
                className="flex-1 flex-col items-center gap-0.5"
                onClick={() => setSide('tie')}
              >
                Tie <small className="opacity-70">8:1</small>
              </Button>
            </div>
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2">
            <Stat k="Your bet" v={<span id="bacSide">{SIDE_LABEL[side]}</span>} />
            <Stat k="Profit on win" v={<span id="bacProfit">{profitText}</span>} />
          </div>

          <Button
            id="bacDeal"
            variant="green"
            size="lg"
            block
            disabled={dealing}
            onClick={doDeal}
            className="mt-4"
          >
            Deal
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
