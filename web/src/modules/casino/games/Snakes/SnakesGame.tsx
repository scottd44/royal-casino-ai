import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/platform/icons'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { AnimatedNumber, Reveal } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import { Felt } from '../../components/Felt'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money, randInt } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { snakesSounds } from './sounds'

/* ============================================================
   Snakes — ported from js/games/snakes.js.

   AGENT CONTRACT (agent-ui.js:1338, grepped verbatim before writing this):
     detect()  window.SnakesAPI && #snBoard
     play()    API.setDifficulty(s) + API.setInstant(true), then loops
               API.roll() -> await waitFor(() => !API.busy(), 4000) while
               API.inRound() && API.rolls() < target, then API.cashOut() if
               still in round. Reads #snMsg afterward for the status line.

   The agent is ENTIRELY API-driven — it never clicks a tile, the roll
   button, the difficulty buttons, or the cash-out button. That means
   #snBoard's internal layout carries no click-target contract beyond
   existing as a container, so this board is free to follow the LOOP shape
   instead of TileGrid's rectangular grid model (PHASE_3_GAMES_PLAN.md §1
   point 3 in the dispatch, confirmed against TileGrid.tsx's own doc comment
   which only promises order-is-the-contract for GAMES THAT CLICK TILES).

   window.SnakesAPI is registered on mount and REMOVED on unmount — same
   technique as HoldemGame's window.HoldemAPI / CoinflipGame's
   window.CoinflipAPI: a stale API would make snakes.detect() return true on
   another route and the agent would roll into a dead board.

   TRACK-A SAFETY (busy()) — the one PHASE_1_MOTION_ICONS_PLAN.md §0 rule
   this file most needs to get right: `waitFor(() => !API.busy(), 4000)`
   polls raw JS state, not a paint. `busyRef`/`phaseRef`/`rollsRef`/`multRef`
   are therefore refs flipped inside plain `setTimeout` callbacks (finish()
   below) — mirroring DiceGame's own `rollingRef`/`setRolling` pair — never
   inside a Framer `onAnimationComplete`. The token's step-by-step slide
   around the loop (`tokenPosRef`) is a SEPARATE, purely cosmetic ref: it is
   skipped outright when `instant` is on (agent-ui.js:1352 always sets
   instant(true) before rolling), but `finish()` — the truth update — always
   runs on its own timer regardless of whether the token animates. Motion
   never sits upstream of state; here it doesn't even sit downstream of it,
   the two refs are just independently driven by the same timer chain.
   ============================================================ */

const TILES = 12
const MAX_ROLLS = 5
const DIFF = [
  { key: 'easy', label: 'Easy', snakes: 1 },
  { key: 'medium', label: 'Medium', snakes: 3 },
  { key: 'hard', label: 'Hard', snakes: 5 },
  { key: 'expert', label: 'Expert', snakes: 7 },
  { key: 'master', label: 'Master', snakes: 9 },
] as const
type SnakeCount = (typeof DIFF)[number]['snakes']

// Cumulative cash-out multiplier after surviving k rolls (index 0 = after
// roll 1), per snake count — copied verbatim from snakes.js's own `_t.SCHED`
// export. Calibrated so every cash-out point returns a constant 0.97 RTP.
const SCHED: Record<SnakeCount, number[]> = {
  1: [1.058, 1.16, 1.271, 1.393, 1.526],
  3: [1.293, 1.759, 2.387, 3.236, 4.386],
  5: [1.663, 2.981, 5.309, 9.395, 16.637],
  7: [2.325, 6.096, 15.746, 40.186, 101.891],
  9: [3.886, 18.965, 89.77, 402.935, 1719.858],
}
const multAfter = (snakes: SnakeCount, k: number): number =>
  k <= 0 ? 1 : SCHED[snakes][Math.min(k, MAX_ROLLS) - 1]

// 12 border cells of a 4x4 CSS grid, clockwise from top-left — the exact
// layout snakes.js's own RING constant lays out. The center 2x2 well holds
// the dice/total readout, same visual convention as the legacy board.
const RING: Array<[number, number]> = [
  [1, 1], [1, 2], [1, 3], [1, 4],
  [2, 4], [3, 4], [4, 4],
  [4, 3], [4, 2], [4, 1],
  [3, 1], [2, 1],
]

// Dice pips are one of the two glyph exceptions DEVELOPMENT_GUIDE.md §2
// carves out (card suits are the other) — real Unicode text, not an emoji
// standing in for an icon.
const DICE_FACE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

type Phase = 'idle' | 'playing' | 'over'
type Tone = 'idle' | 'win' | 'lose'
type Landed = { kind: 'safe'; step: number } | { kind: 'snake' }

export default function SnakesGame() {
  const betRef = useBetRef()
  // The ring's own fixed maxWidth/padding/font sizes (the center dice
  // readout especially) were sized for desktop — on a narrow phone panel
  // they push the board wider than the viewport. Shrinking those values on
  // mobile keeps the same single ring layout, just smaller; no tile/token
  // markup or ids change.
  const isMobile = useIsMobile()

  // Round truth lives in refs — window.SnakesAPI's functions (esp. busy())
  // must read the CURRENT state synchronously when the agent polls them,
  // never a stale render closure (same reasoning as CoinflipGame's
  // phaseRef/streakRef/multRef).
  const phaseRef = useRef<Phase>('idle')
  const busyRef = useRef(false)
  const boardRef = useRef<boolean[]>(new Array(TILES).fill(false)) // true = snake
  const posRef = useRef(0) // logical position — only moves inside finish()
  const tokenPosRef = useRef(0) // cosmetic position — steps during the token's slide
  const rollsRef = useRef(0)
  const multRef = useRef(1)
  const snakesRef = useRef<SnakeCount>(3)
  const instantRef = useRef(false)
  const stakeRef = useRef(0)
  const landedRef = useRef<Record<number, Landed>>({})
  const revealAllRef = useRef(false) // true once bust/cash-out reveals the rest of the snakes
  const diceRef = useRef<[number, number]>([1, 1])
  const totalRef = useRef<number | null>(null)
  const msgRef = useRef('Pick a difficulty and roll.')
  const toneRef = useRef<Tone>('idle')

  // Invalidates any in-flight setTimeout chain from a superseded round —
  // same technique as HoldemGame's genRef guarding its bot timer.
  const genRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const cashOut = useCallback(
    (auto: boolean) => {
      if (phaseRef.current !== 'playing' || rollsRef.current === 0) return
      const ret = Math.round(stakeRef.current * multRef.current)
      payout(ret)
      phaseRef.current = 'over'
      revealAllRef.current = true
      const net = ret - stakeRef.current
      msgRef.current = `Cashed out ${multRef.current.toFixed(2)}× = ${money(ret)} (${net >= 0 ? '+' : ''}${fmt(net)}).`
      toneRef.current = net >= 0 ? 'win' : 'lose'
      if (!auto) {
        if (net >= stakeRef.current * 3) snakesSounds.bigwin()
        else snakesSounds.cashout()
      }
      repaint()
    },
    [payout, repaint],
  )

  const setDifficulty = useCallback(
    (s: number) => {
      // snakes.js:233 — the button click is a no-op while a round is live.
      if (phaseRef.current === 'playing') return
      if (!DIFF.some((d) => d.snakes === s)) return
      snakesRef.current = s as SnakeCount
      repaint()
    },
    [repaint],
  )

  const setInstant = useCallback(
    (v: boolean) => {
      instantRef.current = !!v
      repaint()
    },
    [repaint],
  )

  const start = useCallback((): boolean => {
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      msgRef.current = 'Not enough cash for that bet.'
      toneRef.current = 'lose'
      repaint()
      return false
    }
    const board = new Array(TILES).fill(false)
    const idx = Array.from({ length: TILES }, (_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    idx.slice(0, snakesRef.current).forEach((i) => (board[i] = true))

    boardRef.current = board
    posRef.current = 0
    tokenPosRef.current = 0
    rollsRef.current = 0
    multRef.current = 1
    landedRef.current = {}
    revealAllRef.current = false
    stakeRef.current = bet
    phaseRef.current = 'playing'
    totalRef.current = null
    msgRef.current = 'Rolling…'
    toneRef.current = 'idle'
    genRef.current++ // orphan any stray timer from a prior round
    repaint()
    return true
  }, [betRef, placeBet, repaint])

  const doRoll = useCallback(() => {
    if (busyRef.current) return
    if (phaseRef.current !== 'playing') {
      if (!start()) return
    }
    if (rollsRef.current >= MAX_ROLLS) return

    busyRef.current = true
    repaint()

    let d1 = randInt(1, 6)
    let d2 = randInt(1, 6)
    let sum = d1 + d2
    let land = (posRef.current + sum) % TILES

    // The 😈 rig: nudge the roll onto a safe tile if one is reachable.
    if (cheatWin() && boardRef.current[land]) {
      for (let s = 2; s <= 12; s++) {
        const t = (posRef.current + s) % TILES
        if (!boardRef.current[t]) {
          sum = s
          land = t
          d1 = Math.min(6, sum - 1)
          d2 = sum - d1
          break
        }
      }
    }

    diceRef.current = [d1, d2]
    totalRef.current = sum
    snakesSounds.tick()
    repaint()

    const myGen = genRef.current
    const startPos = posRef.current

    const finish = () => {
      // A stale timer from a round the player has since reset out of —
      // never resolve into dead state (Holdem's own drive()/genRef guard).
      if (genRef.current !== myGen) return

      posRef.current = land
      tokenPosRef.current = land
      rollsRef.current += 1

      if (boardRef.current[land]) {
        landedRef.current = { ...landedRef.current, [land]: { kind: 'snake' } }
        revealAllRef.current = true
        phaseRef.current = 'over'
        msgRef.current = `Snake on tile ${land + 1}! Busted — lost ${money(stakeRef.current)}.`
        toneRef.current = 'lose'
        snakesSounds.lose()
        busyRef.current = false
        repaint()
        return
      }

      const prevMult = rollsRef.current <= 1 ? 1 : multAfter(snakesRef.current, rollsRef.current - 1)
      const m = multAfter(snakesRef.current, rollsRef.current)
      multRef.current = m
      landedRef.current = { ...landedRef.current, [land]: { kind: 'safe', step: m / prevMult } }
      snakesSounds.win()

      if (rollsRef.current >= MAX_ROLLS) {
        msgRef.current = `Survived all ${MAX_ROLLS} rolls at ${m.toFixed(2)}× — auto cash-out!`
        toneRef.current = 'win'
        busyRef.current = false
        repaint()
        cashOut(true)
      } else {
        msgRef.current = `Safe! ${m.toFixed(2)}× — roll again or cash out.`
        toneRef.current = 'win'
        busyRef.current = false
        repaint()
      }
    }

    if (instantRef.current) {
      // setInstant(true) is what agent-ui.js:1352 always does before rolling
      // — Track A (finish(), the truth) fires synchronously; Track B (the
      // token's slide) is simply skipped rather than sped up.
      finish()
    } else {
      let step = 0
      const stepFn = () => {
        if (genRef.current !== myGen) return
        step++
        tokenPosRef.current = (startPos + step) % TILES
        repaint()
        timerRef.current = setTimeout(step < sum ? stepFn : finish, step < sum ? 110 : 160)
      }
      timerRef.current = setTimeout(stepFn, 120)
    }
  }, [cashOut, repaint, start])

  /* ---------------- window.SnakesAPI ----------------
     The adapter's entire view of this game. Registered on mount, DELETED on
     unmount so detect() can never return true for an unmounted board. */
  useEffect(() => {
    const api = {
      inRound: () => phaseRef.current === 'playing',
      busy: () => busyRef.current,
      rolls: () => rollsRef.current,
      mult: () => multRef.current,
      setDifficulty: (s: number) => setDifficulty(s),
      setInstant: (v: boolean) => setInstant(v),
      roll: () => doRoll(),
      cashOut: () => cashOut(false),
    }

    ;(window as unknown as { SnakesAPI: typeof api }).SnakesAPI = api

    return () => {
      delete (window as unknown as { SnakesAPI?: typeof api }).SnakesAPI
      if (timerRef.current) clearTimeout(timerRef.current)
      genRef.current++ // invalidate any in-flight step/finish timer
    }
  }, [cashOut, doRoll, setDifficulty, setInstant])

  /* ---------------- render ---------------- */
  const phase = phaseRef.current
  const busy = busyRef.current
  const rolls = rollsRef.current
  const mult = multRef.current
  const snakes = snakesRef.current
  const instant = instantRef.current
  const stake = stakeRef.current
  const [d1, d2] = diceRef.current
  const total = totalRef.current
  const msg = msgRef.current
  const tone = toneRef.current
  const tokenPos = tokenPosRef.current

  const toneColor =
    tone === 'win' ? 'var(--color-green)' : tone === 'lose' ? 'var(--color-red)' : 'var(--color-muted)'

  function tileVisual(i: number): { kind: 'hidden' | 'safe' | 'snake'; step?: number; faint: boolean } {
    const landed = landedRef.current[i]
    if (landed) return landed.kind === 'safe' ? { kind: 'safe', step: landed.step, faint: false } : { kind: 'snake', faint: false }
    if (revealAllRef.current && boardRef.current[i]) return { kind: 'snake', faint: true }
    return { kind: 'hidden', faint: false }
  }

  return (
    <div>
      <PageHead
        title="Snakes"
        sub="Roll 2d6 and race clockwise around the loop. Safe tiles compound your multiplier; snakes bust you. Cash out or push your luck up to 5 rolls."
        icon="rc:snake"
      />

      <GameLayout>
        <Panel>
          {/* The ring sits on a full-bleed Felt backdrop so the board reads
              as a real table, not a small grid floating in dead panel
              space — same "board deserves a surface" treatment the card
              games get from Felt.tsx. Felt itself carries no agent
              contract; #snBoard below still owns detect()'s other half. */}
          <Felt className={isMobile ? 'flex justify-center p-3' : 'flex justify-center p-6 sm:p-9'}>
            {/* #snBoard is half of detect(). Layout is a ring, not a grid —
                see the file-level note on why TileGrid doesn't apply here. */}
            <div
              id="snBoard"
              data-idx-container=""
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(4, 1fr)',
                gridTemplateRows: 'repeat(4, 1fr)',
                aspectRatio: '1 / 1',
                width: '100%',
                maxWidth: isMobile ? 320 : 620,
                gap: isMobile ? 6 : 12,
                background:
                  'radial-gradient(120% 100% at 50% 0%, rgba(34,229,154,0.1), transparent 62%), linear-gradient(180deg, rgba(10,15,24,0.9), rgba(6,9,15,0.95))',
                borderRadius: 24,
                padding: isMobile ? 8 : 14,
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: 'inset 0 0 60px rgba(0,0,0,0.7), var(--lift-2)',
              }}
            >
              {RING.map(([gr, gc], i) => {
                const v = tileVisual(i)
                const isToken = i === tokenPos && phase !== 'idle'
                return (
                  <div
                    key={i}
                    data-idx={i}
                    className={[
                      'relative rounded-2xl border-2 flex items-center justify-center transition-all',
                      v.kind === 'safe' && !v.faint
                        ? 'shadow-[0_0_22px_4px_var(--glow-green)] scale-[1.03]'
                        : v.kind === 'snake' && !v.faint
                          ? 'shadow-[0_0_22px_4px_var(--glow-red)] scale-[1.03]'
                          : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      gridRow: gr,
                      gridColumn: gc,
                      borderColor:
                        v.kind === 'safe'
                          ? 'var(--color-green)'
                          : v.kind === 'snake'
                            ? 'var(--color-red)'
                            : 'rgba(255,255,255,0.08)',
                      background:
                        v.kind === 'safe'
                          ? 'color-mix(in srgb, var(--color-green) 30%, rgba(10,15,24,0.9))'
                          : v.kind === 'snake'
                            ? 'color-mix(in srgb, var(--color-red) 30%, rgba(10,15,24,0.9))'
                            : 'linear-gradient(165deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))',
                      opacity: v.faint ? 0.4 : 1,
                    }}
                  >
                    <span
                      className={
                        isMobile
                          ? 'absolute top-1 left-1 text-[9px] font-semibold text-faint tabular-nums'
                          : 'absolute top-1.5 left-2 text-[11px] font-semibold text-faint tabular-nums'
                      }
                    >
                      {i + 1}
                    </span>
                    {/* The tile itself never unmounts across a round — only
                        the revealed content mounts fresh (Reveal.tsx's own
                        warning against wrapping a persistent container),
                        same rule Mines' `.tile` follows. */}
                    {v.kind === 'safe' && (
                      <Reveal as="span" preset="scaleIn" duration={0.18}>
                        <span
                          className={isMobile ? 'num text-[11px] font-extrabold' : 'num text-base font-extrabold'}
                          style={{ color: 'var(--color-green)' }}
                        >
                          ×{(v.step ?? 1).toFixed(2)}
                        </span>
                      </Reveal>
                    )}
                    {v.kind === 'snake' && (
                      <Reveal as="span" preset="scaleIn" duration={0.18}>
                        <Icon name="rc:snake" size={isMobile ? 18 : 26} style={{ color: 'var(--color-red)' }} />
                      </Reveal>
                    )}
                    {/* The player's token — a real piece riding the loop,
                        not a corner dot. Rendered as separately-mounted
                        content (Reveal) so it pops onto whichever tile it
                        lands on instead of quietly repositioning. */}
                    {isToken && (
                      <Reveal
                        as="span"
                        preset="scaleIn"
                        duration={0.16}
                        className={
                          isMobile
                            ? 'absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2'
                            : 'absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border-2'
                        }
                        style={{
                          borderColor: 'var(--color-panel)',
                          background: 'radial-gradient(circle at 35% 30%, var(--color-gold-2), var(--color-gold))',
                          boxShadow: '0 0 12px var(--color-gold), 0 0 24px var(--glow-gold)',
                        }}
                      />
                    )}
                  </div>
                )
              })}
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-2xl"
                style={{
                  gridRow: '2 / 4',
                  gridColumn: '2 / 4',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
                }}
              >
                <div
                  className={isMobile ? 'flex gap-1 text-2xl leading-none' : 'flex gap-3 text-5xl leading-none'}
                  style={{ color: 'var(--color-gold-2)' }}
                >
                  <span>{DICE_FACE[d1 - 1]}</span>
                  <span>{DICE_FACE[d2 - 1]}</span>
                </div>
                <div className={isMobile ? 'text-[11px] font-semibold text-muted' : 'text-sm font-semibold text-muted'}>
                  {total != null ? `Total ${total}` : 'Total —'}
                </div>
              </div>
            </div>
          </Felt>

          <div className="win-banner mt-4 text-center text-sm" id="snMsg" style={{ color: toneColor }}>
            {msg}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="field mb-1">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
              Difficulty (snakes)
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {DIFF.map((d) => (
                <Button
                  key={d.key}
                  variant="ghost"
                  size="sm"
                  disabled={phase === 'playing'}
                  onClick={() => setDifficulty(d.snakes)}
                  className="px-1 text-[12px]"
                  style={
                    snakes === d.snakes
                      ? { borderColor: 'var(--color-gold)', color: 'var(--color-gold-2)', background: 'rgba(240,194,79,0.08)' }
                      : undefined
                  }
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {/* None of these four ids are in NUMERIC_CONTRACT_IDS
              (contractIds.ts) — the adapter never reads them, it only calls
              API.mult()/API.rolls() directly. Free to tween. */}
          <div className="stat-grid grid grid-cols-2 gap-2 mt-3.5">
            <Stat k="Multiplier" v={<AnimatedNumber value={mult} format={(n) => `${n.toFixed(2)}×`} id="snMult" />} />
            <Stat k="Roll" v={<span id="snRoll">{`${rolls} / ${MAX_ROLLS}`}</span>} />
            <Stat
              k="Next roll"
              v={
                phase === 'playing' && rolls < MAX_ROLLS ? (
                  <AnimatedNumber value={multAfter(snakes, rolls + 1)} format={(n) => `${n.toFixed(2)}×`} id="snNext" />
                ) : (
                  <span id="snNext">—</span>
                )
              }
            />
            <Stat
              k="Cash out"
              v={
                phase === 'playing' && rolls > 0 ? (
                  <AnimatedNumber value={Math.round(stake * mult)} id="snCash" />
                ) : (
                  <span id="snCash">—</span>
                )
              }
            />
          </div>

          <Button
            id="snRollBtn"
            variant="green"
            size="lg"
            block
            disabled={busy || phase === 'over'}
            onClick={doRoll}
            className="mt-4"
          >
            <Icon name="dices" size={16} className="inline mr-1.5 -mt-0.5" />
            {phase === 'playing' && rolls > 0 ? 'Roll Again' : 'Roll Dice'}
          </Button>
          {phase === 'playing' && (
            <Button
              id="snCashBtn"
              variant="gold"
              size="lg"
              block
              disabled={busy || rolls === 0}
              onClick={() => cashOut(false)}
              className="mt-2.5"
            >
              Cash Out
            </Button>
          )}

          <label className="flex items-center gap-2 text-xs text-muted mt-3">
            <input
              id="snInstant"
              type="checkbox"
              checked={instant}
              onChange={(e) => setInstant(e.target.checked)}
            />
            Instant roll <span className="text-faint">— skip the token animation</span>
          </label>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
