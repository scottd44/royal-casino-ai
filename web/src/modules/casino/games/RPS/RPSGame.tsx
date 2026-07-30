import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Icon } from '@/platform/icons'
import type { IconName } from '@/platform/icons'
import { AnimatedNumber, Reveal, shouldAnimate, DUR, EASE_BRAND } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { money, fmt } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { rpsSounds } from './sounds'

/* ============================================================
   Rock Paper Scissors — ported from js/games/rps.js.

   Streak-compounding, same shape as Coinflip: beat the house to compound
   the stake ~1.96x per win, ties replay free (streak untouched), a loss
   forfeits the streak and ends the round. Cash out any time after the
   first win.

   AGENT CONTRACT (agent-ui.js:1315):
     detect()  window.RPSAPI && #rpsTrack
     play()    API.throw(moveMap[pick]) once, then loops
               `API.throw(randomMove)` while `inRound() && streak() < target`,
               then `cashOut()` if a streak was banked. Status read from
               #rpsMsg's textContent afterward.

   moveMap verified against agent-ui.js:1328 — { rock: 0, paper: 1, scissors: 2 }.
   throwMove()'s `p` parameter below uses that exact 0/1/2 encoding, matching
   MOVES/MOVE_ICON index order.

   window.RPSAPI is registered from an effect and REMOVED on unmount, same
   discipline as window.HoldemAPI (HoldemGame.tsx) — a stale API would make
   rps.detect() return true on another route and strand the agent throwing
   into a dead round (HANDOFF §2b).

   All canonical round state lives in REFS, not useState. throwMove/cashOut
   are called imperatively by window.RPSAPI outside any React event, so a
   closure captured once (in the mount effect) must never read a stale
   `useState` snapshot on the second, third, ... call — refs sidestep that
   entirely, exactly like HoldemGame.tsx's tblRef/seatedRef/etc. `tick`
   exists purely to ask React to repaint after a ref mutation.

   PRESENTATION LAYER (this rebuild): the round-resolution rule above is
   untouched — `throwMove` still computes and commits the outcome
   synchronously (Track A truth), exactly like Coinflip's `call()`. Every
   bit of new motion here is Track B, layered on top of already-decided
   state, the same way CoinflipGame.tsx's `<CoinFace spin>` plays a single
   rotateY sweep on an already-flipped coin: `ThrowGlyph` below plays a
   throw-and-land tween on an already-resolved move, gated by
   `shouldAnimate()` and keyed so it fires once per throw, never gating
   `window.RPSAPI` or #rpsMsg on a timer. The "opponent board" reuses the
   existing streak-track DATA (#rpsTrack, `.rps-track-item`, same TRACK_LIMIT
   history) — it's a new READING of that data (a row of opponents already
   beaten/tied, trailing off from the live one), not a new game rule.
   ============================================================ */

const EDGE = 0.02 // per decisive round -> RTP 0.98
const WIN = 2 * (1 - EDGE) // 1.96x
const MOVES = ['Rock', 'Paper', 'Scissors'] as const
const MOVE_ICON: IconName[] = ['rc:rock', 'rc:paper', 'rc:scissors']
const TRACK_LIMIT = 12
const GHOST_SLOTS = 3

type Move = 0 | 1 | 2
type Phase = 'idle' | 'playing' | 'over'
type Tone = 'default' | 'gold' | 'green' | 'red'

/** p===h -> tie(0); the move that beats h is (h+1)%3, so p beating h means
 *  (p-h+3)%3===1 -> win(1); anything else is a loss(-1). Ported verbatim
 *  from js/games/rps.js's `outcome`. */
function outcome(p: Move, h: Move): 1 | 0 | -1 {
  if (p === h) return 0
  return ((p - h + 3) % 3 === 1 ? 1 : -1) as 1 | -1
}

type TrackItem = { id: number; res: 1 | 0 | -1; p: Move; h: Move }

const TONE_COLOR: Record<Tone, string | undefined> = {
  default: undefined,
  gold: 'var(--color-gold)',
  green: 'var(--color-green)',
  red: 'var(--color-red)',
}

export default function RPSGame() {
  const isMobile = useIsMobile()
  const betRef = useBetRef()

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  // Canonical round state — refs, per the file-level note above.
  const phaseRef = useRef<Phase>('idle')
  const stakeRef = useRef(0)
  const multRef = useRef(1)
  const streakRef = useRef(0)
  const youRef = useRef<Move | null>(null)
  const houseRef = useRef<Move | null>(null)
  const trackRef = useRef<TrackItem[]>([])
  const trackIdRef = useRef(0)
  const throwIdRef = useRef(0)
  const msgRef = useRef<{ text: string; tone: Tone }>({
    text: 'Set a bet and throw.',
    tone: 'default',
  })

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const setMsg = useCallback(
    (text: string, tone: Tone) => {
      msgRef.current = { text, tone }
    },
    [],
  )

  const ensureStarted = useCallback(() => {
    if (phaseRef.current === 'playing') return true
    const stake = readBet(betRef)
    if (!placeBet(stake)) {
      setMsg('Not enough cash for that bet.', 'red')
      repaint()
      return false
    }
    stakeRef.current = stake
    multRef.current = 1
    streakRef.current = 0
    trackRef.current = []
    phaseRef.current = 'playing'
    if (betRef.current) betRef.current.disabled = true
    return true
  }, [betRef, placeBet, repaint, setMsg])

  const endRound = useCallback(() => {
    phaseRef.current = 'over'
    if (betRef.current) betRef.current.disabled = false
  }, [betRef])

  const pushTrack = useCallback((res: 1 | 0 | -1, p: Move, h: Move) => {
    trackRef.current = [{ id: ++trackIdRef.current, res, p, h }, ...trackRef.current].slice(
      0,
      TRACK_LIMIT,
    )
  }, [])

  /** Also starts a fresh round after one has ended — mirrors legacy throwMove(). */
  const throwMove = useCallback(
    (p: Move) => {
      if (!ensureStarted()) return
      // The house throws at random; the 😈 rig, when armed, makes it throw
      // the move the player's pick beats.
      let h: Move = (Math.floor(Math.random() * 3) as Move)
      if (cheatWin()) h = ((p + 2) % 3) as Move
      youRef.current = p
      houseRef.current = h
      throwIdRef.current++
      const res = outcome(p, h)
      pushTrack(res, p, h)

      if (res === 0) {
        setMsg(`Tie on ${MOVES[p]} — throw again (streak safe).`, 'gold')
        rpsSounds.tick()
      } else if (res > 0) {
        streakRef.current++
        multRef.current *= WIN
        setMsg(
          `You win! ${MOVES[p]} beats ${MOVES[h]} · streak ${streakRef.current} · ${multRef.current.toFixed(2)}×.`,
          'green',
        )
        if (multRef.current >= 8) rpsSounds.bigwin()
        else rpsSounds.win()
      } else {
        setMsg(`House wins with ${MOVES[h]}. Streak over — lost ${money(stakeRef.current)}. Throw again to play.`, 'red')
        rpsSounds.lose()
        endRound()
      }
      repaint()
    },
    [ensureStarted, endRound, pushTrack, repaint, setMsg],
  )

  const cashOut = useCallback(() => {
    if (phaseRef.current !== 'playing' || streakRef.current === 0) return
    const ret = Math.round(stakeRef.current * multRef.current)
    payout(ret)
    setMsg(
      `Cashed out ${multRef.current.toFixed(2)}× = ${money(ret)} (+${fmt(ret - stakeRef.current)}). Throw again to play.`,
      'green',
    )
    rpsSounds.cashout()
    endRound()
    repaint()
  }, [endRound, payout, repaint, setMsg])

  /* ---------------- window.RPSAPI ----------------
     The adapter's entire view of this game. Registered on mount, DELETED on
     unmount so detect() can never return true for an unmounted round. */
  useEffect(() => {
    const api = {
      inRound: () => phaseRef.current === 'playing',
      streak: () => streakRef.current,
      mult: () => multRef.current,
      throw: (m: Move) => throwMove(m),
      cashOut: () => cashOut(),
    }

    ;(window as unknown as { RPSAPI: typeof api }).RPSAPI = api

    return () => {
      delete (window as unknown as { RPSAPI?: typeof api }).RPSAPI
    }
  }, [throwMove, cashOut])

  /* ---------------- render ---------------- */
  const phase = phaseRef.current
  const streak = streakRef.current
  const mult = multRef.current
  const track = trackRef.current
  const msg = msgRef.current
  const cashOutValue = phase === 'playing' && streak > 0 ? Math.round(stakeRef.current * mult) : null

  // The ring tint on both throw glyphs reflects the LAST DECISIVE RESULT
  // (track[0]) rather than `msg.tone` — msg.tone can carry an unrelated
  // "not enough cash" error after a round has already ended, and that must
  // never repaint an already-resolved win/loss circle a different colour.
  const lastRes = track[0]?.res
  const resultTone: Tone = lastRes === undefined ? 'default' : lastRes > 0 ? 'green' : lastRes < 0 ? 'red' : 'gold'

  return (
    <div>
      <PageHead
        title="Rock Paper Scissors"
        sub={`Beat the house to compound your stake ${WIN}× per win. Ties replay for free, a loss ends the streak. Cash out whenever you like.`}
        icon="rc:rock"
      />

      <GameLayout>
        <Panel className="rps-panel">
          {/* A single dark "table" surface — same visual family as Wheel's
              #wheelStage / the shared <Felt/> table backdrop (radial
              gradient over --color-panel-2, inset shadow, a border/glow
              tied to the last decisive result) — so the board reads as a
              designed game surface, not bare panel background, and fills
              the panel's height instead of leaving a small box pinned to
              the top with empty space below it. */}
          <div
            className="rps-stage relative flex flex-col rounded-[20px] border overflow-hidden"
            style={{
              minHeight: isMobile ? 320 : 440,
              padding: isMobile ? '18px 14px 16px' : '30px 24px 26px',
              background:
                'radial-gradient(120% 130% at 50% -10%, color-mix(in srgb, var(--color-gold) 7%, var(--color-panel-2)) 0%, var(--color-panel) 55%, var(--color-bg-1) 100%)',
              borderColor:
                resultTone === 'default'
                  ? 'var(--glass-line)'
                  : `color-mix(in srgb, ${TONE_COLOR[resultTone]} 40%, var(--glass-line))`,
              boxShadow: `inset 0 0 46px rgba(0,0,0,0.45), var(--lift-2)${
                resultTone === 'default'
                  ? ''
                  : `, 0 0 60px -18px color-mix(in srgb, ${TONE_COLOR[resultTone]} 45%, transparent)`
              }`,
            }}
          >
            <div className="rps-readout flex flex-col items-center shrink-0">
              <div className={`cf-mult num text-center font-semibold text-gold ${isMobile ? 'text-xl' : 'text-3xl'}`} id="rpsMultBig">
                <AnimatedNumber value={mult} format={(n) => `${n.toFixed(2)}×`} />
              </div>

              {/* #rpsMsg is the agent's status readout after a round — plain
                  text, never a tween target (contractIds.ts). */}
              <div
                className="bj-result text-center text-sm mt-2 max-w-md"
                id="rpsMsg"
                style={{ color: TONE_COLOR[msg.tone] }}
              >
                {msg.text}
              </div>
            </div>

            {/* The board: one continuous lane rather than a big avatar
                followed by a disconnected strip of small icons. Your live
                throw is the lane's first, largest node; the house's
                current throw sits beside it as the opponent you're facing
                right now; the streak track trails off to the right as
                already-faced opponents, all riding the same connecting
                rail so they read as one sequence, not stitched-together
                fragments. */}
            <div className="rps-lane-wrap flex-1 flex flex-col justify-center min-h-0 mt-6">
              <h4 className="text-xs uppercase tracking-wide text-muted mb-2.5 ml-0.5">
                Opponent board <span className="text-faint normal-case">— streak {streak}</span>
              </h4>

              <div
                className="rps-lane relative rounded-2xl border overflow-x-auto"
                style={{
                  background: 'color-mix(in srgb, var(--glass) 60%, var(--color-bg-1))',
                  borderColor: 'var(--glass-line)',
                  boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.03)',
                  padding: isMobile ? '10px 12px' : '16px 18px',
                }}
              >
                {/* The connecting rail — a faint horizontal line every node
                    sits on top of, the thing that makes this read as ONE
                    track rather than separate elements dropped next to
                    each other. */}
                <div
                  className="rps-rail absolute left-4 right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                  style={{
                    height: 1,
                    background:
                      'linear-gradient(90deg, transparent, var(--glass-line) 10%, var(--glass-line) 88%, transparent)',
                  }}
                />

                <div className="rps-board relative flex items-center gap-3">
                  <div className="rps-board-you flex flex-col items-center shrink-0">
                    <ThrowGlyph
                      key={`you-${throwIdRef.current}`}
                      id="rpsYou"
                      icon={youRef.current !== null ? MOVE_ICON[youRef.current] : null}
                      iconSize={isMobile ? 22 : 32}
                      boxSize={isMobile ? 54 : 78}
                      dir={-1}
                      tone={resultTone}
                      empty={<span className="text-faint text-base">–</span>}
                    />
                    <span className="text-[10px] text-faint mt-1.5 uppercase tracking-wide">You</span>
                  </div>

                  <Icon
                    name="swords"
                    size={18}
                    className="rps-vs shrink-0"
                    style={{ color: TONE_COLOR[resultTone] ?? 'var(--text-faint)', opacity: resultTone === 'default' ? 0.4 : 0.9 }}
                  />

                  <div className="rps-board-current flex flex-col items-center shrink-0">
                    <ThrowGlyph
                      key={`house-${throwIdRef.current}`}
                      id="rpsHouse"
                      icon={houseRef.current !== null ? MOVE_ICON[houseRef.current] : null}
                      iconSize={isMobile ? 18 : 26}
                      boxSize={isMobile ? 46 : 64}
                      dir={1}
                      delay={0.1}
                      tone={resultTone}
                      empty={<span className="text-faint text-xs">?</span>}
                    />
                    <span className="text-[10px] text-faint mt-1.5 uppercase tracking-wide">Now</span>
                  </div>

                  <div
                    className="rps-lane-fade self-stretch shrink-0"
                    style={{
                      width: 1,
                      minHeight: 64,
                      background:
                        'linear-gradient(180deg, transparent, var(--glass-line) 20%, var(--glass-line) 80%, transparent)',
                    }}
                  />

                  {/* #rpsTrack — half of rps.detect(). Renders the last
                      dozen decisive/tie throws, newest first (i.e. the
                      opponent right before the current one sits closest to
                      the "Now" node), each as a mini opponent tile riding
                      the same rail, exactly like legacy pushTrack(). */}
                  <div className="rps-track flex items-center gap-2 shrink-0" id="rpsTrack">
                    {track.map((t) => (
                      <Reveal key={t.id} as="div" preset="scaleIn" duration={0.22}>
                        <OpponentTile item={t} />
                      </Reveal>
                    ))}
                  </div>

                  {track.length === 0 && (
                    <span className="text-xs text-faint shrink-0">No opponents faced yet.</span>
                  )}

                  {/* Purely decorative — the streak has no hard cap, these
                      just read as "the lane keeps going." Never part of the
                      agent contract (no id, no `.rps-track-item` class). */}
                  <div className="rps-ghosts flex items-center gap-2 shrink-0 ml-0.5" aria-hidden="true">
                    {Array.from({ length: GHOST_SLOTS }).map((_, i) => (
                      <div
                        key={i}
                        className="rps-ghost flex items-center justify-center rounded-full"
                        style={{
                          width: 34,
                          height: 34,
                          border: '1px dashed var(--glass-line)',
                          opacity: 0.35 - i * 0.07,
                        }}
                      >
                        <Icon name="circle-help" size={13} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="field" style={{ marginTop: 14 }}>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Throw</label>
            <div className="rps-btns grid grid-cols-3 gap-2">
              {MOVE_ICON.map((icon, i) => (
                <Button
                  key={icon}
                  id={`rps-move-${i}`}
                  data-move={i}
                  variant="blue"
                  className="rps-move flex-col gap-1.5"
                  style={{ padding: isMobile ? 8 : 14 }}
                  onClick={() => throwMove(i as Move)}
                >
                  <Icon name={icon} size={isMobile ? 18 : 22} />
                  <span className="rps-btn-label">{MOVES[i]}</span>
                </Button>
              ))}
            </div>
          </div>

          {phase === 'playing' && (
            <Button
              id="rpsCash"
              variant="green"
              size="lg"
              block
              onClick={cashOut}
              className="mt-3"
            >
              Cash Out
            </Button>
          )}

          <div className={`stat-grid grid grid-cols-2 mt-4 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            <Stat k="Streak" v={<AnimatedNumber value={streak} id="rpsStreak" />} />
            <Stat
              k="Cash out"
              v={
                cashOutValue !== null ? (
                  <AnimatedNumber value={cashOutValue} format={money} id="rpsCashVal" />
                ) : (
                  <span id="rpsCashVal">—</span>
                )
              }
            />
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}

/* ------------------------------------------------------------
   ThrowGlyph — a circular throw slot with a real throw-and-land tween,
   same Track-B-only discipline as CoinflipGame.tsx's <CoinFace spin>: the
   move is already decided (icon/tone are props, not state this component
   owns), and the animation plays once per mount. The CALLER forces that
   fresh mount with `key={`you-${throwIdRef.current}`}` — this component
   never watches a ref or arms a timer itself.

   `dir` flips the wind-up rotation so the player's throw and the house's
   throw read as pitching toward each other rather than mirroring exactly
   the same motion.
   ------------------------------------------------------------ */
function ThrowGlyph({
  id,
  icon,
  iconSize,
  boxSize,
  dir,
  tone,
  empty,
  delay = 0,
}: {
  id?: string
  icon: IconName | null
  iconSize: number
  boxSize: number
  dir: 1 | -1
  tone: Tone
  empty: ReactNode
  delay?: number
}) {
  const animated = icon !== null && shouldAnimate()
  const borderColor =
    tone === 'default' ? 'var(--glass-line)' : `color-mix(in srgb, ${TONE_COLOR[tone]} 55%, var(--glass-line))`
  const glow =
    tone === 'default' || icon === null
      ? 'none'
      : `0 0 22px -6px color-mix(in srgb, ${TONE_COLOR[tone]} 55%, transparent)`

  return (
    <div
      id={id}
      className="rps-throw rounded-full flex items-center justify-center"
      style={{
        width: boxSize,
        height: boxSize,
        background: 'var(--glass)',
        border: `1px solid ${borderColor}`,
        boxShadow: glow,
      }}
    >
      {icon !== null ? (
        <motion.div
          className="flex items-center justify-center"
          initial={animated ? { scale: 0.3, rotate: dir * 55, y: 16, opacity: 0 } : false}
          animate={
            animated
              ? { scale: [0.3, 1.22, 1], rotate: [dir * 55, dir * -10, 0], y: [16, -5, 0], opacity: [0, 1, 1] }
              : { scale: 1, rotate: 0, y: 0, opacity: 1 }
          }
          transition={
            animated
              ? { duration: DUR.reveal, times: [0, 0.6, 1], ease: EASE_BRAND, delay }
              : { duration: 0 }
          }
        >
          <Icon name={icon} size={iconSize} />
        </motion.div>
      ) : (
        empty
      )}
    </div>
  )
}

/* ------------------------------------------------------------
   OpponentTile — one already-faced opponent in the board row: the house's
   move as the tile's face, a small corner badge carrying the result (the
   player's win/tie/loss against THAT throw). `TrackItem` already carries
   both moves; this only changes how it's drawn, not what it is.
   ------------------------------------------------------------ */
function OpponentTile({ item }: { item: TrackItem }) {
  const tone: Tone = item.res > 0 ? 'green' : item.res < 0 ? 'red' : 'gold'
  const glyph = item.res > 0 ? '✓' : item.res < 0 ? '✕' : '='
  const bg =
    item.res > 0
      ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
      : item.res < 0
        ? 'color-mix(in srgb, var(--color-red) 16%, transparent)'
        : 'color-mix(in srgb, var(--color-gold) 16%, transparent)'
  const border =
    item.res > 0
      ? 'color-mix(in srgb, var(--color-green) 45%, transparent)'
      : item.res < 0
        ? 'color-mix(in srgb, var(--color-red) 40%, transparent)'
        : 'color-mix(in srgb, var(--color-gold) 40%, transparent)'

  return (
    <span
      className="rps-track-item relative inline-flex items-center justify-center rounded-full"
      style={{ width: 42, height: 42, background: bg, border: `1px solid ${border}` }}
      title={`You threw ${MOVES[item.p]} vs. ${MOVES[item.h]} — ${
        item.res > 0 ? 'won' : item.res < 0 ? 'lost' : 'tied'
      }`}
    >
      <Icon name={MOVE_ICON[item.h]} size={18} className="rps-mini" />
      <span
        className="rps-opp-badge absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full text-[9px] font-bold"
        style={{
          width: 15,
          height: 15,
          background: 'var(--color-panel-2)',
          border: `1px solid ${border}`,
          color: TONE_COLOR[tone],
        }}
      >
        {glyph}
      </span>
    </span>
  )
}
