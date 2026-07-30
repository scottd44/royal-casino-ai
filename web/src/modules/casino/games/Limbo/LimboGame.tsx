import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { AnimatedNumber, Reveal, shouldAnimate, DUR, EASE_OUT } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Limbo — ported from js/games/limbo.js.

   AGENT CONTRACT (agent-ui.js:758-791):
     detect()  #limboBtn + #targetInput
     play()    sets #targetInput (raw `.value` write + a dispatched "input"
               event — the exact same trap as #betInput/Dice's #slider, see
               BetField.tsx / HANDOFF §2a), applyBet() -> #betInput, clicks
               #limboBtn, waits up to 4s for #limboBtn to become enabled
               again, then reads #limboMsg for the result text.

   So #limboBtn MUST go disabled during the round and re-enable after, or
   the adapter's waitFor times out and the round is scored on a stale
   balance (same failure mode as Dice's #rollBtn).

   #targetInput is UNCONTROLLED for the same reason #betInput/#slider are —
   the adapter writes it raw and a controlled input's value tracker would
   swallow that write. See components/BetField.tsx for the full rationale.

   VISUAL PASS (this file) — a console housing around the multiplier readout
   plus a target-gauge bar, same family of treatment as Dice's probability
   console / Crash's stage glow. Nothing below touches payout math, the
   round-resolution timer (still a plain setInterval — a backgrounded tab
   must still resolve the round so #limboBtn re-enables and #limboMsg
   settles), or any contract id. `#limboNum` is NOT in CONTRACT_IDS
   (contractIds.ts) — the agent never reads the live number, only
   #limboBtn's disabled state and #limboMsg's final text — so the readout,
   the gauge fill, and the pulse/shake are all free to animate however they
   like, riding ALONGSIDE the existing setInterval truth rather than gating
   it. Escalating win celebration (confetti tiering) is already wired
   globally in walletStore.payout() -> motion.celebrate(), so this file
   doesn't need its own confetti call — see platform/motion/confetti.ts.

   THE GAUGE'S HONESTY: `shown` climbs linearly from 0 to the already-drawn
   `result` over STEPS ticks. Since that climb is monotonic, `shown`
   crosses `roundTarget` mid-animation if and only if `result >= roundTarget`
   — i.e. if and only if the round is a win. So flipping the gauge/glow to
   its "cleared" tone the instant `shown >= roundTarget` isn't a fake
   tease — it's the true outcome, foreshadowed a few ticks early using
   numbers already drawn. No extra randomness, no lying to the player.
   ============================================================ */

const HOUSE_EDGE = 0.99 // 1% edge, matching Dice/Crash/Mines/Plinko
const TICK_MS = 45 // ported verbatim from legacy limbo.js's own anticipation timing
const STEPS = 10
// The gauge's scale is ALWAYS `roundTarget * GAUGE_PADDING` — the same
// formula in idle preview and in the locked-in round, and it never factors
// in the drawn `result`. That makes `targetPct` (below) a pure function of
// the padding constant, i.e. a fixed percentage along the bar no matter
// what target is dialled in or what the round draws — the tick stops
// jumping around and the "Target X×" label can honestly sit right at it
// instead of floating at the right edge implying 100%, which it never was.
const GAUGE_PADDING = 1.4

// Instant result multiplier with a built-in house edge, ported verbatim from
// js/games/limbo.js: P(result >= x) = HOUSE_EDGE / x, so every target shares
// the same ~1% edge no matter how high or low it's set.
function drawResult(): number {
  const u = Math.random()
  if (u <= 0) return 1_000_000 // vanishingly rare — treat as a huge hit
  return HOUSE_EDGE / u
}

const winChanceFor = (target: number) => (HOUSE_EDGE / target) * 100 // percent

type Roll = { id: number; result: number; win: boolean }

const PRESETS = [1.5, 2, 10, 100]

export default function LimboGame() {
  const isMobile = useIsMobile()
  const betRef = useBetRef()
  const targetRef = useRef<HTMLInputElement>(null)
  const rollingRef = useRef(false)
  // Monotonic, never reused — see Dice's own rollIdRef note: `history`
  // slices to the last 9, so an array-index key would get reassigned to a
  // DIFFERENT roll the moment the list shifts and Reveal would skip the
  // entrance on the actually-new entry.
  const rollIdRef = useRef(0)

  const [target, setTarget] = useState(2)
  const [rolling, setRolling] = useState(false)
  const [display, setDisplay] = useState('—')
  const [shownNum, setShownNum] = useState(0)
  const [outcome, setOutcome] = useState<'win' | 'lose' | null>(null)
  const [cleared, setCleared] = useState(false) // shown has crossed roundTarget — see file header
  const [msg, setMsg] = useState('Pick a target and press Play.')
  const [history, setHistory] = useState<Roll[]>([])
  const [betView, setBetView] = useState(20)
  // The gauge's own locked-in scale for the round in flight (or the round
  // just shown) — set synchronously in play(), never mid-round, so the bar
  // doesn't rescale under the player's feet while it's animating.
  const [roundTarget, setRoundTarget] = useState(2)
  const [gaugeMax, setGaugeMax] = useState(3)
  // Bumps every resolution so the pulse/shake replays every round, never
  // once and never on the wrong one — same trick as Dice's burstId.
  const [pulseKey, setPulseKey] = useState(0)

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const winChance = winChanceFor(target)
  // Payout multiplier IS the target itself — the whole point of Limbo is
  // that a win pays exactly what you dialled in.
  const profit = betView > 0 ? Math.floor(betView * target) - betView : 0

  // The adapter writes #targetInput with a raw value + a dispatched "input"
  // event (agent-ui.js:782-784). Same trap as Dice's #slider — the DOM node
  // is the source of truth for an uncontrolled field, so read it at fire
  // time rather than trusting React state to have heard the write.
  const readTarget = () => {
    const v = Number(targetRef.current?.value)
    return Number.isFinite(v) && v >= 1.01 ? v : 1.01
  }

  const onTargetInput = (raw: string) => {
    const v = Number(raw)
    if (Number.isFinite(v)) setTarget(v)
  }

  const applyPreset = (v: number) => {
    if (targetRef.current) targetRef.current.value = v.toFixed(2)
    setTarget(v)
  }

  // Idle-state gauge preview: track the live target while no round is in
  // flight, so the marker follows the input/presets before Play locks it
  // in for the round. Skipped entirely mid-round (the ref guard) so a mid-
  // round edit to #targetInput can't rescale the bar out from under the
  // animation already running against `t`/`result` drawn at play() time.
  useEffect(() => {
    if (!rollingRef.current) {
      setRoundTarget(target)
      setGaugeMax(target * GAUGE_PADDING)
    }
  }, [target])

  useEffect(() => {
    return () => {
      rollingRef.current = false
    }
  }, [])

  function play() {
    if (rollingRef.current) return
    const stake = readBet(betRef)
    if (!placeBet(stake)) {
      setMsg('Not enough cash for that bet.')
      return
    }

    // Authoritative for this round, and re-synced into state (and back onto
    // the input) so the readouts catch up to whatever the agent picked.
    const t = readTarget()
    if (t !== target) setTarget(t)
    if (targetRef.current) targetRef.current.value = t.toFixed(2)

    rollingRef.current = true
    setRolling(true)
    setOutcome(null)
    setCleared(false)
    setShownNum(0)

    let result = drawResult()
    // Rigged odds: force a result at or above the target.
    if (cheatWin()) result = t * (1 + Math.random())
    const won = result >= t

    // Lock the gauge's scale for this round — see the file header. Same
    // formula as the idle preview effect above, and deliberately blind to
    // `result`: the drawn outcome only ever affects the FILL (`gaugePct`,
    // capped at 100% below), never the axis the target tick sits on.
    setRoundTarget(t)
    setGaugeMax(t * GAUGE_PADDING)

    // Anticipation before resolution, ported verbatim from js/games/limbo.js:
    // the shown number eases UP toward the final result over STEPS ticks
    // (Dice flickers randomly instead — different game, different feel).
    // setInterval, not rAF, per Dice's own note (HANDOFF §7): a backgrounded
    // tab must still settle the round or #limboBtn never re-enables and the
    // agent's waitFor stalls out.
    let ticks = 0
    const anim = setInterval(() => {
      ticks++
      const shown = result * (ticks / STEPS)
      setDisplay(shown.toFixed(2) + '×')
      setShownNum(shown)
      sound.play('tick')
      if (shown >= t) setCleared(true)

      if (ticks >= STEPS) {
        clearInterval(anim)
        setDisplay(result.toFixed(2) + '×')
        setShownNum(result)
        setOutcome(won ? 'win' : 'lose')
        setPulseKey((k) => k + 1)

        if (won) {
          const winnings = Math.floor(stake * t)
          payout(winnings)
          sound.play(t >= 10 ? 'bigwin' : 'win')
          setMsg(`${result.toFixed(2)}× ≥ ${t.toFixed(2)}× — won +${fmt(winnings - stake)}!`)
        } else {
          sound.play('lose')
          setMsg(`${result.toFixed(2)}× fell short of ${t.toFixed(2)}×. You lose.`)
        }

        setHistory((h) => [...h.slice(-9), { id: ++rollIdRef.current, result, win: won }])
        rollingRef.current = false
        setRolling(false)
      }
    }, TICK_MS)
  }

  // Escalating tone: neutral while far from the target, warms to gold as
  // `shown` approaches it, flips to the "cleared" green the instant `shown`
  // crosses `roundTarget` (a true signal, not a tease — see the file
  // header), then settles to the final win/lose colour at resolution.
  const climbRatio = roundTarget > 0 ? shownNum / roundTarget : 0
  const liveColor =
    outcome === 'win'
      ? 'var(--color-green)'
      : outcome === 'lose'
        ? 'var(--color-red)'
        : cleared
          ? 'var(--color-green)'
          : climbRatio >= 0.85
            ? 'var(--color-gold)'
            : rolling
              ? 'var(--color-gold-2)'
              : 'var(--color-text)'

  const stageTone =
    outcome === 'win' || (rolling && cleared)
      ? 'var(--color-green)'
      : outcome === 'lose'
        ? 'var(--color-red)'
        : rolling
          ? 'var(--color-gold)'
          : null

  const gaugePct = gaugeMax > 0 ? Math.min(100, (shownNum / gaugeMax) * 100) : 0
  const targetPct = gaugeMax > 0 ? Math.min(100, (roundTarget / gaugeMax) * 100) : 0

  const animated = shouldAnimate()

  return (
    <div>
      <PageHead
        title="Limbo"
        sub="Set a target multiplier and fire. If the random result lands at or above your target, you win. Higher targets pay more but hit less."
        icon="trending-up"
      />

      <GameLayout>
        <Panel>
          {/* The console — a recessed, backlit readout housing, same family
              of treatment as Dice's probability console / Crash's stage
              glow: layered gradients + inset shadow for depth, a border/glow
              that flushes to the live climb tone, never a flat text block. */}
          <div
            className={`limbo-console relative rounded-2xl text-center overflow-hidden ${
              isMobile ? 'px-3 py-4' : 'px-6 py-7'
            } ${rolling ? 'limbo-tension' : ''}`}
            style={{
              background:
                'radial-gradient(120% 140% at 50% -10%, color-mix(in srgb, #10182c 88%, transparent), var(--color-panel-2) 72%)',
              border: `1px solid ${stageTone ? `color-mix(in srgb, ${stageTone} 45%, var(--glass-line))` : 'var(--glass-line)'}`,
              boxShadow: `inset 0 0 40px rgba(0,0,0,0.45), ${
                stageTone ? `0 0 50px -12px color-mix(in srgb, ${stageTone} 45%, transparent)` : 'none'
              }`,
              transition: 'border-color 0.3s var(--ease), box-shadow 0.3s var(--ease)',
            }}
          >
            <div className="flex items-center justify-center gap-2.5 mb-3">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-gold)', boxShadow: '0 0 6px var(--glow-gold)' }}
              />
              <span
                className="text-[11px] uppercase tracking-[0.35em] font-semibold"
                style={{ color: 'var(--color-gold)' }}
              >
                Multiplier Engine
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-gold)', boxShadow: '0 0 6px var(--glow-gold)' }}
              />
            </div>

            {outcome === 'win' && (
              <div key={`burst-${pulseKey}`} className="limbo-burst-ring pointer-events-none" style={{ borderColor: 'var(--color-green)' }} />
            )}

            {/* One-shot pulse (win) / shake (lose) on resolution, replayed
                every round via the `pulseKey` remount — riding alongside the
                setInterval truth above, never gating it (the interval has
                already committed `outcome`/`msg`/#limboBtn's re-enable by
                the time this paints). */}
            <motion.div
              key={`num-${pulseKey}`}
              initial={false}
              animate={
                !animated
                  ? {}
                  : outcome === 'win'
                    ? { scale: [1, 1.14, 1] }
                    : outcome === 'lose'
                      ? { x: [0, -9, 8, -6, 4, 0] }
                      : {}
              }
              transition={{ duration: DUR.reveal, ease: EASE_OUT }}
              className={`dice-roll-num num font-semibold ${isMobile ? 'text-4xl' : 'text-6xl'}`}
              id="limboNum"
              style={{
                color: liveColor,
                textShadow: stageTone || cleared ? `0 0 24px ${stageTone ?? liveColor}` : 'none',
                transition: 'color 0.15s var(--ease), text-shadow 0.15s var(--ease)',
              }}
            >
              {display}
            </motion.div>

            <div className="hint text-sm text-muted mt-2" id="limboMsg">
              {msg}
            </div>

            {/* The target gauge — see the file header for why "cleared"
                is a true signal, not a tease. Locked to `roundTarget`/
                `gaugeMax`, both frozen for the round in play(). */}
            <div className="limbo-gauge relative h-2.5 rounded-full overflow-hidden mt-6" style={{ background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${gaugePct}%`,
                  background:
                    outcome === 'win' || (rolling && cleared)
                      ? 'linear-gradient(90deg, color-mix(in srgb, var(--color-green) 70%, transparent), var(--color-green))'
                      : outcome === 'lose'
                        ? 'linear-gradient(90deg, color-mix(in srgb, var(--color-red) 70%, transparent), var(--color-red))'
                        : 'linear-gradient(90deg, color-mix(in srgb, var(--color-gold) 55%, transparent), var(--color-gold))',
                  boxShadow: stageTone ? `0 0 12px color-mix(in srgb, ${stageTone} 60%, transparent)` : 'none',
                  transition: animated ? 'width 0.05s linear, background 0.2s var(--ease)' : 'none',
                }}
              />
              <div
                className="absolute top-0 bottom-0 w-[2px]"
                style={{
                  left: `${targetPct}%`,
                  background: 'var(--color-text)',
                  opacity: 0.85,
                  boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                }}
              />
            </div>
            {/* Labelled honestly: "Target X×" sits directly under the tick
                (at `targetPct`, the same position the tick itself is drawn
                at — see `GAUGE_PADDING`), not floated at the right edge
                implying the tick reaches 100% when it never does. The right
                edge is labelled "Max" — what it actually is. */}
            <div className="relative h-4 text-[10px] text-faint mt-1.5 num">
              <span className="absolute left-0">1.00×</span>
              <span
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${targetPct}%` }}
              >
                Target {roundTarget.toFixed(2)}×
              </span>
              <span className="absolute right-0">Max</span>
            </div>
          </div>

          <div className="divider my-5 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Recent results</h4>
            <div className="history-list flex flex-wrap gap-1.5" id="history">
              {/* Same mount/unmount boundary as Dice's history pills — the
                  list container stays mounted the whole game, only each
                  item (genuinely appended/eventually dropped by slice(-9))
                  gets Reveal. See Reveal.tsx's warning against wrapping a
                  persistent container. */}
              {[...history].reverse().map((r) => (
                <Reveal key={r.id} as="span" preset="scaleIn" duration={0.22}>
                  <span
                    className={`pill num rounded-md ${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${r.win ? 'win' : 'lose'}`}
                    style={{
                      background: r.win
                        ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                        : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                      color: r.win ? 'var(--color-green)' : 'var(--color-red)',
                    }}
                  >
                    {r.result.toFixed(2)}×
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} onChange={setBetView} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
              Target multiplier
            </label>
            <input
              ref={targetRef}
              type="number"
              min="1.01"
              step="0.01"
              defaultValue="2.00"
              className="input w-full rounded-[10px] border px-3 py-2 text-text outline-none"
              id="targetInput"
              onChange={(e) => onTargetInput(e.target.value)}
              style={{ borderColor: 'var(--glass-line)', background: 'var(--color-panel-2)' }}
            />
            <div className={`bet-row grid grid-cols-4 mt-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={isMobile ? 'text-muted text-xs px-1' : 'text-muted'}
                  onClick={() => applyPreset(p)}
                >
                  {p}×
                </Button>
              ))}
            </div>
          </div>

          {/* None of winChance/mult/profit are in NUMERIC_CONTRACT_IDS
              (contractIds.ts) — they're free to tween. AnimatedNumber still
              takes `id` so its own contract-id guard runs (belt and
              suspenders), but the id lives on the AnimatedNumber node, not
              also on Stat's wrapper div, so there's exactly one
              #winChance/#mult/#profit in the DOM. */}
          <div className={`stat-grid grid grid-cols-3 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            <Stat
              k="Win chance"
              v={<AnimatedNumber value={winChance} format={(n) => `${n.toFixed(2)}%`} id="winChance" />}
            />
            <Stat
              k="Payout"
              v={<AnimatedNumber value={target} format={(n) => `${n.toFixed(2)}×`} id="mult" />}
            />
            <Stat
              k="Profit on win"
              v={
                betView > 0 ? (
                  <AnimatedNumber value={profit} format={(n) => `+${fmt(n)}`} id="profit" />
                ) : (
                  <span id="profit">—</span>
                )
              }
            />
          </div>

          <Button
            id="limboBtn"
            variant="gold"
            size="lg"
            block
            disabled={rolling}
            onClick={play}
            className="mt-4"
          >
            PLAY LIMBO
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>

      {/* Scoped styling for the tension/burst keyframes — no shared
          stylesheet touched, kept local to this game (same pattern as
          Dice/Wheel's own scoped <style> blocks). */}
      <style>{`
        @keyframes limboTensionGlow {
          0%, 100% { box-shadow: inset 0 0 40px rgba(0,0,0,0.45), 0 0 0px transparent; }
          50% { box-shadow: inset 0 0 40px rgba(0,0,0,0.45), 0 0 34px -10px color-mix(in srgb, var(--color-gold) 55%, transparent); }
        }
        .limbo-tension { animation: limboTensionGlow 0.6s ease-in-out infinite; }

        @keyframes limboBurstRing {
          0% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.4); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.6); }
        }
        .limbo-burst-ring {
          position: absolute;
          top: 45%;
          left: 50%;
          width: 140px;
          height: 140px;
          border-radius: 999px;
          border-width: 2px;
          border-style: solid;
          animation: limboBurstRing 0.7s cubic-bezier(0.22, 0.8, 0.28, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .limbo-tension { animation: none; }
          .limbo-burst-ring { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
