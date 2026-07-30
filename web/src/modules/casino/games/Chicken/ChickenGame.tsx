import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Icon } from '@/platform/icons'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { shouldAnimate } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Chicken Road — ported from js/games/chicken.js. Cross the road one lane
   at a time; each lane cleared grows the multiplier. Cash out before a car
   flattens you.

   AGENT CONTRACT (agent-ui.js, grep "  chicken:") — every one of these is
   load-bearing:
     detect()  !!$("#chkCross") && !!$("#chkStage")
     play()    writes #chkDiff.value = diff — a PLAIN raw `.value =`
               assignment, NO dispatched event — then applyBet(), clicks
               #chkStart, sleep(250). Then LOOPS (<=20 iters) while
               #chkStart stays disabled: reads #laneNum / #curMult /
               #nextMult as raw textContent, clicks #chkCross or #chkCash,
               then `waitFor(() => !#chkCross.disabled || !#chkStart.disabled)`
               — a round resolves the instant EITHER re-enables (safe cross
               keeps going / crash-or-cashout ends the round).
   #chkDiff is therefore UNCONTROLLED (ref + defaultValue, same rationale as
   #betInput/#mineSelect — BetField.tsx / MinesGame.tsx): a controlled
   <select> bound to state would never see the agent's event-free write. The
   value is read straight off the DOM node at start()-time, never trusted
   out of React state.

   TWO-TRACK DISCIPLINE (same split CrashGame.tsx documents in full): the
   hop / crash CSS-and-Framer motion below is Track B, cosmetic only. Track
   A — `crossed++`, the stat readouts, #chkStart re-enabling — lands on a
   plain `setTimeout` keyed to a fixed duration (380ms safe / 320ms crash,
   ported verbatim from legacy), never on an animation's onComplete. A
   backgrounded tab (exactly where the unattended Lab agent runs) can stall
   every frame of the hop and the round still resolves on schedule.

   THE CAMERA-FOLLOW TRICK, ported from legacy `moveTo()` (chicken.js:112-126):
   the token is rendered as a CHILD of the scrolling track, positioned at the
   lane's true (unshifted) local coordinate. The track itself is translated
   so that same coordinate lands in the middle of the viewport. Because CSS
   transforms compose down the tree, the token ends up centered "for free" —
   no coordinate math needs to account for the camera twice. Both track and
   token move on `x` (a `transform`, via Framer's `animate`), never `left`/
   `top`: animating layout properties would reflow every lane and every car
   on each frame, which is what made the legacy hops read as choppy before
   this file's own comment on the trick was written. Framer's spring
   (`SPRING` below) replaces legacy's CSS `cubic-bezier` glide with a real
   spring — the ask this port is explicitly reviewed against was "eased, not
   a snap," and a spring reads less mechanical than a fixed-duration ease at
   the lane-to-lane cadence this game repeats dozens of times a round.
   ============================================================ */

const HOUSE_EDGE = 0.99

type DiffKey = 'easy' | 'medium' | 'hard' | 'daredevil'

const DIFFS: Record<DiffKey, { label: string; steps: number; surv: number }> = {
  easy: { label: 'Easy', steps: 15, surv: 0.91 },
  medium: { label: 'Medium', steps: 13, surv: 0.83 },
  hard: { label: 'Hard', steps: 11, surv: 0.72 },
  daredevil: { label: 'Daredevil', steps: 9, surv: 0.55 },
}
const DIFF_ORDER: DiffKey[] = ['easy', 'medium', 'hard', 'daredevil']
const DIFF_ACCENT: Record<DiffKey, string> = {
  easy: 'var(--color-green)',
  medium: 'var(--color-gold-2)',
  hard: '#f0883e',
  daredevil: 'var(--color-red)',
}
const CAR_COLORS = ['#e0463f', '#e6a13a', '#4d8cff', '#9d6bff', '#3ecf8e', '#e05a9c', '#22d3ee']

// Fixed pixel widths so the camera math below is pure arithmetic, never a
// DOM measurement of lane elements (only the viewport itself is measured).
const CURB_W = 74
const LANE_W = 92
const TOKEN_W = 34

/** Fair multiplier after `L` safe crossings at survival rate `d.surv`.
 *  Ported verbatim from legacy `multAfter()`. */
function multAfter(L: number, d: { surv: number }): number {
  return L <= 0 ? 1 : HOUSE_EDGE * Math.pow(1 / d.surv, L)
}

/** `index`: 0 = start curb, 1..steps = lanes, steps+1 = finish curb. Local
 *  (unshifted) track-space x of that segment's center. */
function laneCenterX(index: number, steps: number): number {
  if (index <= 0) return CURB_W / 2
  if (index > steps) return CURB_W + steps * LANE_W + CURB_W / 2
  return CURB_W + (index - 1) * LANE_W + LANE_W / 2
}

function trackWidthOf(steps: number): number {
  return CURB_W * 2 + steps * LANE_W
}

/** green -> gold -> red as a lane's index approaches the far end — the risk
 *  ramp the review pass explicitly asked to see (a color intensity cue, not
 *  just a number). */
function riskColor(i: number, steps: number): string {
  const t = Math.min(1, Math.max(0, i / steps))
  const stops: [number, number, number][] = [
    [34, 229, 154],
    [240, 194, 79],
    [255, 77, 109],
  ]
  const seg = t < 0.5 ? 0 : 1
  const local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5
  const [r0, g0, b0] = stops[seg]
  const [r1, g1, b1] = stops[seg + 1]
  const r = Math.round(r0 + (r1 - r0) * local)
  const g = Math.round(g0 + (g1 - g0) * local)
  const b = Math.round(b0 + (b1 - b0) * local)
  return `rgb(${r}, ${g}, ${b})`
}

const SPRING = { type: 'spring', stiffness: 170, damping: 24, mass: 0.9 } as const

export default function ChickenGame() {
  const isMobile = useIsMobile()
  const betRef = useBetRef()
  const diffSelectRef = useRef<HTMLSelectElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const orbControls = useAnimationControls()
  // A ground shadow rendered as a sibling of the token, animated in lockstep
  // with orbControls' own y-hop (inverse: shrinks/fades as the token rises,
  // recovers as it lands) — the "the token is actually leaving the ground"
  // cue a bare y-bounce on the token alone doesn't sell by itself. Purely
  // cosmetic (Track B); never touched by cross()'s truth timers.
  const shadowControls = useAnimationControls()

  const [diffKey, setDiffKey] = useState<DiffKey>('easy')
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [crossed, setCrossed] = useState(0)
  // The DISPLAYED lane index — moves the instant a cross is attempted, even
  // before the 380/320ms truth timer resolves whether it was safe. `crossed`
  // is the truth count; `posIndex` is where the camera/token visually sit.
  const [posIndex, setPosIndex] = useState(0)
  const [crashedLane, setCrashedLane] = useState<number | null>(null)
  const [stake, setStake] = useState(0)
  const [msg, setMsg] = useState('Choose a difficulty and press Start.')
  const [msgTone, setMsgTone] = useState<'idle' | 'live' | 'win' | 'lose'>('idle')
  const [stageWidth, setStageWidth] = useState(0)
  const [camX, setCamX] = useState(0)
  const [tokenX, setTokenX] = useState(0)

  // Refs mirror the truth state so click/timeout handlers can read-then-act
  // synchronously (same reasoning as Mines' minesRef/revealedRef — a
  // setTimeout callback must see the CURRENT value, not a stale closure).
  const activeRef = useRef(false)
  const busyRef = useRef(false)
  const crossedRef = useRef(0)
  const stakeRef = useRef(0)

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const d = DIFFS[diffKey]
  const curMult = crossed === 0 ? 1 : multAfter(crossed, d)
  const nextMult = multAfter(crossed + 1, d)
  const cashVal = active && crossed > 0 ? Math.floor(stake * curMult) : null

  // Stage viewport width, live — the camera formula needs it and a lane
  // strip 9-15 lanes wide will not fit most viewports.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageWidth(el.clientWidth))
    ro.observe(el)
    setStageWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // THE CAMERA-FOLLOW MATH — see the file header. Recomputed any time the
  // visible position, the lane geometry (difficulty changed the lane count)
  // or the viewport width changes.
  useLayoutEffect(() => {
    const steps = d.steps
    const trackW = trackWidthOf(steps)
    const cx = laneCenterX(posIndex, steps)
    const cam = Math.max(Math.min(0, stageWidth - trackW), stageWidth / 2 - cx)
    setCamX(cam)
    setTokenX(cx - TOKEN_W / 2)
  }, [posIndex, d.steps, stageWidth])

  // Stable per-lane car timing, rebuilt only when the road itself is
  // rebuilt (difficulty change) — never re-randomized on an unrelated
  // re-render, or the cars would visibly twitch mid-round.
  const carSeeds = useMemo(
    () =>
      Array.from({ length: d.steps }, () => ({
        dur1: 1.6 + Math.random() * 1.6,
        delay1: -(Math.random() * 3),
        dur2: 1.6 + Math.random() * 1.6,
        delay2: -(Math.random() * 3),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diffKey],
  )

  function onDiffSelectChange() {
    // Mirrors legacy: changing the picker while idle rebuilds the preview
    // road. Live rounds ignore it — #chkDiff is disabled while active.
    if (activeRef.current) return
    const v = diffSelectRef.current?.value as DiffKey | undefined
    if (v && DIFF_ORDER.includes(v)) {
      setDiffKey(v)
      setPosIndex(0)
      setCrossed(0)
      crossedRef.current = 0
      setCrashedLane(null)
    }
  }

  function start() {
    if (activeRef.current) return
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      setMsg('Not enough cash for that bet.')
      setMsgTone('lose')
      return
    }

    // #chkDiff is uncontrolled — read the live DOM value, not React state:
    // the agent writes it raw with no event, exactly like #mineSelect. See
    // the file header.
    const raw = diffSelectRef.current?.value
    const chosen: DiffKey = raw && DIFF_ORDER.includes(raw as DiffKey) ? (raw as DiffKey) : 'easy'

    stakeRef.current = bet
    crossedRef.current = 0
    activeRef.current = true
    busyRef.current = false

    setStake(bet)
    setDiffKey(chosen)
    setCrossed(0)
    setPosIndex(0)
    setCrashedLane(null)
    setActive(true)
    setBusy(false)
    setMsg('Cross the road — tap the next lane or press Cross.')
    setMsgTone('live')
  }

  function cross() {
    if (!activeRef.current || busyRef.current) return
    const dd = DIFFS[diffKey]
    let safe = Math.random() < dd.surv
    if (cheatWin()) safe = true

    busyRef.current = true
    setBusy(true)
    const nextIndex = crossedRef.current + 1
    // The hop is COSMETIC — fires immediately, before the outcome is known,
    // exactly like legacy's moveTo(targetLane, true) ahead of its own
    // safe/unsafe branch below.
    setPosIndex(nextIndex)
    if (shouldAnimate()) {
      orbControls.start({
        y: [0, -30, 0],
        rotate: [0, -7, 5, 0],
        scaleY: [1, 0.85, 1.16, 1],
        scaleX: [1, 1.1, 0.9, 1],
        transition: { duration: 0.38, ease: [0.3, 0.9, 0.3, 1] },
      })
      shadowControls.start({
        scale: [1, 0.55, 1],
        opacity: [0.5, 0.18, 0.5],
        transition: { duration: 0.38, ease: [0.3, 0.9, 0.3, 1] },
      })
    }

    if (safe) {
      sound.play('tick')
      // TRACK A: truth lands on a plain setTimeout, never on the hop
      // animation's completion — see the file header.
      window.setTimeout(() => {
        crossedRef.current = nextIndex
        busyRef.current = false
        setCrossed(nextIndex)
        setBusy(false)
        if (nextIndex >= dd.steps) {
          finishWin(dd)
          return
        }
        setMsg(`Lane ${nextIndex} cleared — ${multAfter(nextIndex, dd).toFixed(2)}×. Keep going or cash out.`)
        setMsgTone('live')
      }, 380)
    } else {
      window.setTimeout(() => {
        if (shouldAnimate()) {
          orbControls.start({
            scale: [1, 1.55, 1.3],
            rotate: [0, 12, -4, 0],
            transition: { duration: 0.5, ease: [0.3, 0.9, 0.3, 1] },
          })
        }
        setCrashedLane(nextIndex)
        sound.play('lose')
        endLoss(nextIndex)
      }, 320)
    }
  }

  function endLoss(hitLane: number) {
    activeRef.current = false
    busyRef.current = false
    setActive(false)
    setBusy(false)
    setMsg(`Splat! A car got you on lane ${hitLane}. Lost ${money(stakeRef.current)}.`)
    setMsgTone('lose')
  }

  function payAndEnd(mult: number, reachedEnd: boolean) {
    const winnings = Math.floor(stakeRef.current * mult)
    payout(winnings)
    sound.play(mult >= 5 ? 'bigwin' : 'cashout')
    activeRef.current = false
    busyRef.current = false
    setActive(false)
    setBusy(false)
    if (shouldAnimate()) {
      orbControls.start({
        y: [0, -16, 0, -12, 0],
        rotate: [0, -8, 8, -4, 0],
        transition: { duration: 0.9, ease: 'easeInOut' },
      })
    }
    setMsg(
      reachedEnd
        ? `Made it across! ${mult.toFixed(2)}× — +${fmt(winnings - stakeRef.current)}!`
        : `Cashed out ${mult.toFixed(2)}× — +${fmt(winnings - stakeRef.current)} profit!`,
    )
    setMsgTone('win')
  }

  function finishWin(dd: { steps: number; surv: number }) {
    payAndEnd(multAfter(dd.steps, dd), true)
  }

  function cashOut() {
    if (!activeRef.current || busyRef.current || crossedRef.current === 0) {
      setMsg('Cross at least one lane before cashing out.')
      return
    }
    payAndEnd(multAfter(crossedRef.current, DIFFS[diffKey]), false)
  }

  const toneColor =
    msgTone === 'win'
      ? 'var(--color-green)'
      : msgTone === 'lose'
        ? 'var(--color-red)'
        : msgTone === 'live'
          ? 'var(--color-gold-2)'
          : 'var(--color-muted)'

  const orbTone: 'idle' | 'bust' | 'win' = msgTone === 'lose' ? 'bust' : msgTone === 'win' ? 'win' : 'idle'
  const orbGradient =
    orbTone === 'bust'
      ? 'radial-gradient(circle at 40% 34%, #fff, var(--color-red) 45%, #7d1024)'
      : orbTone === 'win'
        ? 'radial-gradient(circle at 40% 34%, #fff, var(--color-gold-2) 42%, var(--color-gold))'
        : 'radial-gradient(circle at 40% 34%, #fff, var(--color-gold-2) 42%, var(--color-gold-deep))'
  const orbGlow =
    orbTone === 'bust'
      ? '0 0 16px var(--color-red), 0 0 38px color-mix(in srgb, var(--color-red) 65%, transparent)'
      : orbTone === 'win'
        ? '0 0 20px var(--color-gold), 0 0 48px color-mix(in srgb, var(--color-gold) 75%, transparent)'
        : '0 0 14px var(--color-gold), 0 0 32px color-mix(in srgb, var(--color-gold) 60%, transparent)'

  const posTransition = posIndex === 0 || !shouldAnimate() ? { duration: 0 } : SPRING

  return (
    <div>
      <PageHead
        title="Chicken Road"
        sub="Cross the road one lane at a time — each lane you clear grows your multiplier. Cash out before a car flattens you. Harder roads pay far more but the traffic is deadly."
        icon="bird"
      />

      <GameLayout>
        <Panel>
          <div
            id="chkStage"
            ref={stageRef}
            className={`chk-stage relative rounded-[16px] overflow-hidden border ${isMobile ? 'h-56' : 'h-80'}`}
            style={{
              background: 'linear-gradient(180deg, #3a4048 0%, #2c3138 50%, #3a4048 100%)',
              borderColor: 'var(--glass-line)',
              boxShadow: 'inset 0 10px 26px rgba(0,0,0,0.5), inset 0 -10px 26px rgba(0,0,0,0.5)',
            }}
          >
            <motion.div
              id="chkTrack"
              className="chk-track absolute inset-y-0 left-0 flex items-stretch"
              animate={{ x: camX }}
              transition={posTransition}
              style={{ willChange: 'transform' }}
            >
              {/* Start curb */}
              <div
                className="relative flex items-center justify-center shrink-0"
                style={{
                  width: CURB_W,
                  background: 'repeating-linear-gradient(180deg, #2f5b3a 0 16px, #285032 16px 32px)',
                }}
              >
                <div
                  className="absolute top-0 bottom-0 right-0"
                  style={{
                    width: 7,
                    background: 'repeating-linear-gradient(180deg, #e8edf6 0 11px, var(--color-red) 11px 22px)',
                  }}
                />
                <div
                  className="w-[26px] h-[26px] rounded-[6px]"
                  style={{ background: 'repeating-conic-gradient(#e8edf6 0 25%, #223 0 50%) 0 / 12px 12px' }}
                />
              </div>

              {Array.from({ length: d.steps }, (_, idx) => {
                const i = idx + 1
                const laneMult = multAfter(i, d)
                const cleared = i <= crossed
                const isCrash = crashedLane === i
                const dim = crashedLane !== null && i >= crashedLane && !isCrash
                const isNext = active && !busy && crashedLane === null && i === crossed + 1
                const risk = riskColor(i, d.steps)
                const seed = carSeeds[idx]
                const carColor1 = CAR_COLORS[i % CAR_COLORS.length]
                const carColor2 = CAR_COLORS[(i + 3) % CAR_COLORS.length]

                return (
                  <div
                    key={i}
                    className="chk-lane relative shrink-0 overflow-hidden"
                    data-lane={i}
                    onClick={() => {
                      if (isNext) cross()
                    }}
                    style={{
                      width: LANE_W,
                      cursor: isNext ? 'pointer' : 'default',
                      transition: 'background 0.25s, opacity 0.25s, box-shadow 0.25s',
                      opacity: dim ? 0.32 : 1,
                      background: isCrash
                        ? 'linear-gradient(180deg, rgba(255,77,109,0.55), rgba(255,77,109,0.12))'
                        : cleared
                          ? 'linear-gradient(180deg, rgba(34,229,154,0.2), rgba(34,229,154,0.05))'
                          : isNext
                            ? 'linear-gradient(180deg, rgba(255,220,134,0.22), rgba(255,220,134,0.05))'
                            : `linear-gradient(90deg, rgba(0,0,0,0.18), color-mix(in srgb, ${risk} 7%, transparent) 40%, color-mix(in srgb, ${risk} 7%, transparent) 60%, rgba(0,0,0,0.18))`,
                      boxShadow: isNext ? 'inset 0 0 0 2px rgba(255,220,134,0.7)' : 'none',
                    }}
                  >
                    {/* dashed lane divider */}
                    <div
                      className="absolute left-0 top-0 bottom-0"
                      style={{
                        width: 3,
                        background: 'repeating-linear-gradient(180deg, rgba(255,220,134,0.65) 0 18px, transparent 18px 34px)',
                      }}
                    />

                    {/* multiplier badge — risk-color accented */}
                    <div
                      className="absolute top-[9px] left-[6px] right-[6px] z-10 text-center text-[13px] font-extrabold rounded-md py-[2px] num"
                      style={{
                        color: '#fff',
                        background: 'rgba(8,12,20,0.55)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${risk} 60%, transparent)`,
                      }}
                    >
                      {laneMult.toFixed(2)}×
                    </div>

                    {/* two cars per lane, staggered timing, dimmed to a stopped
                        trail once the lane is safely cleared */}
                    {[
                      { color: carColor1, dur: seed.dur1, delay: seed.delay1 },
                      { color: carColor2, dur: seed.dur2, delay: seed.delay2 },
                    ].map((car, ci) => (
                      <motion.div
                        key={ci}
                        className="absolute left-1/2 rounded-[4px]"
                        style={{
                          marginLeft: -13,
                          top: 0,
                          width: 26,
                          height: 44,
                          background: `linear-gradient(180deg, color-mix(in srgb, ${car.color} 88%, white), ${car.color})`,
                          boxShadow: `0 0 0 1px rgba(0,0,0,0.35), 0 4px 10px rgba(0,0,0,0.5), 0 0 18px -4px ${car.color}`,
                        }}
                        animate={
                          cleared || !shouldAnimate()
                            ? { y: 330, opacity: cleared ? 0.12 : 1 }
                            : { y: [-70, 330], opacity: 1 }
                        }
                        transition={
                          cleared || !shouldAnimate()
                            ? { duration: 0.2 }
                            : { duration: car.dur, delay: car.delay, repeat: Infinity, ease: 'linear' }
                        }
                      >
                        {/* motion trail */}
                        <div
                          className="absolute left-0 right-0 rounded-[4px]"
                          style={{
                            bottom: '100%',
                            height: 60,
                            background: `linear-gradient(0deg, color-mix(in srgb, ${car.color} 46%, transparent), transparent 88%)`,
                          }}
                        />
                        {/* windshield */}
                        <div
                          className="absolute rounded-[2px]"
                          style={{ left: 4, right: 4, bottom: 7, height: 11, background: 'rgba(215,238,255,0.85)' }}
                        />
                      </motion.div>
                    ))}

                    {/* "next lane" — the risk you're about to take, unmissable */}
                    {isNext && (
                      <motion.div
                        className="absolute left-1/2 z-20"
                        style={{
                          bottom: 12,
                          marginLeft: -6,
                          width: 12,
                          height: 12,
                          borderLeft: '2.5px solid var(--color-gold-2)',
                          borderTop: '2.5px solid var(--color-gold-2)',
                          borderRadius: 2,
                          transform: 'rotate(45deg)',
                        }}
                        animate={
                          shouldAnimate()
                            ? { x: [0, 3, 0], y: [0, -3, 0], opacity: [0.65, 1, 0.65] }
                            : { opacity: 0.9 }
                        }
                        transition={shouldAnimate() ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
                      />
                    )}
                  </div>
                )
              })}

              {/* Finish curb */}
              <div
                className="relative flex items-center justify-center shrink-0"
                style={{
                  width: CURB_W,
                  background: 'repeating-linear-gradient(180deg, #2f5b3a 0 16px, #285032 16px 32px)',
                }}
              >
                <div
                  className="absolute top-0 bottom-0 left-0"
                  style={{
                    width: 7,
                    background: 'repeating-linear-gradient(180deg, #e8edf6 0 11px, var(--color-red) 11px 22px)',
                  }}
                />
                <div
                  className="w-[26px] h-[26px] rounded-[6px]"
                  style={{
                    background: 'radial-gradient(circle at 40% 34%, #fff3cd, var(--color-gold) 55%, var(--color-gold-deep))',
                    boxShadow: '0 0 16px var(--glow-gold)',
                  }}
                />
              </div>

              {/* THE TOKEN — a child of the scrolling track, so it inherits
                  the camera transform for free. See the file header. */}
              <motion.div
                id="chkChicken"
                className="chk-chicken absolute top-1/2 left-0 z-30 pointer-events-none"
                style={{ marginTop: -TOKEN_W / 2, willChange: 'transform' }}
                animate={{ x: tokenX }}
                transition={posTransition}
              >
                {/* Ground shadow — see file header comment above
                    shadowControls. Sits flush with the road, under the
                    token, so it reads as "the token left the ground" during
                    the hop rather than "the token grew a shadow." */}
                <motion.div
                  animate={shadowControls}
                  initial={{ scale: 1, opacity: 0.5 }}
                  className="absolute rounded-full"
                  style={{
                    left: '50%',
                    top: TOKEN_W - 6,
                    width: TOKEN_W * 0.8,
                    height: TOKEN_W * 0.28,
                    marginLeft: -(TOKEN_W * 0.4),
                    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 72%)',
                    filter: 'blur(1px)',
                  }}
                />
                <motion.div
                  animate={orbControls}
                  className="relative rounded-full flex items-center justify-center"
                  style={{
                    width: TOKEN_W,
                    height: TOKEN_W,
                    background: orbGradient,
                    boxShadow: orbGlow,
                  }}
                >
                  <Icon
                    name="bird"
                    size={17}
                    style={{ color: orbTone === 'bust' ? '#3a0a12' : '#3a2a02', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }}
                  />
                </motion.div>
              </motion.div>
            </motion.div>

            <div
              className="absolute top-0 bottom-0 left-0 z-40 pointer-events-none"
              style={{ width: 54, background: 'linear-gradient(90deg, rgba(10,14,20,0.65), transparent)' }}
            />
            <div
              className="absolute top-0 bottom-0 right-0 z-40 pointer-events-none"
              style={{ width: 54, background: 'linear-gradient(270deg, rgba(10,14,20,0.65), transparent)' }}
            />
          </div>

          <div id="chkMsg" className="win-banner mt-4 text-center text-sm" style={{ color: toneColor }}>
            {msg}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Difficulty</label>
            <select
              ref={diffSelectRef}
              id="chkDiff"
              className="input w-full rounded-[10px] border px-3 py-2 text-text outline-none"
              defaultValue="easy"
              disabled={active}
              onChange={onDiffSelectChange}
              style={{
                borderColor: 'var(--glass-line)',
                background: 'var(--color-panel-2)',
                boxShadow: `inset 3px 0 0 0 ${DIFF_ACCENT[diffKey]}`,
              }}
            >
              {DIFF_ORDER.map((k) => (
                <option key={k} value={k}>
                  {DIFFS[k].label} — {Math.round(DIFFS[k].surv * 100)}% safe/lane
                </option>
              ))}
            </select>
          </div>

          <div className={`stat-grid grid grid-cols-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            <Stat k="Lane" id="laneNum" v={crossed} />
            <Stat k="Multiplier" id="curMult" v={`${curMult.toFixed(2)}×`} className="multiplier-tag" />
            <Stat k="Next lane" id="nextMult" v={active ? `${nextMult.toFixed(2)}×` : '—'} />
            <Stat k="Cash out" id="cashVal" v={cashVal !== null ? fmt(cashVal) : '—'} />
          </div>

          <Button id="chkStart" variant="green" size="lg" block disabled={active} onClick={start} className="mt-4">
            Start Game
          </Button>
          <Button
            id="chkCross"
            variant="purple"
            size="lg"
            block
            disabled={!active || busy}
            onClick={cross}
            className="mt-2.5"
          >
            Cross ▶
          </Button>
          <Button
            id="chkCash"
            variant="blue"
            size="lg"
            block
            disabled={!active || crossed === 0 || busy}
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
