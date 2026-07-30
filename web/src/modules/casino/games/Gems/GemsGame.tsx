import { useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { toast } from '@/platform/ui/toast'
import { SYMBOLS, GemArt, type GemSymbolKey } from './Symbols'
import { useIsMobile } from '@/platform/layout/useMediaQuery'

/* ============================================================
   Cosmic Gems — ported from js/games/gems.js. A 3x3, 5-payline gem slot:
   three rows + both diagonals, bet split evenly across all 5 lines, several
   lines can hit on the same spin. `SYMBOLS` (Symbols.tsx) is the real
   weighted pool + payout table, copied verbatim (rarer gem -> lower `w`,
   higher `pay`). Deliberately NOT a reskin of Slots' reel-strip visual
   language — gems.js's own top comment calls this out explicitly ("a grid,
   many lines, simultaneous wins, and a cool gem theme"), so this renders as
   a cosmic gem-case grid with payline overlays, not scrolling reels.

   AGENT CONTRACT (agent-ui.js:380, `  gems:` key) — every one of these is
   load-bearing:
     detect()  !!$("#gemSpinBtn") && !!$("#gemGrid")
     play()    applies the bet, clicks #gemSpinBtn, sleep(120), then
               waitFor(() => $("#gemSpinBtn") && !$("#gemSpinBtn").disabled, 5000).
   No numeric contract ids, no data-attributes the agent reads mid-round.

   TRUTH vs FEEL, same discipline as Slots/SlotsGame.tsx:
     TRACK A (truth) — doSpin() draws all 9 final gems synchronously up
       front (weighted random, cheat rig included, ported verbatim from
       legacy's doSpin()/evaluate()), then arms three plain `setTimeout`s at
       520/860/1200ms (legacy's `520 + col*340`, col 0..2) that lock one
       COLUMN of cells (c, c+3, c+6) at a time — legacy's own reveal order.
       The LAST column's timeout is what calls finish() — payout, history,
       #gemSpinBtn re-enable — never an animation-complete callback. A
       backgrounded tab still resolves the round on schedule.
     TRACK B (feel) — cells not yet locked scramble through random gems
       every 60ms via a plain `setInterval` (legacy's own `anim` interval,
       ported verbatim), purely cosmetic. If it stalls, Track A's timeouts
       still fire and resolve the round regardless.
   ============================================================ */

const LINES: { idx: [number, number, number]; name: string }[] = [
  { idx: [0, 1, 2], name: 'Top row' },
  { idx: [3, 4, 5], name: 'Middle row' },
  { idx: [6, 7, 8], name: 'Bottom row' },
  { idx: [0, 4, 8], name: 'Diagonal ↘' },
  { idx: [2, 4, 6], name: 'Diagonal ↙' },
]

const SCRAMBLE_MS = 60
const COL_DELAYS = [520, 860, 1200] // ported verbatim: legacy's `520 + col*340`

const WEIGHTED: GemSymbolKey[] = []
SYMBOLS.forEach((sym) => {
  for (let i = 0; i < sym.w; i++) WEIGHTED.push(sym.s)
})

function drawSym(): GemSymbolKey {
  return WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)]
}

type EvalResult = { win: number; hit: string[]; winCells: Set<number> }

/** Ported verbatim from legacy `evaluate()` — 3-of-a-kind on any of the 5
 *  lines pays that gem's `pay`x on a 1/5 slice of the bet; several lines
 *  can hit on the same spin and their wins stack. */
function evaluate(g: GemSymbolKey[], betAmount: number): EvalResult {
  const lineStake = betAmount / 5
  let win = 0
  const hit: string[] = []
  const winCells = new Set<number>()
  for (const L of LINES) {
    const [a, b, c] = L.idx
    if (g[a] === g[b] && g[b] === g[c]) {
      const sym = SYMBOLS.find((s) => s.s === g[a])!
      win += sym.pay * lineStake
      hit.push(L.name)
      L.idx.forEach((i) => winCells.add(i))
    }
  }
  return { win: Math.floor(win), hit, winCells }
}

type SpinRecord = { id: number; win: number }

export default function GemsGame() {
  const betRef = useBetRef()
  const isMobile = useIsMobile()
  const gemArtSize = isMobile ? 34 : 44
  const spinningRef = useRef(false)
  const lockedRef = useRef<Set<number>>(new Set())
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const scrambleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const historyIdRef = useRef(0)
  const bestWinRef = useRef(0)

  const [cells, setCells] = useState<(GemSymbolKey | null)[]>(() => Array(9).fill(null))
  const [spinning, setSpinning] = useState(false)
  const [resultMsg, setResultMsg] = useState('Set your bet and spin.')
  const [resultTone, setResultTone] = useState<'win' | 'lose' | null>(null)
  const [winCells, setWinCells] = useState<Set<number> | null>(null)
  const [hitLines, setHitLines] = useState<string[]>([])
  const [linesHit, setLinesHit] = useState('—')
  const [lastWin, setLastWin] = useState('—')
  const [bestWin, setBestWin] = useState('0')
  const [history, setHistory] = useState<SpinRecord[]>([])

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
      if (scrambleRef.current) clearInterval(scrambleRef.current)
    }
  }, [])

  function finish(g: GemSymbolKey[], stake: number) {
    const r = evaluate(g, stake)
    setLinesHit(r.hit.length ? String(r.hit.length) : '0')
    if (r.win > 0) {
      payout(r.win)
      setWinCells(r.winCells)
      setHitLines(r.hit)
      const big = r.win >= stake * 15
      toast(`${r.hit.length} line win — +${money(r.win)}!`, 'win')
      setResultMsg(`${r.hit.length} line${r.hit.length > 1 ? 's' : ''} · +${fmt(r.win)}${big ? ' — BIG WIN' : ''}`)
      setResultTone('win')
      setLastWin('+' + fmt(r.win))
      if (r.win > bestWinRef.current) {
        bestWinRef.current = r.win
        setBestWin(fmt(r.win))
      }
    } else {
      setWinCells(null)
      setHitLines([])
      setResultMsg('No lines — spin again!')
      setResultTone('lose')
      setLastWin('0')
    }
    setHistory((h) => [...h.slice(-9), { id: ++historyIdRef.current, win: r.win }])
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
    setWinCells(null)
    setHitLines([])
    setLinesHit('—')

    // Track A: truth. Final grid drawn synchronously up front — nine
    // independent weighted draws, with an optional rigged winning line.
    const g: GemSymbolKey[] = Array.from({ length: 9 }, drawSym)
    if (cheatWin()) {
      const L = LINES[Math.floor(Math.random() * LINES.length)]
      const sym = drawSym()
      L.idx.forEach((i) => (g[i] = sym))
    }

    lockedRef.current = new Set()
    setCells(Array(9).fill(null))

    // Track B: cosmetic scramble on unlocked cells, ported verbatim
    // (legacy's `anim` setInterval, 60ms).
    timersRef.current.forEach(clearTimeout)
    if (scrambleRef.current) clearInterval(scrambleRef.current)
    scrambleRef.current = setInterval(() => {
      setCells((prev) => prev.map((c, i) => (lockedRef.current.has(i) ? c : drawSym())))
    }, SCRAMBLE_MS)

    // Track A continued: reveal column by column (cells c, c+3, c+6),
    // ported verbatim (520 + col*340). Last column resolves the round.
    timersRef.current = COL_DELAYS.map((delay, col) =>
      setTimeout(() => {
        const idxs = [col, col + 3, col + 6]
        idxs.forEach((i) => lockedRef.current.add(i))
        setCells((prev) => {
          const next = [...prev]
          idxs.forEach((i) => {
            next[i] = g[i]
          })
          return next
        })
        if (col === 2) {
          if (scrambleRef.current) clearInterval(scrambleRef.current)
          finish(g, stake)
        }
      }, delay),
    )
  }

  return (
    <div>
      <PageHead
        title="Cosmic Gems"
        sub="A 3x3 gem slot with 5 paylines — three rows and both diagonals. Match three gems on any line; several lines can hit at once."
        icon="gem"
      />

      <GameLayout>
        <Panel>
          {/* The machine housing — a cosmic frame around the grid, deep
              space navy/violet with a faint starfield and nebula glow, as
              opposed to Slots' brushed-metal reel bezel. */}
          <div
            className="gem-housing rounded-2xl p-4 relative overflow-hidden"
            style={{
              background:
                'radial-gradient(ellipse at 30% 0%, rgba(122,63,224,0.35), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(47,95,214,0.28), transparent 55%), linear-gradient(160deg, #14162a 0%, #0a0b16 100%)',
              border: '1px solid var(--glass-line)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -10px 26px rgba(0,0,0,0.6), 0 20px 44px -22px rgba(0,0,0,0.75)',
            }}
          >
            {/* Starfield. */}
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  'radial-gradient(1.5px 1.5px at 12% 18%, #fff, transparent), radial-gradient(1.5px 1.5px at 82% 12%, #fff, transparent), radial-gradient(1px 1px at 32% 68%, #fff, transparent), radial-gradient(1px 1px at 60% 82%, #fff, transparent), radial-gradient(1.5px 1.5px at 92% 60%, #fff, transparent), radial-gradient(1px 1px at 6% 55%, #fff, transparent), radial-gradient(1px 1px at 46% 30%, #fff, transparent)',
                backgroundRepeat: 'no-repeat',
              }}
            />

            {/* Marquee strip. */}
            <div className="relative flex items-center justify-center gap-2.5 mb-3.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#c79bff', boxShadow: '0 0 8px #a15bff' }} />
              <span className="text-[11px] uppercase tracking-[0.35em] font-semibold" style={{ color: '#d9c2ff' }}>
                Cosmic Gems
              </span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#c79bff', boxShadow: '0 0 8px #a15bff' }} />
            </div>

            <div
              className="relative rounded-xl p-3"
              style={{
                width: '100%',
                maxWidth: isMobile ? 260 : 210,
                margin: '0 auto',
                background: 'radial-gradient(ellipse at 50% 20%, rgba(140,110,255,0.10), rgba(0,0,0,0.6) 75%)',
                boxShadow: 'inset 0 8px 20px rgba(0,0,0,0.8), inset 0 -6px 16px rgba(0,0,0,0.6)',
              }}
            >
              <div id="gemGrid" className="gem-grid grid grid-cols-3 gap-2.5 relative">
                {cells.map((sym, i) => {
                  const isWin = !!winCells?.has(i)
                  return (
                    <div
                      key={i}
                      data-idx={i}
                      className="gem-cell relative aspect-square rounded-lg flex items-center justify-center"
                      style={{
                        background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.08), rgba(0,0,0,0.5) 75%)',
                        border: isWin ? '1px solid #c79bff' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: isWin
                          ? '0 0 22px 4px rgba(167,91,255,0.55), inset 0 0 0 1px #c79bff'
                          : 'inset 0 4px 10px rgba(0,0,0,0.6)',
                        transition: 'box-shadow 0.3s var(--ease), border-color 0.3s var(--ease)',
                      }}
                    >
                      <GemArt sym={sym} size={gemArtSize} glow={isWin} />
                    </div>
                  )
                })}

                {/* Payline overlay — diagonals drawn as glowing lines, rows
                    highlighted via the cells' own border/glow above. */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ overflow: 'visible' }}
                >
                  {hitLines.includes('Diagonal ↘') && (
                    <line
                      x1="16.67"
                      y1="16.67"
                      x2="83.33"
                      y2="83.33"
                      stroke="#c79bff"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      style={{ filter: 'drop-shadow(0 0 5px #a15bff)' }}
                    />
                  )}
                  {hitLines.includes('Diagonal ↙') && (
                    <line
                      x1="83.33"
                      y1="16.67"
                      x2="16.67"
                      y2="83.33"
                      stroke="#c79bff"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      style={{ filter: 'drop-shadow(0 0 5px #a15bff)' }}
                    />
                  )}
                  {[
                    ['Top row', 16.67],
                    ['Middle row', 50],
                    ['Bottom row', 83.33],
                  ].map(([name, y]) =>
                    hitLines.includes(name as string) ? (
                      <line
                        key={name as string}
                        x1="8"
                        y1={y as number}
                        x2="92"
                        y2={y as number}
                        stroke="#c79bff"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        style={{ filter: 'drop-shadow(0 0 5px #a15bff)' }}
                      />
                    ) : null,
                  )}
                </svg>
              </div>
            </div>

            <div
              id="gemBanner"
              className="relative text-center mt-3 text-sm font-medium min-h-[20px]"
              style={{
                color: resultTone === 'win' ? '#57e6a8' : 'var(--color-muted)',
                textShadow: resultTone === 'win' ? '0 0 14px rgba(87,230,168,0.6)' : 'none',
              }}
            >
              {resultMsg}
            </div>
            <div className="relative text-center text-[11px] text-faint mt-1">
              5 paylines · bet splits across all lines
            </div>
          </div>

          <div className="divider my-3 h-px" style={{ background: 'var(--glass-line)' }} />

          <div className="paytable space-y-1">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted px-1 mb-1">
              <span>Gem</span>
              <span>3-of-a-kind, per line</span>
            </div>
            {SYMBOLS.map((sym) => (
              <div
                key={sym.s}
                className="flex items-center justify-between rounded-lg px-2.5 py-1"
                style={{ background: 'var(--glass)', border: '1px solid var(--glass-line)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex -space-x-1.5">
                    <GemArt sym={sym.s} size={18} />
                    <GemArt sym={sym.s} size={18} />
                    <GemArt sym={sym.s} size={18} />
                  </div>
                  <span className="text-sm text-text">{sym.name}</span>
                </div>
                <div className="text-xs num font-semibold" style={{ color: '#c79bff' }}>
                  {sym.pay}×
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} defaultValue={20} />

          <Button id="gemSpinBtn" variant="purple" size="lg" block disabled={spinning} onClick={doSpin} className="text-[17px]">
            SPIN
          </Button>

          <div className="stat-grid grid grid-cols-3 gap-2 mt-4">
            <Stat k="Lines hit" v={<span id="linesHit">{linesHit}</span>} />
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
