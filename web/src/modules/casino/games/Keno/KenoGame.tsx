import { useCallback, useEffect, useRef, useState } from 'react'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Icon } from '@/platform/icons'
import { Reveal } from '@/platform/motion'
import { TileGrid } from '../../components/TileGrid'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { toast } from '@/platform/ui/toast'
import { fmt } from '@/platform/money/format'
import { sound } from '@/platform/audio/soundStore'
import { useIsMobile } from '@/platform/layout/useMediaQuery'

/* ============================================================
   Keno — ported from js/games/keno.js.

   AGENT CONTRACT (agent-ui.js:1362) — every one of these is load-bearing:

     detect()  window.KenoAPI && #knBoard
     play()    applyBet(bet), then API.setRisk(risk), then — ONLY if
               API.pickCount() === 0 — API.quickPick(), then API.play(),
               then reads #knMsg's textContent for the result
               (agent-ui.js:1374-1380). Note the ORDER: setRisk() runs
               BEFORE the pickCount()/quickPick() gate, and there is no
               `await` between any of these four calls — pickCount() must
               observe setRisk()'s effect (none, here) and quickPick()'s
               effect on the SAME synchronous tick a `useState` update
               would not yet have committed. Round truth therefore lives in
               REFS, not state, exactly like RPSGame's phaseRef/streakRef.

   window.KenoAPI shape (js/games/keno.js:184-189, ported 1:1 — method
   names/signatures/effects match, internals do not: this is a REBUILD, not
   a DOM-query-and-.click() wrapper, per the task brief):
     quickPick(): void    -- clears any existing picks and selects 8 random
                             tiles. UNCONDITIONAL, exactly like legacy's
                             #knRandom click handler — the adapter's own
                             `if (API.pickCount() === 0)` gate is what makes
                             this "only auto-pick when the player/agent
                             hasn't picked anything", not a condition
                             inside quickPick() itself.
     setRisk(r): void     -- sets the risk level if `r` is one of
                             low|classic|medium|high, else no-op (mirrors
                             legacy's `if (b) b.click()` silently doing
                             nothing for an unknown risk key).
     pickCount(): number  -- current number of selected tiles.
     play(): void         -- resolves the draw (same function the human
                             Play button calls).
   ============================================================ */

const T = 40
const DRAW = 10
const MAX_PICK = 10
const TARGET = 0.97
const CAP = 10000

type RiskKey = 'low' | 'classic' | 'medium' | 'high'
type Phase = 'idle' | 'over'
type Tone = 'idle' | 'win' | 'lose'

const RISKS: { key: RiskKey; label: string; tf: number; growth: number }[] = [
  { key: 'low', label: 'Low', tf: 0.3, growth: 2.6 },
  { key: 'classic', label: 'Classic', tf: 0.4, growth: 5 },
  { key: 'medium', label: 'Medium', tf: 0.5, growth: 9 },
  { key: 'high', label: 'High', tf: 0.62, growth: 24 },
]

/** One entry per tile, in DOM order — TileGrid's own "order IS the
 *  contract" rule (TileGrid.tsx). Tile `i` shows the number `i + 1`. */
const TILE_NUMBERS = Array.from({ length: T }, (_, i) => i + 1)

/* ---------------- hypergeometric odds + paytable (js/games/keno.js:21-40, ported verbatim) ---------------- */

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/** P(match exactly m of P picks) when DRAW tiles are drawn from T. */
function hyp(m: number, P: number): number {
  return (comb(P, m) * comb(T - P, DRAW - m)) / comb(T, DRAW)
}

const paytableCache = new Map<string, number[]>()

/** Payout multiplier per match-count for a P-pick ticket at a given risk
 *  level, calibrated so every pick-count/risk combo returns TARGET (97%),
 *  capped at CAP. Ported verbatim from js/games/keno.js's `paytable`. */
function paytable(P: number, riskKey: RiskKey): number[] {
  const ck = `${P}:${riskKey}`
  const cached = paytableCache.get(ck)
  if (cached) return cached

  const R = RISKS.find((r) => r.key === riskKey)!
  const tMin = Math.min(P, Math.max(1, Math.round(P * R.tf)))
  const pay = new Array(P + 1).fill(0)
  const capped = new Array(P + 1).fill(false)

  for (let iter = 0; iter < P + 2; iter++) {
    let budget = TARGET
    let denom = 0
    for (let m = tMin; m <= P; m++) {
      if (capped[m]) budget -= hyp(m, P) * CAP
      else denom += hyp(m, P) * Math.pow(R.growth, m - tMin)
    }
    if (denom <= 0) break
    const base = budget / denom
    let newCap = false
    for (let m = tMin; m <= P; m++) {
      if (capped[m]) continue
      const raw = base * Math.pow(R.growth, m - tMin)
      if (raw > CAP) {
        capped[m] = true
        pay[m] = CAP
        newCap = true
      } else {
        pay[m] = raw
      }
    }
    if (!newCap) break
  }

  paytableCache.set(ck, pay)
  return pay
}

const round2 = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 100) / 100)

/** Fisher-Yates shuffle of 1..T, taken as a fresh array each call — ported
 *  from js/games/keno.js's inline shuffle (used both for the draw and for
 *  quick-pick). */
function shuffledPool(): number[] {
  const pool = TILE_NUMBERS.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

export default function KenoGame() {
  const betRef = useBetRef()
  const isMobile = useIsMobile()

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  // Canonical round state lives in refs — see the file-level note above on
  // why window.KenoAPI can't trust useState to have committed between its
  // own back-to-back calls.
  const picksRef = useRef<Set<number>>(new Set())
  const riskRef = useRef<RiskKey>('classic')
  const phaseRef = useRef<Phase>('idle')
  const drawnRef = useRef<number[]>([])
  const stakeRef = useRef(0)
  const msgRef = useRef<{ text: string; tone: Tone }>({
    text: 'Pick your numbers and play.',
    tone: 'idle',
  })

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  /** Clears the DRAW, not the picks — mirrors legacy resetBoard(): a fresh
   *  round keeps whatever numbers were already selected. */
  const resetBoard = useCallback(() => {
    phaseRef.current = 'idle'
    drawnRef.current = []
    msgRef.current = { text: 'Pick your numbers and play.', tone: 'idle' }
  }, [])

  const toggle = useCallback(
    (n: number) => {
      if (phaseRef.current === 'over') resetBoard()
      if (picksRef.current.has(n)) {
        picksRef.current.delete(n)
      } else {
        if (picksRef.current.size >= MAX_PICK) {
          toast(`Max ${MAX_PICK} picks.`, 'info')
          repaint()
          return
        }
        picksRef.current.add(n)
        sound.play('tick')
      }
      repaint()
    },
    [repaint, resetBoard],
  )

  const clear = useCallback(() => {
    resetBoard()
    picksRef.current = new Set()
    repaint()
  }, [repaint, resetBoard])

  /** Unconditional random ticket of 8 numbers — the adapter's own
   *  `if (pickCount() === 0)` gate (agent-ui.js:1376) is what makes this
   *  "only auto-pick when nothing is picked", not a check in here. Ported
   *  from js/games/keno.js's #knRandom handler; `picks.size || 8` there is
   *  always 8 in practice (it's read immediately after `picks.clear()`). */
  const quickPick = useCallback(() => {
    resetBoard()
    const pool = shuffledPool()
    picksRef.current = new Set(pool.slice(0, 8))
    sound.play('tick')
    repaint()
  }, [repaint, resetBoard])

  const setRisk = useCallback(
    (r: string) => {
      if (RISKS.some((x) => x.key === r)) riskRef.current = r as RiskKey
      repaint()
    },
    [repaint],
  )

  const play = useCallback(() => {
    if (phaseRef.current === 'over') resetBoard()
    if (picksRef.current.size === 0) {
      toast('Pick at least one number.', 'info')
      repaint()
      return
    }
    const bet = readBet(betRef)
    if (bet <= 0) {
      toast('Enter a valid bet amount.', 'info')
      repaint()
      return
    }
    if (!placeBet(bet)) {
      toast('Not enough cash for that bet.', 'lose')
      repaint()
      return
    }
    stakeRef.current = bet

    let drawn = shuffledPool().slice(0, DRAW)
    // 😈 rig: force the draw to include all of the player's picks.
    if (cheatWin()) {
      const pk = [...picksRef.current]
      const rest = shuffledPool().filter((n) => !picksRef.current.has(n))
      drawn = pk.concat(rest).slice(0, DRAW)
    }
    drawnRef.current = drawn
    phaseRef.current = 'over'

    const matches = drawn.filter((n) => picksRef.current.has(n)).length
    const pay = paytable(picksRef.current.size, riskRef.current)[matches] || 0
    const ret = Math.round(bet * pay)
    if (ret > 0) payout(ret)
    const net = ret - bet
    msgRef.current = {
      text: `${matches}/${picksRef.current.size} hit · ${round2(pay)}× · ${net >= 0 ? '+' + fmt(net) : '-' + fmt(-net)}`,
      tone: net > 0 ? 'win' : 'lose',
    }
    sound.play(net > 0 ? (pay >= 10 ? 'bigwin' : 'win') : 'lose')
    repaint()
  }, [betRef, payout, placeBet, repaint, resetBoard])

  /* ---------------- window.KenoAPI ----------------
     The adapter's entire view of this game. Registered on mount, DELETED on
     unmount so detect() can never return true for an unmounted board
     (HANDOFF §2b — mirrors HoldemGame.tsx's window.HoldemAPI teardown). */
  useEffect(() => {
    const api = {
      quickPick: () => quickPick(),
      setRisk: (r: string) => setRisk(r),
      pickCount: () => picksRef.current.size,
      play: () => play(),
    }

    ;(window as unknown as { KenoAPI: typeof api }).KenoAPI = api

    return () => {
      delete (window as unknown as { KenoAPI?: typeof api }).KenoAPI
    }
  }, [quickPick, setRisk, play])

  /* ---------------- render ---------------- */
  const picks = picksRef.current
  const risk = riskRef.current
  const phase = phaseRef.current
  const drawn = drawnRef.current
  const msg = msgRef.current
  const matches = phase === 'over' ? drawn.filter((n) => picks.has(n)).length : 0
  const pay = picks.size > 0 ? paytable(picks.size, risk) : null

  /** Per-tile state classes — TileGrid's own doc: "the ONLY place per-tile
   *  visual state lives, including background/border color" (TileGrid.tsx).
   *  Class NAMES (`picked`/`hit`/`miss`/`drawn`) mirror legacy's own
   *  vocabulary for fidelity; the Tailwind color utilities alongside them
   *  are this app's replacement for css/styles.css's `.kn-tile.*` rules,
   *  which aren't imported here (index.css is a from-scratch Tailwind v4
   *  sheet — see MinesGame.tsx/TowerGame.tsx's own inline-style precedent
   *  for tile coloring; TileGrid just doesn't expose a per-tile style prop,
   *  so color has to travel as classes instead). */
  function tileClasses(n: number): string {
    const isPicked = picks.has(n)
    const isDrawn = phase === 'over' && drawn.includes(n)
    if (isDrawn && isPicked) {
      // A hit needs to read as unmistakable at a glance, not just a tinted
      // border — a solid fill + a bright ring + a stronger glow than any
      // other tile state on the board, so the set of matched numbers pops
      // out of a 40-tile grid instantly instead of blending into "drawn."
      return 'hit relative border-2 border-green bg-green/45 text-text ring-2 ring-green/70 shadow-[0_0_18px_3px_var(--glow-green)] scale-[1.04]'
    }
    if (isPicked) {
      return phase === 'over'
        ? // A miss needs the same visual weight as a hit — a solid tinted
          // fill + a bright ring + a glow, just in the loss register —
          // so losing picks are exactly as unmistakable as winning ones
          // instead of fading into a thin outline.
          'picked miss relative border-2 border-red bg-red/40 text-text ring-2 ring-red/70 shadow-[0_0_18px_3px_var(--glow-red)]'
        : // Selected-but-not-yet-drawn used to be a 1px border, which read as
          // barely-different from an untouched tile across a 40-tile board.
          // It gets the same outline treatment as the resolved states — a
          // 2px border plus a ring — just in the neutral blue register, so
          // what you've picked is unmistakable BEFORE you commit to the draw.
          'picked relative border-2 border-blue bg-blue/20 text-text ring-2 ring-blue/60 shadow-[0_0_12px_1px_rgba(77,140,255,0.35)]'
    }
    if (isDrawn) return 'drawn border-line bg-glass-2 text-muted'
    return 'border-glass-line bg-glass-2 text-text hover:border-gold-deep'
  }

  const toneColor =
    msg.tone === 'win' ? 'var(--color-green)' : msg.tone === 'lose' ? 'var(--color-red)' : 'var(--color-muted)'

  return (
    <div>
      <PageHead
        title="Keno"
        sub={`Pick up to ${MAX_PICK} numbers, choose your risk, and watch ${DRAW} tiles get drawn. Match your numbers for payouts up to ${CAP.toLocaleString()}×.`}
        icon="hash"
      />

      <GameLayout>
        <Panel>
          <TileGrid
            id="knBoard"
            tiles={TILE_NUMBERS}
            cols={8}
            gapPx={isMobile ? 4 : 8}
            onTileClick={(i) => toggle(TILE_NUMBERS[i])}
            tileClassName={(n) => tileClasses(n)}
            renderTile={(n) => {
              const isHit = phase === 'over' && picks.has(n) && drawn.includes(n)
              const isMiss = phase === 'over' && picks.has(n) && !drawn.includes(n)
              return (
                <>
                  <span className={`${isMobile ? 'text-[11px]' : 'text-[13px]'} font-semibold tabular-nums`}>{n}</span>
                  {/* A hit badge that genuinely mounts fresh the instant the
                      round resolves (per TileGrid.tsx's own rule: the
                      button never unmounts, so any pop-in animation has to
                      live on content that DOES mount/unmount, not the tile
                      itself) — a small pop makes the matched set easy to
                      spot at a glance instead of relying on color alone. */}
                  {isHit && (
                    <Reveal
                      as="span"
                      preset="scaleIn"
                      duration={0.22}
                      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-panel bg-green text-[10px] font-bold text-bg-0"
                    >
                      ✓
                    </Reveal>
                  )}
                  {/* Mirrors the hit checkmark badge in the loss register —
                      a picked-but-not-drawn tile needs the same "unmistakable
                      at a glance" pop as a hit, just signalling a miss. */}
                  {isMiss && (
                    <Reveal
                      as="span"
                      preset="scaleIn"
                      duration={0.22}
                      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-panel bg-red text-bg-0"
                    >
                      <Icon name="x" size={10} strokeWidth={3} />
                    </Reveal>
                  )}
                </>
              )
            }}
          />

          {/* #knMsg — the agent's status readout after play() resolves
              (agent-ui.js:1380). Plain text, never a tween target
              (contractIds.ts doesn't list knMsg in NUMERIC_CONTRACT_IDS —
              it's a sentence, not a raw number). */}
          <div className="bj-result mt-3.5 text-center text-sm" id="knMsg" style={{ color: toneColor }}>
            {msg.text}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="bet-row mt-2.5 flex gap-2">
            <Button variant="ghost" className="flex-1 inline-flex items-center justify-center gap-1.5" onClick={quickPick}>
              <Icon name="shuffle" size={14} /> Quick Pick
            </Button>
            <Button variant="ghost" className="flex-1" onClick={clear}>
              Clear
            </Button>
          </div>

          <div className="field mt-3">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Risk</label>
            <div className="bet-row kn-risk flex gap-1.5" id="knRisk">
              {RISKS.map((r) => (
                <Button
                  key={r.key}
                  variant={r.key === risk ? 'gold' : 'ghost'}
                  size="sm"
                  className="flex-1"
                  data-risk={r.key}
                  onClick={() => setRisk(r.key)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-3">
            <Stat k="Picks" v={<span id="knPicks">{`${picks.size} / ${MAX_PICK}`}</span>} />
            <Stat
              k="Hits"
              v={<span id="knHits">{phase === 'over' ? `${matches} / ${picks.size}` : '—'}</span>}
            />
          </div>

          <Button id="knPlay" variant="green" size="lg" block onClick={play} className="mt-3.5">
            Play
          </Button>

          {/* Live paytable for the current pick count / risk — read-only
              display, not part of the agent contract (no id in
              contractIds.ts). Ported from js/games/keno.js's
              renderPaytable(). */}
          <div className="kn-paytable mt-3.5 text-[12.5px]" id="knPay">
            {picks.size === 0 || !pay ? (
              <div className="kn-pay-hint text-muted text-xs">Pick numbers to see the paytable.</div>
            ) : (
              <>
                <div className="kn-pay-title font-bold text-gold-2 mb-1.5">
                  Payout · {picks.size} pick{picks.size > 1 ? 's' : ''} ·{' '}
                  {RISKS.find((r) => r.key === risk)!.label}
                </div>
                <table className="w-full border-collapse">
                  <tbody>
                    {Array.from({ length: picks.size + 1 }, (_, i) => picks.size - i)
                      .filter((m) => (pay[m] || 0) > 0)
                      .map((m) => (
                        <tr key={m}>
                          <td className="py-1 px-2 border-b border-line-soft">
                            {m} / {picks.size} hit
                          </td>
                          <td className="py-1 px-2 border-b border-line-soft text-right text-gold-2 font-bold tabular-nums">
                            {round2(pay[m])}×
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
