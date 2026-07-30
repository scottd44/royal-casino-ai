import { useCallback, useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Button, Stat, cn } from '@/platform/ui'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { Reveal } from '@/platform/motion'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { money } from '@/platform/money/format'
import { Card } from '../../components/Card'
import type { CardSuit } from '../../components/Card'
import { Felt } from '../../components/Felt'
import {
  makeTable, equity, blindsFor, fmtCard, rankStr, handName, SUITS,
  type Table, type Action, type Card as EngineCard,
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
  community: EngineCard[]
  hole: EngineCard[]
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

  // Chosen raise-to amount for the slider control below. Reset (adjusted
  // during render, React's documented pattern for derived state) whenever a
  // fresh raise opportunity appears — new min/max, e.g. a new betting round
  // — so a stale value from a prior street never carries over.
  const [raiseTo, setRaiseTo] = useState(0)
  const raiseKey = canRaise ? `${canRaise.min}:${canRaise.max}` : ''
  const [seenRaiseKey, setSeenRaiseKey] = useState('')
  if (canRaise && raiseKey !== seenRaiseKey) {
    setSeenRaiseKey(raiseKey)
    setRaiseTo(canRaise.min!)
  }
  const raiseAmount = canRaise ? Math.max(canRaise.min!, Math.min(canRaise.max!, raiseTo)) : 0

  const streetLabel =
    snap.community.length === 0
      ? 'Pre-flop'
      : snap.community.length === 3
        ? 'Flop'
        : snap.community.length === 4
          ? 'Turn'
          : 'River'

  const equityPct =
    tbl && snap.awaitingHuman ? Math.round(equity(snap.hole, snap.community, Math.max(1, tbl.contenders().length - 1), 120) * 100) : null

  const isMobile = useIsMobile()

  return (
    <div>
      <PageHead title="Texas Hold'em" sub="No-limit poker against three bots." icon="diamond" />

      <GameLayout>
        <Panel>
          <Felt className="relative">
            {/* The felt oval — four seats arranged around a center well that
                holds the pot and community cards. Seats are a persistent
                mount (per-seat identity never changes across a session,
                same as the original stack/name row), so they're plain
                styled divs, never wrapped in Reveal. */}
            <div className={cn('relative mx-auto max-w-[520px]', isMobile ? 'h-[260px]' : 'h-[330px] sm:h-[360px]')}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none px-2">
                <div className="num text-gold text-xl" id="hcPot">
                  {money(snap.pot)}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-faint">
                  {snap.seated ? streetLabel : 'Sit down to play'}
                </div>
                <div className={cn('flex gap-2 justify-center items-center', isMobile ? 'min-h-[56px]' : 'min-h-[80px]')}>
                  {/* Each street's cards mount fresh — preflop -> flop adds 3,
                      then turn/river add one apiece — and the whole array
                      unmounts back to [] on the next hand. Genuine
                      mount/unmount per card. */}
                  {snap.community.map((c, i) => (
                    <Reveal key={i} as="div" preset="scaleIn" duration={0.28}>
                      <Card rank={rankStr(c.r)} suit={SUITS[c.s] as CardSuit} size="lg" />
                    </Reveal>
                  ))}
                </div>
              </div>

              {NAMES.map((n, i) => {
                const pos = SEAT_POS[i]
                const p = tbl?.T.players[i]
                const isTurn = !!tbl && !tbl.T.handOver && tbl.T.actionOn === i
                const isButton = tbl?.button === i
                const isFolded = snap.folded[i]
                const betAmt = p?.betRound ?? 0
                return (
                  <div
                    key={n}
                    className="absolute"
                    style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -50%)' }}
                  >
                    <div
                      className="relative rounded-2xl border px-3 py-2 text-center transition-opacity duration-300"
                      style={{
                        minWidth: isMobile ? 68 : 92,
                        borderColor: isTurn ? 'var(--color-gold)' : 'var(--glass-line)',
                        background: 'var(--glass)',
                        opacity: isFolded ? 0.4 : 1,
                        boxShadow: isTurn
                          ? '0 0 0 3px color-mix(in srgb, var(--color-gold) 35%, transparent), var(--lift-1)'
                          : 'var(--lift-1)',
                      }}
                    >
                      {isButton && (
                        <span
                          className="num absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                          style={{ background: 'var(--color-gold)', color: '#1a1305' }}
                        >
                          D
                        </span>
                      )}
                      <div className="text-xs text-muted truncate">{n}</div>
                      <div className="num text-sm text-text">{money(snap.stacks[i] ?? 0)}</div>
                      <div
                        className="text-[11px] h-4"
                        style={{ color: isFolded ? 'var(--color-faint)' : 'var(--color-gold-2)' }}
                      >
                        {snap.lastActions[i] ?? ''}
                      </div>
                      {betAmt > 0 && !isFolded && (
                        <Reveal
                          key={`${i}-${betAmt}-${snap.lastActions[i]}`}
                          as="div"
                          preset="scaleIn"
                          duration={0.2}
                        >
                          <div
                            className="num mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: 'color-mix(in srgb, var(--color-gold) 22%, transparent)',
                              color: 'var(--color-gold-2)',
                            }}
                          >
                            {money(betAmt)}
                          </div>
                        </Reveal>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 flex flex-col items-center gap-1.5">
              <div className="text-[11px] uppercase tracking-wide text-muted">Your hand</div>
              <div className={cn('flex gap-2 justify-center items-center', isMobile ? 'min-h-[64px]' : 'min-h-[92px]')}>
                {/* Dealt fresh at the top of each hand, unmounted (snap.hole ->
                    []) the moment the table resets — same genuine
                    mount/unmount case as the community cards above. */}
                {snap.hole.map((c, i) => (
                  <Reveal key={i} as="div" preset="scaleIn" duration={0.28}>
                    <Card rank={rankStr(c.r)} suit={SUITS[c.s] as CardSuit} size="lg" />
                  </Reveal>
                ))}
              </div>
            </div>

            {/* Showdown reveal — every contender who saw the river shows
                their hand, matching a real table's "cards up" moment. Purely
                decorative (state() feeds the agent hole/board directly, not
                this DOM), so it's safe to add without touching the API. */}
            {tbl && tbl.T.handOver && tbl.T.result?.showdown && (
              <div className="mt-4 flex flex-wrap justify-center gap-4 border-t pt-4" style={{ borderColor: 'var(--glass-line)' }}>
                {tbl.T.players.map((p, i) => {
                  if (p.folded || !p.alive || p.hole.length < 2) return null
                  const score = tbl.T.result!.scores[i]
                  return (
                    <Reveal key={i} as="div" preset="fadeUp" duration={0.3}>
                      <div className="text-center">
                        <div className="text-xs text-muted mb-1">
                          {NAMES[i]}
                          {score ? ` — ${handName(score)}` : ''}
                        </div>
                        <div className="flex gap-1 justify-center">
                          {p.hole.map((c, ci) => (
                            <Card key={ci} rank={rankStr(c.r)} suit={SUITS[c.s] as CardSuit} size="lg" />
                          ))}
                        </div>
                      </div>
                    </Reveal>
                  )
                })}
              </div>
            )}
          </Felt>
        </Panel>

        {/* The controls panel. #hcControls is half of holdem's detect(). */}
        <Panel>
          <div id="hcControls">
            {!snap.seated ? (
              <Button
                id="hcSit"
                variant="gold"
                size="lg"
                block
                onClick={sit}
                disabled={balance < MIN_BUYIN}
              >
                {balance < MIN_BUYIN ? `Need ${money(MIN_BUYIN)} to sit` : 'Sit Down'}
              </Button>
            ) : (
              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-2 mb-1">
                  <Stat k="To call" v={money(snap.toCall)} />
                  <Stat
                    k="Your equity"
                    v={equityPct === null ? '—' : `${equityPct}%`}
                    tone="gold"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    id="hcFold"
                    variant="ghost"
                    disabled={!snap.awaitingHuman}
                    onClick={() => humanAct({ type: 'fold' })}
                  >
                    Fold
                  </Button>
                  <Button
                    id="hcCall"
                    variant="ghost"
                    disabled={!snap.awaitingHuman}
                    onClick={() =>
                      humanAct({ type: snap.toCall > 0 ? 'call' : 'check' })
                    }
                  >
                    {snap.toCall > 0 ? 'Call' : 'Check'}
                  </Button>
                  <Button
                    id="hcRaise"
                    variant="green"
                    disabled={!snap.awaitingHuman || !canRaise}
                    onClick={() => humanAct({ type: 'raise', amount: raiseAmount })}
                  >
                    Raise to {money(raiseAmount)}
                  </Button>
                </div>

                {canRaise && (
                  <div className="grid gap-1.5 rounded-lg border p-2" style={{ borderColor: 'var(--glass-line)' }}>
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>Raise amount</span>
                      <span className="num text-gold">{money(raiseAmount)}</span>
                    </div>
                    <input
                      type="range"
                      id="hcRaiseSlider"
                      min={canRaise.min}
                      max={canRaise.max}
                      step={1}
                      value={raiseAmount}
                      disabled={!snap.awaitingHuman}
                      onChange={(e) => setRaiseTo(Number(e.target.value))}
                      className="hc-raise-slider w-full block accent-[var(--color-gold)]"
                    />
                    <div className="flex items-center justify-between text-[10px] text-faint">
                      <span>{money(canRaise.min!)}</span>
                      <span>{money(canRaise.max!)}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!snap.awaitingHuman}
                        onClick={() => setRaiseTo(canRaise.min!)}
                      >
                        Min
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!snap.awaitingHuman}
                        onClick={() =>
                          setRaiseTo(
                            Math.max(canRaise.min!, Math.min(canRaise.max!, Math.round(snap.pot / 2))),
                          )
                        }
                      >
                        1/2 Pot
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!snap.awaitingHuman}
                        onClick={() =>
                          setRaiseTo(Math.max(canRaise.min!, Math.min(canRaise.max!, snap.pot)))
                        }
                      >
                        Pot
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!snap.awaitingHuman}
                        onClick={() => setRaiseTo(canRaise.max!)}
                      >
                        All-in
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  id="hcNext"
                  variant="ghost"
                  disabled={!snap.handOver}
                  onClick={nextHand}
                  className="w-full mt-1"
                >
                  Next Hand
                </Button>
                <Button
                  id="hcCashOut"
                  variant="ghost"
                  onClick={cashOut}
                  className="w-full"
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

/* Four-max seat layout around the felt oval — index-matched to NAMES.
   Top-center is the seat directly across from you, left/right flank it. */
const SEAT_POS: { top: string; left: string }[] = [
  { top: '88%', left: '50%' }, // You
  { top: '50%', left: '6%' }, // Ace
  { top: '8%', left: '50%' }, // Boss
  { top: '50%', left: '94%' }, // Trixie
]
