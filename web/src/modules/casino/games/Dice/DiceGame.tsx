import { useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '../../components/Panel'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt } from '@/platform/money/format'

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
   ============================================================ */

const HOUSE_EDGE = 0.99
const TICK_MS = 55
const TICKS = 8

type Roll = { roll: number; win: boolean }

export default function DiceGame() {
  const betRef = useBetRef()
  const sliderRef = useRef<HTMLInputElement>(null)
  const rollingRef = useRef(false)

  const [target, setTarget] = useState(50)
  const [mode, setMode] = useState<'under' | 'over'>('under')
  const [rolling, setRolling] = useState(false)
  const [display, setDisplay] = useState('—')
  const [outcome, setOutcome] = useState<'win' | 'lose' | null>(null)
  const [msg, setMsg] = useState('Set your target and roll.')
  const [history, setHistory] = useState<Roll[]>([])
  const [betView, setBetView] = useState(20)

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
      if (++ticks > TICKS) {
        clearInterval(anim)
        setDisplay(result.toFixed(2))
        setOutcome(won ? 'win' : 'lose')

        if (won) {
          const winnings = Math.floor(stake * mult)
          payout(winnings)
          setMsg(`${result.toFixed(2)} is ${mode} ${t} — won +${fmt(winnings - stake)}!`)
        } else {
          setMsg(`${result.toFixed(2)} is not ${mode} ${t}. You lose.`)
        }

        setHistory((h) => [...h.slice(-9), { roll: result, win: won }])
        rollingRef.current = false
        setRolling(false)
      }
    }, TICK_MS)
  }

  return (
    <div>
      <PageHead
        title="Dice"
        sub="Pick a target and predict whether the roll lands under or over it."
      />

      <GameLayout>
        <Panel>
          <div className="dice-display text-center py-6">
            <div
              className="dice-roll-num num text-6xl font-semibold"
              id="rollNum"
              style={{
                color:
                  outcome === 'win'
                    ? 'var(--color-green)'
                    : outcome === 'lose'
                      ? 'var(--color-red)'
                      : 'var(--color-text)',
                textShadow:
                  outcome === 'win'
                    ? '0 0 24px var(--glow-green)'
                    : outcome === 'lose'
                      ? '0 0 24px var(--glow-red)'
                      : 'none',
                transition: 'color 0.2s var(--ease)',
              }}
            >
              {display}
            </div>
            <div className="hint text-sm text-muted mt-2" id="rollMsg">
              {msg}
            </div>
          </div>

          <div className="slider-track relative py-4" id="sliderTrack">
            <div
              className="dice-marker num absolute -top-1 text-xs px-1.5 py-0.5 rounded"
              id="diceMarker"
              style={{
                left: `${outcome ? Number(display) : 0}%`,
                opacity: outcome ? 1 : 0,
                transform: 'translateX(-50%)',
                background: outcome === 'win' ? 'var(--color-green)' : 'var(--color-red)',
                color: '#05070c',
                transition: 'left 0.3s var(--ease), opacity 0.2s var(--ease)',
              }}
            >
              {display}
            </div>
            <input
              ref={sliderRef}
              type="range"
              min="2"
              max="98"
              step="1"
              defaultValue={50}
              className="dice-slider w-full"
              id="slider"
              onChange={(e) => onSlider(e.target.value)}
              style={{
                background:
                  mode === 'under'
                    ? `linear-gradient(90deg, var(--color-green) 0 ${target}%, var(--color-red) ${target}% 100%)`
                    : `linear-gradient(90deg, var(--color-red) 0 ${target}%, var(--color-green) ${target}% 100%)`,
                height: 6,
                borderRadius: 999,
                appearance: 'none',
                WebkitAppearance: 'none',
                outline: 'none',
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
              {[...history].reverse().map((r, i) => (
                <span
                  key={`${r.roll}-${i}`}
                  className={`pill num text-xs px-2 py-1 rounded-md ${r.win ? 'win' : 'lose'}`}
                  style={{
                    background: r.win
                      ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                      : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                    color: r.win ? 'var(--color-green)' : 'var(--color-red)',
                  }}
                >
                  {r.roll.toFixed(2)}
                </span>
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
                className={mode === 'under' ? 'text-bg-0' : 'text-muted'}
                style={{
                  background: mode === 'under' ? 'var(--color-green)' : 'var(--glass)',
                  border: '1px solid var(--glass-line)',
                }}
              >
                Roll Under
              </Button>
              <Button
                id="overBtn"
                onClick={() => setMode('over')}
                className={mode === 'over' ? 'text-bg-0' : 'text-muted'}
                style={{
                  background: mode === 'over' ? 'var(--color-green)' : 'var(--glass)',
                  border: '1px solid var(--glass-line)',
                }}
              >
                Roll Over
              </Button>
            </div>
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2">
            <Stat k="Win chance" v={`${winChance.toFixed(0)}%`} id="winChance" />
            <Stat k="Multiplier" v={`${multiplier.toFixed(2)}×`} id="mult" />
            <Stat k="Target" v={target.toFixed(2)} id="targetV" />
            <Stat k="Profit on win" v={betView > 0 ? `+${fmt(profit)}` : '—'} id="profit" />
          </div>

          <Button
            id="rollBtn"
            disabled={rolling}
            onClick={roll}
            className="btn-block w-full mt-4 text-base py-3.5 text-bg-0 font-semibold"
            style={{ background: 'var(--color-gold)' }}
          >
            ROLL DICE
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
