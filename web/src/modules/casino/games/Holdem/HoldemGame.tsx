import { useCallback, useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Button } from '../../components/Panel'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { money } from '@/platform/money/format'
import {
  makeTable, equity, blindsFor, fmtCard, rankStr, isRed, SUITS,
  type Table, type Action, type Card,
} from './holdemEngine'

/* ============================================================
   Texas Hold'em — ported from js/games/holdem.js.

   AGENT CONTRACT (agent-ui.js:1045):
     detect()  window.HoldemAPI && #hcControls
     play()    sit() if not seated, nextHand() if the hand is over, then
               loops: waitFor(humanTurn() || handOver()), state(), act(move),
               and finally cashOut() to bank the hand as the round's net.

   All nine API members must exist, and state() must return every field the
   adapter reads: hole board pot toCall stack opponents bb equity potOdds
   legal minRaiseTo maxRaiseTo.

   The API is registered from an effect and REMOVED on unmount. A stale
   window.HoldemAPI would make holdem.detect() return true on another
   route, and the agent would sit there calling act() into a dead table.
   ============================================================ */

const MIN_BUYIN = 100
const NAMES = ['You', 'Ace', 'Boss', 'Trixie']
const AGGR = [0, 0.35, 0.65, 0.5]
const BOT_DELAY_MS = 650

type Snapshot = {
  seated: boolean
  awaitingHuman: boolean
  handOver: boolean
  community: Card[]
  hole: Card[]
  stacks: number[]
  pot: number
  toCall: number
  lastActions: string[]
  folded: boolean[]
  log: string[]
  bb: number
}

export default function HoldemGame() {
  const balance = useWalletStore((s) => s.balance)
  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  // All mutable table state lives in refs. The engine is synchronous and the
  // agent drives it far faster than React would settle a state round-trip;
  // `tick` exists purely to ask React to re-read the refs and repaint.
  const tblRef = useRef<Table | null>(null)
  const stacksRef = useRef<number[]>([0, 1000, 1000, 1000])
  const seatedRef = useRef(false)
  const awaitingHumanRef = useRef(false)
  const buttonRef = useRef(0)
  const genRef = useRef(0)
  const buyInRef = useRef(1000)
  const blindsRef = useRef({ sb: 10, bb: 20 })
  const logRef = useRef<string[]>(['Welcome to the table. Sit down to play.'])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const log = useCallback((line: string) => {
    logRef.current = [...logRef.current.slice(-40), line]
  }, [])

  /* ---------------- bot brain (verbatim behaviour) ---------------- */
  const botDecide = useCallback((i: number): Action => {
    const tbl = tblRef.current!
    const p = tbl.T.players[i]
    const T = tbl.T
    const numOpp = Math.max(1, tbl.contenders().length - 1)
    const eq = equity(p.hole, T.community, numOpp, 140)
    const toCall = T.currentBet - p.betRound
    const pot = tbl.potTotal()
    const aggr = p._aggr ?? 0.4
    const acts = tbl.legal()
    const raise = acts.find((a) => a.type === 'raise')
    const { bb: BB } = blindsRef.current
    const raiseTo = () => {
      const size = Math.round((pot > 0 ? pot : BB) * (0.5 + Math.random() * 0.7))
      return Math.max(raise!.min!, Math.min(raise!.max!, T.currentBet + size))
    }

    if (toCall <= 0) {
      if (raise && (eq > 0.58 || Math.random() < 0.1 * aggr) && Math.random() < 0.55 + aggr * 0.3) {
        return { type: 'raise', amount: raiseTo() }
      }
      return { type: 'check' }
    }
    const potOdds = toCall / (pot + toCall)
    if (raise && eq > 0.78 && Math.random() < 0.5 + aggr) return { type: 'raise', amount: raiseTo() }
    if (eq >= potOdds - 0.03) {
      if (raise && eq > 0.62 && Math.random() < aggr * 0.5) return { type: 'raise', amount: raiseTo() }
      return { type: 'call' }
    }
    if (raise && Math.random() < 0.05 * aggr) return { type: 'raise', amount: raiseTo() }
    return { type: 'fold' }
  }, [])

  const onHandOver = useCallback(() => {
    const tbl = tblRef.current
    if (!tbl) return
    stacksRef.current = tbl.T.players.map((p) => p.stack)
    const won = tbl.T.result?.winnings[0] || 0
    log(won > 0 ? `You won ${money(won)}.` : 'Hand over.')
    awaitingHumanRef.current = false
    repaint()
  }, [log, repaint])

  const drive = useCallback(() => {
    const tbl = tblRef.current
    if (!tbl) return
    const myGen = genRef.current
    const T = tbl.T
    if (T.handOver || T.actionOn < 0) { onHandOver(); return }
    if (T.actionOn === 0) { awaitingHumanRef.current = true; repaint(); return }
    awaitingHumanRef.current = false
    repaint()

    timerRef.current = setTimeout(() => {
      const cur = tblRef.current
      if (!cur || genRef.current !== myGen || cur.T.handOver) return
      const i = cur.T.actionOn
      const a = botDecide(i)
      cur.act(a)
      const amt =
        a.type === 'raise'
          ? ` to ${money(cur.T.players[i].betRound)}`
          : a.type === 'call'
            ? ` ${money(cur.T.players[i].betRound)}`
            : ''
      log(`${NAMES[i]}: ${cur.T.players[i].lastAction}${amt}`)
      repaint()
      drive()
    }, BOT_DELAY_MS)
  }, [botDecide, log, onHandOver, repaint])

  const applyRig = useCallback(() => {
    if (!cheatWin()) return
    const tbl = tblRef.current!
    const hu = tbl.T.players[0]
    if (hu.hole.length < 2) return
    for (let m = 0; m < 3; m++) {
      const cand = [tbl.T.deck.pop()!, tbl.T.deck.pop()!]
      if (equity(cand, [], 3, 40) > equity(hu.hole, [], 3, 40)) {
        tbl.T.deck.push(...hu.hole)
        hu.hole = cand
      } else {
        tbl.T.deck.push(...cand)
      }
    }
  }, [])

  const nextHand = useCallback(() => {
    const { sb: SB, bb: BB } = blindsRef.current
    const buyIn = buyInRef.current
    for (let i = 1; i < 4; i++) if (stacksRef.current[i] < BB) stacksRef.current[i] = buyIn
    if (stacksRef.current[0] < BB) { repaint(); return }

    const tbl = makeTable(NAMES, stacksRef.current, SB, BB, buttonRef.current)
    tbl.T.players.forEach((p, i) => (p._aggr = AGGR[i]))
    tbl.startHand()
    tblRef.current = tbl
    applyRig()
    buttonRef.current = tbl.nextAlive(buttonRef.current)
    genRef.current++
    log(`— Hand #${genRef.current} —`)
    awaitingHumanRef.current = false
    repaint()
    drive()
  }, [applyRig, drive, log, repaint])

  const sit = useCallback(() => {
    const bal = useWalletStore.getState().balance
    if (bal < MIN_BUYIN) return
    const buy = Math.max(MIN_BUYIN, Math.min(bal, 1000))
    if (!placeBet(buy)) return
    buyInRef.current = buy
    blindsRef.current = blindsFor(buy)
    stacksRef.current = [buy, buy, buy, buy]
    seatedRef.current = true
    logRef.current = []
    log(
      `You sat down with ${money(buy)}. Blinds ${money(blindsRef.current.sb)}/${money(blindsRef.current.bb)}.`,
    )
    nextHand()
  }, [log, nextHand, placeBet])

  const cashOut = useCallback(() => {
    const stack = stacksRef.current[0]
    if (stack > 0) payout(stack)
    stacksRef.current[0] = 0
    seatedRef.current = false
    tblRef.current = null
    repaint()
  }, [payout, repaint])

  const humanAct = useCallback(
    (a: Action) => {
      const tbl = tblRef.current
      if (!tbl) return
      awaitingHumanRef.current = false
      tbl.act(a)
      log(`You: ${tbl.T.players[0].lastAction}`)
      repaint()
      drive()
    },
    [drive, log, repaint],
  )

  /* ---------------- window.HoldemAPI ----------------
     The adapter's entire view of this game. Registered on mount, DELETED on
     unmount so detect() can never return true for an unmounted table. */
  useEffect(() => {
    const api = {
      seated: () => seatedRef.current,
      handOver: () => !tblRef.current || tblRef.current.T.handOver,
      humanTurn: () =>
        awaitingHumanRef.current &&
        !!tblRef.current &&
        !tblRef.current.T.handOver &&
        tblRef.current.T.actionOn === 0,
      sit: () => { if (!seatedRef.current) sit() },
      nextHand: () => {
        if (
          seatedRef.current &&
          (!tblRef.current || tblRef.current.T.handOver) &&
          stacksRef.current[0] >= blindsRef.current.bb
        ) {
          nextHand()
        }
      },
      cashOut: () => cashOut(),
      act: (a: Action) => {
        if (awaitingHumanRef.current && tblRef.current && tblRef.current.T.actionOn === 0) {
          humanAct(a)
        }
      },
      state: () => {
        const tbl = tblRef.current
        if (!tbl) return null
        const p = tbl.T.players[0]
        const T = tbl.T
        const toCall = T.currentBet - p.betRound
        const pot = tbl.potTotal()
        const numOpp = Math.max(1, tbl.contenders().length - 1)
        const eq = equity(p.hole, T.community, numOpp, 160)
        const legalActs = tbl.legal()
        const raise = legalActs.find((a) => a.type === 'raise')
        return {
          hole: p.hole.map(fmtCard),
          board: T.community.map(fmtCard),
          pot, toCall, stack: p.stack, opponents: numOpp, bb: blindsRef.current.bb,
          equity: eq,
          potOdds: toCall > 0 ? toCall / (pot + toCall) : 0,
          legal: legalActs.map((a) => a.type),
          minRaiseTo: raise ? raise.min! : 0,
          maxRaiseTo: raise ? raise.max! : 0,
        }
      },
    }

    ;(window as unknown as { HoldemAPI: typeof api }).HoldemAPI = api

    return () => {
      delete (window as unknown as { HoldemAPI?: typeof api }).HoldemAPI
      if (timerRef.current) clearTimeout(timerRef.current)
      genRef.current++ // invalidate any in-flight bot timer
    }
  }, [sit, nextHand, cashOut, humanAct])

  /* ---------------- render ---------------- */
  const tbl = tblRef.current
  const snap: Snapshot = {
    seated: seatedRef.current,
    awaitingHuman: awaitingHumanRef.current,
    handOver: !tbl || tbl.T.handOver,
    community: tbl?.T.community ?? [],
    hole: tbl?.T.players[0].hole ?? [],
    stacks: stacksRef.current,
    pot: tbl?.potTotal() ?? 0,
    toCall: tbl ? tbl.T.currentBet - tbl.T.players[0].betRound : 0,
    lastActions: tbl?.T.players.map((p) => p.lastAction) ?? [],
    folded: tbl?.T.players.map((p) => p.folded) ?? [],
    log: logRef.current,
    bb: blindsRef.current.bb,
  }

  const legalNow = snap.awaitingHuman && tbl ? tbl.legal() : []
  const canRaise = legalNow.find((a) => a.type === 'raise')

  return (
    <div>
      <PageHead title="Texas Hold'em" sub="No-limit poker against three bots." />

      <GameLayout>
        <Panel>
          <div className="flex items-center justify-between mb-4 text-sm">
            <span className="text-muted">Pot</span>
            <span className="num text-gold text-lg">{money(snap.pot)}</span>
          </div>

          <div className="flex gap-2 justify-center min-h-[92px] items-center mb-5">
            {snap.community.length === 0 && (
              <span className="text-faint text-sm">
                {snap.seated ? 'Pre-flop' : 'Sit down to play.'}
              </span>
            )}
            {snap.community.map((c, i) => (
              <PlayingCard key={i} card={c} />
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2 mb-5">
            {NAMES.map((n, i) => (
              <div
                key={n}
                className="rounded-[10px] border px-2 py-2 text-center"
                style={{
                  borderColor: 'var(--glass-line)',
                  background: 'var(--glass)',
                  opacity: snap.folded[i] ? 0.4 : 1,
                }}
              >
                <div className="text-xs text-muted truncate">{n}</div>
                <div className="num text-sm text-text">{money(snap.stacks[i] ?? 0)}</div>
                <div className="text-[11px] text-faint h-4">{snap.lastActions[i] ?? ''}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-center min-h-[92px] items-center">
            {snap.hole.map((c, i) => (
              <PlayingCard key={i} card={c} />
            ))}
          </div>
        </Panel>

        {/* The controls panel. #hcControls is half of holdem's detect(). */}
        <Panel>
          <div id="hcControls">
            {!snap.seated ? (
              <Button
                id="hcSit"
                onClick={sit}
                disabled={balance < MIN_BUYIN}
                className="w-full text-bg-0 font-semibold py-3"
                style={{ background: 'var(--color-gold)' }}
              >
                {balance < MIN_BUYIN ? `Need ${money(MIN_BUYIN)} to sit` : 'Sit Down'}
              </Button>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted">To call</span>
                  <span className="num text-text">{money(snap.toCall)}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    id="hcFold"
                    disabled={!snap.awaitingHuman}
                    onClick={() => humanAct({ type: 'fold' })}
                    style={{ background: 'var(--glass)', border: '1px solid var(--glass-line)' }}
                    className="text-text"
                  >
                    Fold
                  </Button>
                  <Button
                    id="hcCall"
                    disabled={!snap.awaitingHuman}
                    onClick={() =>
                      humanAct({ type: snap.toCall > 0 ? 'call' : 'check' })
                    }
                    style={{ background: 'var(--glass)', border: '1px solid var(--glass-line)' }}
                    className="text-text"
                  >
                    {snap.toCall > 0 ? 'Call' : 'Check'}
                  </Button>
                  <Button
                    id="hcRaise"
                    disabled={!snap.awaitingHuman || !canRaise}
                    onClick={() => humanAct({ type: 'raise', amount: canRaise?.min })}
                    className="text-bg-0 font-medium"
                    style={{ background: 'var(--color-green)' }}
                  >
                    Raise
                  </Button>
                </div>

                <Button
                  id="hcNext"
                  disabled={!snap.handOver}
                  onClick={nextHand}
                  className="w-full mt-1 text-text"
                  style={{ background: 'var(--glass)', border: '1px solid var(--glass-line)' }}
                >
                  Next Hand
                </Button>
                <Button
                  id="hcCashOut"
                  onClick={cashOut}
                  className="w-full text-text"
                  style={{ background: 'var(--glass)', border: '1px solid var(--glass-line)' }}
                >
                  Cash Out ({money(snap.stacks[0] ?? 0)})
                </Button>
              </div>
            )}

            <AgentMount />
          </div>

          <div className="mt-5">
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Table log</h4>
            <div className="text-xs text-faint max-h-40 overflow-y-auto space-y-0.5">
              {[...snap.log].reverse().map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
        </Panel>
      </GameLayout>
    </div>
  )
}

/* Card suits are one of the two places emoji-adjacent glyphs are allowed
   (DEVELOPMENT_GUIDE.md §2): ♠♥♦♣ are text, they take colour and weight. */
function PlayingCard({ card }: { card: Card }) {
  const red = isRed(card.s)
  return (
    <div
      className="hc-card w-14 h-20 rounded-[8px] border flex flex-col items-center justify-center"
      style={{
        borderColor: 'var(--glass-line)',
        background: 'var(--color-panel-2)',
        color: red ? 'var(--color-red)' : 'var(--color-text)',
        boxShadow: 'var(--lift-1)',
      }}
    >
      <b className="rank-top num text-lg leading-none">{rankStr(card.r)}</b>
      <span className="text-base leading-none mt-0.5">{SUITS[card.s]}</span>
    </div>
  )
}
