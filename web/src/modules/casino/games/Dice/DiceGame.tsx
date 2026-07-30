import { useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { AnimatedNumber, Reveal } from '@/platform/motion'
import { Icon } from '@/platform/icons'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Dice — ported from js/games/dice.js.

   AGENT CONTRACT (agent-ui.js:630):
     detect()  #rollBtn + #slider
     play()    sets #slider (raw write + input event), clicks #underBtn or
               #overBtn, applyBet() -> #betInput, clicks #rollBtn, then
               waits up to 4s for #rollBtn to become enabled again.

   So #rollBtn MUST go disabled during the roll and enabled after, or the
   adapter's waitFor times out and the round is scored on a stale balance.

   #slider is UNCONTROLLED for the same reason #betInput is — the adapter
   writes it raw. See components/BetField.tsx for the full rationale.

   VISUAL PASS (this file) — Dice/Mines/Holdem only ever got Phase 2's
   lighter "motion + icons" treatment; every other ported game got a real
   "billion-dollar" restyle (see Wheel/Slots/Crash). This pass gives the
   probability-line slider a real console housing and richer feedback
   WITHOUT touching payout math, the round-resolution timer (still a plain
   setInterval — a backgrounded tab must still resolve the round), or any
   contract id. Escalating win celebration (confetti tiering) is already
   wired globally in walletStore.payout() -> motion.celebrate(), so this
   file doesn't need its own confetti call — see platform/motion/confetti.ts.
   ============================================================ */

const HOUSE_EDGE = 0.99
const TICK_MS = 55
const TICKS = 8

type Roll = { id: number; roll: number; win: boolean }

export default function DiceGame() {
  const isMobile = useIsMobile()
  const betRef = useBetRef()
  const sliderRef = useRef<HTMLInputElement>(null)
  const rollingRef = useRef(false)
  // Monotonic, never reused — `history` slices to the last 9, so an
  // array-index key would get reassigned to a DIFFERENT roll the moment the
  // list shifts, and Reveal would skip the entrance on the actually-new
  // entry (or worse, replay it on an old one). See Reveal.tsx's own note on
  // keying content that mounts/unmounts.
  const rollIdRef = useRef(0)
  // Same reasoning as rollIdRef — a fresh key per resolution so the win
  // burst ring replays every time, never once and never on the wrong round.
  const burstIdRef = useRef(0)

  const [target, setTarget] = useState(50)
  const [mode, setMode] = useState<'under' | 'over'>('under')
  const [rolling, setRolling] = useState(false)
  const [display, setDisplay] = useState('—')
  const [outcome, setOutcome] = useState<'win' | 'lose' | null>(null)
  const [msg, setMsg] = useState('Set your target and roll.')
  const [history, setHistory] = useState<Roll[]>([])
  const [betView, setBetView] = useState(20)
  const [burstId, setBurstId] = useState<number | null>(null)

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const winChance = mode === 'under' ? target : 100 - target
  const multiplier = (100 / winChance) * HOUSE_EDGE
  const profit = betView > 0 ? betView * multiplier - betView : 0

  // The adapter writes #slider with a raw value + an "input" event
  // (agent-ui.js:650). React's tracker swallows that event, so onChange does
  // NOT fire and `target` state stays stale — and `target` decides the
  // multiplier, i.e. the payout. The DOM node is the source of truth for an
  // uncontrolled field, so read it at roll time. Same rule as readBet().
  const readTarget = () => {
    const v = Number(sliderRef.current?.value)
    return Number.isFinite(v) ? Math.max(2, Math.min(98, v)) : target
  }

  const onSlider = (v: string) => setTarget(Number(v))

  useEffect(() => {
    return () => {
      rollingRef.current = false
    }
  }, [])

  function roll() {
    if (rollingRef.current) return
    const stake = readBet(betRef)
    if (!placeBet(stake)) {
      setMsg('Not enough cash for that bet.')
      return
    }

    // Authoritative for this round, and re-synced into state so the readouts
    // catch up to whatever the agent picked.
    const t = readTarget()
    if (t !== target) setTarget(t)
    const chance = mode === 'under' ? t : 100 - t
    const mult = (100 / chance) * HOUSE_EDGE

    rollingRef.current = true
    setRolling(true)
    setOutcome(null)
    setBurstId(null)

    let result = Math.floor(Math.random() * 10000) / 100
    if (cheatWin()) {
      result =
        mode === 'under'
          ? Math.floor(Math.random() * t * 100) / 100
          : t + 0.01 + Math.floor(Math.random() * (100 - t) * 100) / 100
    }
    const won = mode === 'under' ? result < t : result > t

    // Anticipation before resolution — ~500ms of tension, per handoff §7.
    // setInterval, not rAF: a backgrounded tab must still settle the round or
    // #rollBtn never re-enables and the agent stalls.
    let ticks = 0
    const anim = setInterval(() => {
      setDisplay((Math.random() * 100).toFixed(2))
      sound.play('tick')
      if (++ticks > TICKS) {
        clearInterval(anim)
        setDisplay(result.toFixed(2))
        setOutcome(won ? 'win' : 'lose')

        if (won) {
          const winnings = Math.floor(stake * mult)
          payout(winnings)
          sound.play(mult >= 10 ? 'bigwin' : 'win')
          setMsg(`${result.toFixed(2)} is ${mode} ${t} — won +${fmt(winnings - stake)}!`)
          burstIdRef.current += 1
          setBurstId(burstIdRef.current)
        } else {
          sound.play('lose')
          setMsg(`${result.toFixed(2)} is not ${mode} ${t}. You lose.`)
        }

        setHistory((h) => [...h.slice(-9), { id: ++rollIdRef.current, roll: result, win: won }])
        rollingRef.current = false
        setRolling(false)
      }
    }, TICK_MS)
  }

  const glowColor =
    outcome === 'win' ? 'var(--color-green)' : outcome === 'lose' ? 'var(--color-red)' : null

  return (
    <div>
      <PageHead
        title="Dice"
        sub="Pick a target and predict whether the roll lands under or over it."
        icon="dices"
      />

      <GameLayout>
        <Panel>
          {/* The console — a recessed, backlit readout housing, same family
              of treatment as Slots' machine bezel / Wheel's stage: layered
              gradients + inset shadows for real depth, a border that flushes
              to the outcome colour, never a flat text block. */}
          <div
            className={`dice-console relative rounded-2xl text-center overflow-hidden ${
              isMobile ? 'px-3 py-4' : 'px-6 py-7'
            } ${rolling ? 'dice-tension' : ''}`}
            style={{
              background:
                'radial-gradient(120% 140% at 50% -10%, color-mix(in srgb, #10182c 88%, transparent), var(--color-panel-2) 72%)',
              border: `1px solid ${glowColor ? `color-mix(in srgb, ${glowColor} 45%, var(--glass-line))` : 'var(--glass-line)'}`,
              boxShadow: `inset 0 0 40px rgba(0,0,0,0.45), ${
                glowColor ? `0 0 50px -12px color-mix(in srgb, ${glowColor} 45%, transparent)` : 'none'
              }`,
              transition: 'border-color 0.3s var(--ease), box-shadow 0.3s var(--ease)',
            }}
          >
            {/* Marquee strip, same recipe as Slots' housing header. */}
            <div className="flex items-center justify-center gap-2.5 mb-3">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-gold)', boxShadow: '0 0 6px var(--glow-gold)' }}
              />
              <span
                className="text-[11px] uppercase tracking-[0.35em] font-semibold"
                style={{ color: 'var(--color-gold)' }}
              >
                Probability Engine
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-gold)', boxShadow: '0 0 6px var(--glow-gold)' }}
              />
            </div>

            {burstId !== null && (
              <div key={burstId} className="dice-burst-ring pointer-events-none" style={{ borderColor: 'var(--color-green)' }} />
            )}

            <div
              className={`dice-roll-num num font-semibold relative ${isMobile ? 'text-4xl' : 'text-7xl'}`}
              id="rollNum"
              style={{
                color: glowColor ?? 'var(--color-text)',
                textShadow: glowColor ? `0 0 28px ${glowColor}` : 'none',
                transition: 'color 0.2s var(--ease)',
              }}
            >
              {display}
            </div>

            <div className="hint text-sm text-muted mt-3 flex items-center justify-center gap-1.5" id="rollMsg">
              {outcome === 'win' && <Icon name="trending-up" size={14} color="var(--color-green)" />}
              {outcome === 'lose' && <Icon name="x" size={14} color="var(--color-red)" />}
              <span>{msg}</span>
            </div>
          </div>

          <div className="slider-track relative pt-8 pb-4" id="sliderTrack">
            {/* Tick marks under the labels below — purely decorative, keyed
                to the same five evenly-spaced stops the text labels use. */}
            <div className="absolute inset-x-0 top-2 flex justify-between px-[2px] pointer-events-none">
              {[0, 25, 50, 75, 100].map((tick) => (
                <span
                  key={tick}
                  className="w-px h-2.5 rounded-full"
                  style={{ background: 'var(--glass-line)' }}
                />
              ))}
            </div>

            <div
              className="dice-marker num absolute -top-1 text-xs font-semibold px-2 py-1 rounded-md"
              id="diceMarker"
              style={{
                left: `${outcome ? Number(display) : 0}%`,
                opacity: outcome ? 1 : 0,
                transform: 'translate(-50%, -100%)',
                background: outcome === 'win' ? 'var(--color-green)' : 'var(--color-red)',
                color: '#05070c',
                boxShadow: outcome
                  ? `0 0 16px ${outcome === 'win' ? 'var(--glow-green)' : 'var(--glow-red)'}`
                  : 'none',
                transition: 'left 0.3s var(--ease), opacity 0.2s var(--ease)',
              }}
            >
              {display}
              <span
                className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2 h-2 rotate-45"
                style={{ background: 'inherit' }}
              />
            </div>
            <input
              ref={sliderRef}
              type="range"
              min="2"
              max="98"
              step="1"
              defaultValue={50}
              className="dice-slider w-full block"
              id="slider"
              onChange={(e) => onSlider(e.target.value)}
              style={{
                background:
                  mode === 'under'
                    ? `linear-gradient(90deg, var(--color-green) 0 ${target}%, var(--color-red) ${target}% 100%)`
                    : `linear-gradient(90deg, var(--color-red) 0 ${target}%, var(--color-green) ${target}% 100%)`,
                height: 8,
                borderRadius: 999,
                appearance: 'none',
                WebkitAppearance: 'none',
                outline: 'none',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px var(--glass-line)',
              }}
            />
          </div>
          <div className="slider-labels flex justify-between text-xs text-faint num">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>

          <div className="divider my-5 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Recent rolls</h4>
            <div className="history-list flex flex-wrap gap-1.5" id="history">
              {/* Each pill is a genuine mount when it's appended (and an
                  eventual unmount once slice(-9) drops it) — the list
                  container itself stays mounted the whole game, so ONLY the
                  item gets Reveal, per Reveal.tsx's own warning against
                  wrapping a persistent container. */}
              {[...history].reverse().map((r) => (
                <Reveal key={r.id} as="span" preset="scaleIn" duration={0.22}>
                  <span
                    className={`pill num rounded-md ${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${r.win ? 'win' : 'lose'}`}
                    style={{
                      background: r.win
                        ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                        : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                      color: r.win ? 'var(--color-green)' : 'var(--color-red)',
                      border: `1px solid ${
                        r.win
                          ? 'color-mix(in srgb, var(--color-green) 30%, transparent)'
                          : 'color-mix(in srgb, var(--color-red) 30%, transparent)'
                      }`,
                    }}
                  >
                    {r.roll.toFixed(2)}
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
              Prediction
            </label>
            <div className="bet-row grid grid-cols-2 gap-2">
              <Button
                id="underBtn"
                onClick={() => setMode('under')}
                variant={mode === 'under' ? 'green' : 'ghost'}
                className={mode === 'under' ? undefined : 'text-muted'}
              >
                Roll Under
              </Button>
              <Button
                id="overBtn"
                onClick={() => setMode('over')}
                variant={mode === 'over' ? 'green' : 'ghost'}
                className={mode === 'over' ? undefined : 'text-muted'}
              >
                Roll Over
              </Button>
            </div>
          </div>

          {/* None of these four ids are in NUMERIC_CONTRACT_IDS (contractIds.ts) —
              they're free to tween. AnimatedNumber still takes `id` so its own
              contract-id guard runs (belt and suspenders), but the id actually
              lives on the AnimatedNumber node, not on Stat's wrapper div, so
              there's exactly one #winChance/#mult/#targetV/#profit in the DOM. */}
          <div className={`stat-grid grid grid-cols-2 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            <Stat
              k="Win chance"
              tone="green"
              v={<AnimatedNumber value={winChance} format={(n) => `${n.toFixed(0)}%`} id="winChance" />}
            />
            <Stat
              k="Multiplier"
              tone="gold"
              v={<AnimatedNumber value={multiplier} format={(n) => `${n.toFixed(2)}×`} id="mult" />}
            />
            <Stat
              k="Target"
              v={<AnimatedNumber value={target} format={(n) => n.toFixed(2)} id="targetV" />}
            />
            <Stat
              k="Profit on win"
              tone="green"
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
            id="rollBtn"
            variant="gold"
            size="lg"
            block
            disabled={rolling}
            onClick={roll}
            className="mt-4"
          >
            ROLL DICE
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>

      {/* Scoped styling for the slider thumb + tension/burst keyframes — no
          shared stylesheet touched, kept local to this game (same pattern as
          Wheel's scoped <style> block). */}
      <style>{`
        .dice-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 30%, #fff6da, var(--color-gold-2) 45%, var(--color-gold) 100%);
          border: 2px solid rgba(5, 7, 12, 0.6);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.55), 0 0 14px var(--glow-gold);
          cursor: pointer;
          transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease);
        }
        .dice-slider::-webkit-slider-thumb:hover { transform: scale(1.12); }
        .dice-slider::-webkit-slider-thumb:active { transform: scale(0.94); }
        .dice-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 30%, #fff6da, var(--color-gold-2) 45%, var(--color-gold) 100%);
          border: 2px solid rgba(5, 7, 12, 0.6);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.55), 0 0 14px var(--glow-gold);
          cursor: pointer;
        }

        @keyframes diceTensionGlow {
          0%, 100% { box-shadow: inset 0 0 40px rgba(0,0,0,0.45), 0 0 0px transparent; }
          50% { box-shadow: inset 0 0 40px rgba(0,0,0,0.45), 0 0 34px -10px color-mix(in srgb, var(--color-gold) 55%, transparent); }
        }
        .dice-tension { animation: diceTensionGlow 0.6s ease-in-out infinite; }

        @keyframes diceBurstRing {
          0% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.4); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.6); }
        }
        .dice-burst-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140px;
          height: 140px;
          border-radius: 999px;
          border-width: 2px;
          border-style: solid;
          animation: diceBurstRing 0.7s cubic-bezier(0.22, 0.8, 0.28, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .dice-tension { animation: none; }
          .dice-burst-ring { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
