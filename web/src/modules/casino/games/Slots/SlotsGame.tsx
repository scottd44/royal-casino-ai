import { useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import { SYMBOLS, SymbolArt, type SlotSymbol } from './Symbols'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Slots ("Lucky Sevens Slots") — ported from js/games/slots.js. 3 reels,
   one payline, weighted-random symbols. `SYMBOLS` (Symbols.tsx) is the
   real payout table, copied verbatim — rarer symbol -> lower `weight`,
   higher payout.

   AGENT CONTRACT (agent-ui.js:360, `  slots:` key) — every one of these is
   load-bearing:
     detect()  !!$("#spinBtn") && !!$("#reels")
     play()    applies the bet, clicks #spinBtn, sleep(120), then
               waitFor(() => $("#spinBtn") && !$("#spinBtn").disabled, 5000).
   No numeric contract ids, no data-attributes the agent reads mid-round —
   the whole contract is "click spin, wait up to 5s for it to re-enable."

   TRUTH vs FEEL, same discipline as Crash/Plinko even though this game
   never touches rAF or canvas:
     TRACK A (truth) — doSpin() draws the three final symbols synchronously
       up front (weighted random, cheat rig included, ported verbatim from
       legacy's doSpin()), then arms three plain `setTimeout`s staggered
       600ms/1020ms/1440ms (legacy's `600 + i*420`). The LAST reel's timeout
       is what calls finish() — payout, history, #spinBtn re-enable — never
       a CSS transitionend/animation-complete callback. A backgrounded tab
       still resolves the round on schedule.
     TRACK B (feel) — each reel's symbol strip is a tall CSS-transitioned
       column (see REEL_LOOKUP/SYMBOL_H below) that scrolls to its final
       resting position over the SAME duration as that reel's Track-A
       timeout, using an overshoot easing curve so it visibly settles with
       a little mechanical bounce rather than snapping. If the transition
       stalls (backgrounded tab, no paint), Track A resolves the round
       regardless — the timers don't wait on it.
   ============================================================ */

const REEL_COUNT = 3
const STRIP_FILL = 16 // filler symbols scrolled through before landing on the real result
const SYMBOL_H = 104 // px — reel window height == one symbol's row height
const STOP_DELAYS = [600, 1020, 1440] // ported verbatim: legacy's `600 + i*420`

const WEIGHTED: SlotSymbol[] = []
SYMBOLS.forEach((sym) => {
  for (let i = 0; i < sym.weight; i++) WEIGHTED.push(sym)
})

function spinReel(): SlotSymbol {
  return WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)]
}

function buildStrip(final: SlotSymbol): SlotSymbol[] {
  const strip: SlotSymbol[] = []
  for (let i = 0; i < STRIP_FILL; i++) strip.push(spinReel())
  strip.push(final)
  return strip
}

type EvalResult = { mult: number; label: string; win: number; matched: number[] }

/** Ported verbatim from legacy `evaluate()` — three of a kind pays `three`x;
 *  otherwise the best matching pair (found via counts{}, first match in
 *  [a,b,c] order) pays `two`x; otherwise nothing. `matched` (the reel
 *  indices that make up the winning combo) is new — legacy has no per-reel
 *  glow, this port does, so it needs to know which reels to light up. */
function evaluate(finals: SlotSymbol[], betAmount: number): EvalResult {
  const [a, b, c] = finals
  if (a.s === b.s && b.s === c.s) {
    return { mult: a.three, label: `Triple ${a.name}!`, win: betAmount * a.three, matched: [0, 1, 2] }
  }
  const counts: Record<string, number> = {}
  finals.forEach((x) => {
    counts[x.s] = (counts[x.s] || 0) + 1
  })
  const pairSym = finals.find((x) => counts[x.s] === 2)
  if (pairSym) {
    const matched = [0, 1, 2].filter((i) => finals[i].s === pairSym.s)
    return { mult: pairSym.two, label: `Pair of ${pairSym.name}`, win: betAmount * pairSym.two, matched }
  }
  return { mult: 0, label: '', win: 0, matched: [] }
}

type ReelState = { strip: SlotSymbol[]; y: number; animate: boolean; settled: boolean }

function initialReel(sym: SlotSymbol): ReelState {
  return { strip: [sym], y: 0, animate: false, settled: true }
}

type SpinRecord = { id: number; win: number }

export default function SlotsGame() {
  const betRef = useBetRef()
  const isMobile = useIsMobile()
  const symbolH = isMobile ? 76 : SYMBOL_H
  const symbolArtSize = isMobile ? 46 : 64
  const spinningRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const historyIdRef = useRef(0)
  const bestWinRef = useRef(0)

  const [reels, setReels] = useState<ReelState[]>(() => [
    initialReel(SYMBOLS[0]),
    initialReel(SYMBOLS[0]),
    initialReel(SYMBOLS[0]),
  ])
  const [spinning, setSpinning] = useState(false)
  const [resultMsg, setResultMsg] = useState('Set your bet and spin.')
  const [resultTone, setResultTone] = useState<'win' | 'lose' | null>(null)
  const [winSymbols, setWinSymbols] = useState<number[] | null>(null)
  const [lastWin, setLastWin] = useState('—')
  const [bestWin, setBestWin] = useState('0')
  const [history, setHistory] = useState<SpinRecord[]>([])

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [])

  function finish(finals: SlotSymbol[], stake: number) {
    const result = evaluate(finals, stake)
    if (result.win > 0) {
      payout(result.win)
      sound.play(result.mult >= 18 ? 'bigwin' : 'win')
      toast(`${result.label} — won ${money(result.win)}!`, 'win')
      setResultMsg(`${result.label} — +${fmt(result.win)}`)
      setResultTone('win')
      setWinSymbols(result.matched)
      setLastWin('+' + fmt(result.win))
      if (result.win > bestWinRef.current) {
        bestWinRef.current = result.win
        setBestWin(fmt(result.win))
      }
    } else {
      sound.play('lose')
      setResultMsg('No win — spin again!')
      setResultTone('lose')
      setWinSymbols(null)
      setLastWin('0')
    }
    setHistory((h) => [...h.slice(-9), { id: ++historyIdRef.current, win: result.win }])
    spinningRef.current = false
    setSpinning(false)
  }

  function doSpin() {
    if (spinningRef.current) return
    const stake = readBet(betRef)
    if (!placeBet(stake)) {
      setResultMsg('Not enough cash for that bet.')
      setResultTone('lose')
      return
    }

    spinningRef.current = true
    setSpinning(true)
    setResultMsg('')
    setResultTone(null)
    setWinSymbols(null)

    // Weighted-random draw for the three reels.
    let finals: SlotSymbol[] = [spinReel(), spinReel(), spinReel()]
    // Rigged odds, ported verbatim: 50% forces a triple, else a shuffled pair.
    if (cheatWin()) {
      const sym = spinReel()
      if (Math.random() < 0.5) {
        finals = [sym, sym, sym]
      } else {
        finals = [sym, sym, spinReel()]
        for (let i = finals.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[finals[i], finals[j]] = [finals[j], finals[i]]
        }
      }
    }

    // Track B: fresh scroll strips, reset to y=0 with no transition so the
    // restart doesn't inherit the previous round's transform, then kicked
    // into motion one frame later so the browser actually registers the
    // reset before the transition starts (the standard "force a reflow"
    // two-rAF trick for restarting a CSS transition).
    setReels(finals.map((sym) => ({ strip: buildStrip(sym), y: 0, animate: false, settled: false })))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReels((prev) => prev.map((r) => ({ ...r, y: -(STRIP_FILL * symbolH), animate: true })))
      })
    })

    // Track A: truth. Staggered setTimeouts, ported verbatim (600 + i*420).
    // The last reel's callback is what resolves the round.
    timersRef.current.forEach(clearTimeout)
    timersRef.current = STOP_DELAYS.map((delay, i) =>
      setTimeout(() => {
        setReels((prev) => {
          const next = [...prev]
          next[i] = { ...next[i], settled: true }
          return next
        })
        sound.play('tick')
        if (i === REEL_COUNT - 1) finish(finals, stake)
      }, delay),
    )
  }

  return (
    <div>
      <PageHead
        title="Lucky Sevens Slots"
        sub="Match symbols across the payline. Three-of-a-kind pays big."
        icon="cherry"
      />

      <GameLayout>
        <Panel>
          {/* The machine housing — a bezel frame with a recessed, backlit
              reel window. Not three flat divs: layered gradients + inset
              shadows give the reels genuine depth. */}
          <div
            className="slot-housing rounded-2xl p-4 relative"
            style={{
              background: 'linear-gradient(160deg, #2c3244 0%, #14161e 100%)',
              border: '1px solid var(--glass-line)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -10px 24px rgba(0,0,0,0.55), 0 20px 44px -22px rgba(0,0,0,0.7)',
            }}
          >
            {/* Marquee strip. */}
            <div className="flex items-center justify-center gap-2.5 mb-3.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-gold)', boxShadow: '0 0 6px var(--glow-gold)' }} />
              <span className="text-[11px] uppercase tracking-[0.35em] font-semibold" style={{ color: 'var(--color-gold)' }}>
                Lucky Sevens
              </span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-gold)', boxShadow: '0 0 6px var(--glow-gold)' }} />
            </div>

            <div
              id="reels"
              className="reels grid grid-cols-3 gap-3 rounded-xl p-3"
              style={{
                background: 'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.05), rgba(0,0,0,0.55) 75%)',
                boxShadow: 'inset 0 8px 18px rgba(0,0,0,0.75), inset 0 -6px 16px rgba(0,0,0,0.55)',
              }}
            >
              {reels.map((r, i) => {
                const isWinner = !!winSymbols?.includes(i) && r.settled
                return (
                  <div
                    key={i}
                    data-reel
                    className="reel-window relative overflow-hidden rounded-lg"
                    style={{
                      height: symbolH,
                      background: 'radial-gradient(circle at 50% 28%, rgba(255,255,255,0.10), rgba(0,0,0,0.5) 72%)',
                      border: isWinner ? '1px solid var(--color-gold)' : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: isWinner
                        ? '0 0 22px 3px var(--glow-gold), inset 0 0 0 1px var(--color-gold)'
                        : 'inset 0 5px 12px rgba(0,0,0,0.65)',
                      transition: 'box-shadow 0.3s var(--ease), border-color 0.3s var(--ease)',
                    }}
                  >
                    <div
                      className="reel-strip"
                      style={{
                        transform: `translateY(${r.y}px)`,
                        transition: r.animate
                          ? `transform ${STOP_DELAYS[i]}ms cubic-bezier(0.22, 1.6, 0.36, 1)`
                          : 'none',
                      }}
                    >
                      {r.strip.map((sym, j) => {
                        const isFinal = j === r.strip.length - 1
                        return (
                          <div
                            key={j}
                            className="flex items-center justify-center"
                            style={{ height: symbolH }}
                          >
                            <SymbolArt sym={sym.s} size={symbolArtSize} glow={isFinal && isWinner} />
                          </div>
                        )
                      })}
                    </div>
                    {/* Payline. */}
                    <div
                      className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{
                        height: 2,
                        background: isWinner ? 'var(--color-gold)' : 'rgba(255,255,255,0.14)',
                        boxShadow: isWinner ? '0 0 10px 2px var(--glow-gold)' : 'none',
                        transition: 'background 0.3s var(--ease), box-shadow 0.3s var(--ease)',
                      }}
                    />
                  </div>
                )
              })}
            </div>

            <div
              id="winBanner"
              className="text-center mt-3 text-sm font-medium min-h-[20px]"
              style={{
                color:
                  resultTone === 'win' ? 'var(--color-green)' : resultTone === 'lose' ? 'var(--color-muted)' : 'var(--color-muted)',
                textShadow: resultTone === 'win' ? '0 0 14px var(--glow-green)' : 'none',
              }}
            >
              {resultMsg}
            </div>
            <div className="text-center text-[11px] text-faint mt-1">One payline · bet applies to that line</div>
          </div>

          <div className="divider my-3 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="paytable space-y-1">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted px-1 mb-1">
              <span>Symbol</span>
              <span>3× match / 2× pair</span>
            </div>
            {SYMBOLS.map((sym) => (
              <div
                key={sym.s}
                className="flex items-center justify-between rounded-lg px-2.5 py-1"
                style={{ background: 'var(--glass)', border: '1px solid var(--glass-line)' }}
              >
                <div className="flex items-center gap-2.5">
                  <SymbolArt sym={sym.s} size={22} />
                  <span className="text-sm text-text">{sym.name}</span>
                </div>
                <div className="text-xs num">
                  <span className="font-semibold" style={{ color: 'var(--color-gold)' }}>
                    {sym.three}×
                  </span>
                  <span className="text-muted"> / {sym.two}×</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} defaultValue={20} />

          <Button id="spinBtn" variant="gold" size="lg" block disabled={spinning} onClick={doSpin} className="text-[17px]">
            SPIN
          </Button>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-4">
            <Stat k="Last win" v={<span id="lastWin">{lastWin}</span>} />
            <Stat k="Best win" v={<span id="bestWin">{bestWin}</span>} />
          </div>

          <div className="divider my-5 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="history">
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Recent spins</h4>
            <div className="history-list flex flex-wrap gap-1.5" id="history">
              {[...history].reverse().map((r) => (
                <Reveal key={r.id} as="span" preset="scaleIn" duration={0.22}>
                  <span
                    className={`pill num text-xs px-2 py-1 rounded-md ${r.win > 0 ? 'win' : 'lose'}`}
                    style={{
                      background:
                        r.win > 0
                          ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                          : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                      color: r.win > 0 ? 'var(--color-green)' : 'var(--color-red)',
                    }}
                  >
                    {r.win > 0 ? '+' + fmt(r.win) : '—'}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
