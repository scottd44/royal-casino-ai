import { useRef, useState } from 'react'
import { Icon } from '@/platform/icons'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { AnimatedNumber, Reveal, useMotionPolicy } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money, randInt, pick } from '@/platform/money/format'
import { minesSounds } from './sounds'

/* ============================================================
   Mines — ported from js/games/mines.js.

   AGENT CONTRACT (agent-ui.js:661) — every one of these is load-bearing:

     detect()   #startBtn + #grid
     setup      writes #mineSelect RAW with no event, then applyBet, then
                clicks #startBtn
     loop gate  `while (... $("#startBtn").disabled && guard++ < 25)`
                -> #startBtn MUST be disabled for the whole live round, or
                   the agent plays exactly zero tiles and cashes nothing
     reads      #grid .tile          (index order == render order; it clicks
                                      tiles[idx] by position)
                .tile.revealed       (to compute `available`)
                .tile.gem            (gem count — queried GLOBALLY, so no
                                      other element on the page may carry
                                      .gem)
                #curMult / #nextMult textContent
     cashout    clicks #cashBtn

   #mineSelect is UNCONTROLLED: the adapter's raw write dispatches no event
   at all, so a controlled select would silently keep the default mine count.
   See tests/shim.spec.ts — that case is measured.
   ============================================================ */

const SIZE = 25
const HOUSE_EDGE = 0.99
const MINE_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24]

/** Fair multiplier after `picks` safe reveals with `m` mines on a 25-tile board. */
function multiplierAfter(picks: number, m: number): number {
  let mult = 1
  for (let i = 0; i < picks; i++) mult *= (SIZE - i) / (SIZE - m - i)
  return mult * HOUSE_EDGE
}

type TileState = 'hidden' | 'gem' | 'mine' | 'dim-gem' | 'dim-mine'

export default function MinesGame() {
  const betRef = useBetRef()
  const mineSelectRef = useRef<HTMLSelectElement>(null)

  const [tiles, setTiles] = useState<TileState[]>(() => Array(SIZE).fill('hidden'))
  const [active, setActive] = useState(false)
  const [revealedCount, setRevealedCount] = useState(0)
  const [mineCount, setMineCount] = useState(3)
  const [stake, setStake] = useState(0)
  const [msg, setMsg] = useState('Set your bet and press Start.')
  const [msgTone, setMsgTone] = useState<'idle' | 'win' | 'lose' | 'live'>('idle')
  // The tile that ended the round (mine hit), or `null` for a cashout / a
  // fresh board. Purely cosmetic: it's the origin the reveal-all ripple and
  // the bust flash key off — never read by game logic.
  const [hitIdx, setHitIdx] = useState<number | null>(null)
  const motionPolicy = useMotionPolicy()

  // Board truth lives in refs: the tile click handler must read the CURRENT
  // mine layout synchronously, and the agent clicks tiles far faster than a
  // state-driven re-render would settle.
  const minesRef = useRef<Set<number>>(new Set())
  const revealedRef = useRef<Set<number>>(new Set())
  const activeRef = useRef(false)
  const stakeRef = useRef(0)
  const mineCountRef = useRef(3)

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const curMult = revealedCount === 0 ? 1 : multiplierAfter(revealedCount, mineCount)
  const nextMult = multiplierAfter(revealedCount + 1, mineCount)

  function start() {
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      setMsg('Not enough cash for that bet.')
      setMsgTone('lose')
      return
    }

    // Read the select from the DOM, not state: the agent writes it raw with
    // no event, so state may not have heard about it.
    const m = Number(mineSelectRef.current?.value) || 3

    const mines = new Set<number>()
    while (mines.size < m) mines.add(randInt(0, SIZE - 1))

    minesRef.current = mines
    revealedRef.current = new Set()
    activeRef.current = true
    stakeRef.current = bet
    mineCountRef.current = m

    setTiles(Array(SIZE).fill('hidden'))
    setMineCount(m)
    setStake(bet)
    setRevealedCount(0)
    setActive(true)
    setHitIdx(null)
    setMsg('Pick a tile…')
    setMsgTone('live')
  }

  function revealAll(hitIdx: number) {
    const mines = minesRef.current
    const revealed = revealedRef.current
    setTiles(
      Array.from({ length: SIZE }, (_, i) => {
        if (mines.has(i)) return i === hitIdx ? 'mine' : 'dim-mine'
        if (revealed.has(i)) return 'gem'
        return 'dim-gem'
      }),
    )
  }

  function endLoss(idx: number) {
    activeRef.current = false
    setActive(false)
    setHitIdx(idx)
    revealAll(idx)
    minesSounds.lose()
    setMsg(`Boom — you hit a mine and lost ${money(stakeRef.current)}.`)
    setMsgTone('lose')
  }

  function cashOut() {
    if (!activeRef.current || revealedRef.current.size === 0) {
      setMsg('Reveal at least one gem before cashing out.')
      return
    }
    const mult = multiplierAfter(revealedRef.current.size, mineCountRef.current)
    const winnings = Math.floor(stakeRef.current * mult)
    payout(winnings)
    activeRef.current = false
    setActive(false)
    revealAll(-1)
    if (mult >= 3) minesSounds.bigwin()
    else minesSounds.cashout()
    setMsg(`Cashed out ${mult.toFixed(2)}× — +${fmt(winnings - stakeRef.current)} profit!`)
    setMsgTone('win')
  }

  function onTile(i: number) {
    if (!activeRef.current || revealedRef.current.has(i)) return

    // Rigged odds: if this tile is a mine, quietly move it somewhere safe.
    if (minesRef.current.has(i) && cheatWin()) {
      const safe: number[] = []
      for (let k = 0; k < SIZE; k++) {
        if (!minesRef.current.has(k) && !revealedRef.current.has(k) && k !== i) safe.push(k)
      }
      if (safe.length) {
        minesRef.current.delete(i)
        minesRef.current.add(pick(safe))
      }
    }

    if (minesRef.current.has(i)) {
      setTiles((t) => t.map((v, k) => (k === i ? 'mine' : v)))
      endLoss(i)
      return
    }

    revealedRef.current.add(i)
    const n = revealedRef.current.size
    setTiles((t) => t.map((v, k) => (k === i ? 'gem' : v)))
    setRevealedCount(n)

    if (n === SIZE - mineCountRef.current) cashOut()
  }

  const toneColor =
    msgTone === 'win'
      ? 'var(--color-green)'
      : msgTone === 'lose'
        ? 'var(--color-red)'
        : msgTone === 'live'
          ? 'var(--color-gold-2)'
          : 'var(--color-muted)'

  // Risk heat — purely a display ramp over the current multiplier, no
  // relation to the fair-odds math above. Climbs from calm gold toward
  // danger red as `curMult` compounds, so the tension of "one more tile"
  // actually reads on screen instead of living only in the number.
  const heat = active ? Math.min(1, Math.max(0, (curMult - 1) / 4)) : 0
  const heatColor = `color-mix(in srgb, var(--color-red) ${Math.round(heat * 100)}%, var(--color-gold-2))`
  const heatPct = Math.round(heat * 100)
  const pulseHeat = motionPolicy === 'full' && heat > 0.55

  // The board's ripple origin for the reveal-all sequencing below — the
  // mine that ended the round, or the board's own centre for a clean
  // cashout (no single "epicentre" makes sense there, so it fans out
  // evenly instead).
  const rippleOrigin = hitIdx ?? 12
  const busted = !active && msgTone === 'lose'

  return (
    <div>
      <PageHead
        title="Mines"
        sub="Uncover gems to grow your multiplier. Hit a mine and you lose the bet."
        icon="bomb"
      />

      <GameLayout>
        <Panel>
          {/* Capped at 420px and centered — a bare `grid-cols-5` with no
              max-width stretches every tile to fill the panel's full width,
              which on a wide panel blows the 5×5 board up far larger than
              a mines tile needs to be ("too zoomed in"). Tiles stay square
              (aspect-square) so capping the grid's own width is enough;
              nothing about the tile markup/contract below changes. */}
          <div className="mines-board-wrap relative mx-auto w-full" style={{ maxWidth: 420 }}>
            <div
              className={['mines-grid grid grid-cols-5 gap-2 w-full', busted ? 'mines-bust-shake' : ''].join(' ')}
              id="grid"
            >
              {tiles.map((st, i) => {
                const revealed = st !== 'hidden'
                const isGem = st === 'gem'
                const isMine = st === 'mine' || st === 'dim-mine'
                const isHitMine = st === 'mine'
                const isDimGem = st === 'dim-gem'
                const dim = isDimGem || st === 'dim-mine'
                // Distance-from-origin ripple: dim reveal-all tiles fade in
                // in a wave from the mine that ended the round (or the
                // board centre on a clean cashout) instead of all flashing
                // in at once.
                const rippleDelayMs = dim ? Math.min(260, Math.abs(i - rippleOrigin) * 14) : 0
                return (
                  <button
                    key={i}
                    type="button"
                    data-idx={i}
                    onClick={() => onTile(i)}
                    /* `.revealed` and `.gem` are read by the adapter. `.gem` must
                       mean exactly "a gem this round revealed" — the query is
                       document-wide, so dim reveal-all gems must NOT carry it. */
                    className={[
                      'tile relative aspect-square rounded-[10px] border flex items-center justify-center',
                      'transition-[background,border-color,box-shadow,opacity,transform] duration-300',
                      active && !revealed ? 'active:scale-90 hover:-translate-y-0.5 hover:border-gold-deep' : '',
                      revealed ? 'revealed' : '',
                      isGem ? 'gem' : '',
                      isMine ? 'mine' : '',
                      isGem ? 'mines-tile-gem-pop' : '',
                      isHitMine ? 'mines-tile-mine-hit' : '',
                      dim ? 'opacity-45' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      borderColor: isGem
                        ? 'color-mix(in srgb, var(--color-green) 55%, var(--glass-line))'
                        : isHitMine
                          ? 'color-mix(in srgb, var(--color-red) 65%, var(--glass-line))'
                          : 'var(--glass-line)',
                      background: isGem
                        ? 'radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--color-green) 38%, transparent), color-mix(in srgb, var(--color-green) 12%, transparent) 72%)'
                        : isMine
                          ? 'radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--color-red) 42%, transparent), color-mix(in srgb, var(--color-red) 14%, transparent) 72%)'
                          : 'linear-gradient(160deg, var(--color-panel-2) 0%, var(--color-panel) 100%)',
                      boxShadow: isGem
                        ? '0 0 16px -3px var(--glow-green), inset 0 1px 0 rgba(255,255,255,0.12)'
                        : isHitMine
                          ? '0 0 22px -2px var(--glow-red), inset 0 1px 0 rgba(255,255,255,0.1)'
                          : 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -6px 10px rgba(0,0,0,0.35)',
                      transitionDelay: dim ? `${rippleDelayMs}ms` : '0ms',
                      cursor: active && !revealed ? 'pointer' : 'default',
                    }}
                  >
                    {/* The tile button itself (keyed by index) never unmounts for the
                        whole game — only the icon inside it mounts fresh the instant a
                        tile flips from hidden, and unmounts again on the next `start()`
                        reset. That's the genuine mount/unmount boundary here, not the
                        tile or the grid (Reveal.tsx's own warning against wrapping a
                        persistent container). */}
                    {(isGem || isDimGem) && (
                      <Reveal as="span" preset="scaleIn" duration={0.18} delay={rippleDelayMs / 1000}>
                        <Icon
                          name="gem"
                          size={20}
                          style={{ color: 'var(--color-green)', opacity: isDimGem ? 0.6 : 1 }}
                        />
                      </Reveal>
                    )}
                    {isMine && (
                      <Reveal as="span" preset="scaleIn" duration={0.18} delay={rippleDelayMs / 1000}>
                        <Icon name="bomb" size={20} style={{ color: 'var(--color-red)' }} />
                      </Reveal>
                    )}
                  </button>
                )
              })}
            </div>

            {/* A genuine bust beat, not a silent state flip — a radial red
                flash that decays over the board the instant a mine goes off,
                paired with the grid-level shake above. Remounts fresh on
                every new loss (busted flips false -> true through `start()`
                resetting msgTone), so it replays every time. */}
            {busted && <div className="mines-bust-flash absolute inset-0 rounded-2xl pointer-events-none" />}
          </div>

          <div
            className="win-banner mt-5 text-center text-sm"
            id="minesMsg"
            style={{ color: toneColor }}
          >
            {msg}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
              Number of mines
            </label>
            <select
              ref={mineSelectRef}
              className="input w-full rounded-[10px] border px-3 py-2 text-text outline-none"
              id="mineSelect"
              defaultValue="3"
              disabled={active}
              onChange={(e) => setMineCount(Number(e.target.value))}
              style={{ borderColor: 'var(--glass-line)', background: 'var(--color-panel-2)' }}
            >
              {MINE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} mines
                </option>
              ))}
            </select>
          </div>

          {/* gemsFound is NOT in NUMERIC_CONTRACT_IDS (contractIds.ts) — it's free
              to tween. curMult/nextMult/cashVal ARE (agent-ui.js parses their raw
              textContent mid-round) — AnimatedNumber's own isNumericContractId
              guard writes those three straight to text, never tweens, so passing
              the id through here is exactly the "trust the guard" case the plan
              calls out. Every id lives on the AnimatedNumber/span node itself, not
              also on Stat's wrapper div, so there's exactly one of each in the DOM. */}
          <div className="stat-grid grid grid-cols-2 gap-2">
            <Stat
              k="Gems found"
              v={<AnimatedNumber value={revealedCount} format={(n) => String(n)} id="gemsFound" />}
            />
            <Stat
              k="Multiplier"
              className={pulseHeat ? 'mines-heat-pulse' : ''}
              v={
                <span className="inline-flex items-center gap-1">
                  {heat > 0.55 && <Icon name="flame" size={13} style={{ color: heatColor }} />}
                  <AnimatedNumber
                    value={curMult}
                    format={(n) => `${n.toFixed(2)}×`}
                    id="curMult"
                    style={{
                      color: heatColor,
                      textShadow: heat > 0.3 ? `0 0 ${6 + heat * 10}px color-mix(in srgb, ${heatColor} 70%, transparent)` : 'none',
                    }}
                  />
                </span>
              }
            />
            <Stat
              k="Next tile"
              v={
                active ? (
                  <AnimatedNumber value={nextMult} format={(n) => `${n.toFixed(2)}×`} id="nextMult" />
                ) : (
                  <span id="nextMult">—</span>
                )
              }
            />
            <Stat
              k="Cash out"
              v={
                active ? (
                  <AnimatedNumber value={Math.floor(stake * curMult)} id="cashVal" />
                ) : (
                  <span id="cashVal">—</span>
                )
              }
            />
          </div>

          {/* Risk meter — a thin bar echoing `heat` so the escalating stakes
              have a persistent visual anchor beyond the multiplier text
              itself, à la Keno's hit glow / Wheel's stage glow treatment. */}
          <div
            className="risk-meter mt-3 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--glass-2)' }}
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full transition-[width,background-color] duration-500"
              style={{ width: `${active ? Math.max(4, heatPct) : 0}%`, background: heatColor }}
            />
          </div>

          {/* #startBtn.disabled IS the adapter's round-in-progress signal. */}
          <Button
            id="startBtn"
            variant="green"
            size="lg"
            block
            disabled={active}
            onClick={start}
            className="mt-4"
          >
            Start Game
          </Button>
          <Button
            id="cashBtn"
            variant="gold"
            size="lg"
            block
            disabled={!active || revealedCount === 0}
            onClick={cashOut}
            className="mt-2.5"
          >
            Cash Out
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>

      {/* Scoped keyframes — no shared stylesheet touched, kept local to this
          game per the batch's small-anchored-edits rule for shared files
          (WheelGame.tsx's own precedent for the same convention). */}
      <style>{`
        @keyframes minesGemPop {
          0% { transform: scale(0.9); filter: brightness(1); }
          45% { transform: scale(1.07); filter: brightness(1.35); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .mines-tile-gem-pop { animation: minesGemPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes minesMineHit {
          0%, 100% { transform: translateX(0) scale(1); }
          15% { transform: translateX(-3px) scale(1.05); }
          30% { transform: translateX(3px) scale(1.05); }
          45% { transform: translateX(-2px) scale(1.02); }
          60% { transform: translateX(2px) scale(1.02); }
          75% { transform: translateX(-1px); }
        }
        .mines-tile-mine-hit { animation: minesMineHit 420ms ease-in-out; }
        @keyframes minesBustShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-7px) rotate(-0.5deg); }
          30% { transform: translateX(6px) rotate(0.4deg); }
          45% { transform: translateX(-5px) rotate(-0.35deg); }
          60% { transform: translateX(4px) rotate(0.3deg); }
          75% { transform: translateX(-2px); }
        }
        .mines-bust-shake { animation: minesBustShake 460ms ease-in-out; }
        @keyframes minesBustFlash {
          0% { opacity: 0.55; }
          100% { opacity: 0; }
        }
        .mines-bust-flash {
          animation: minesBustFlash 700ms ease-out forwards;
          background: radial-gradient(circle at 50% 45%, var(--glow-red), transparent 70%);
        }
        @keyframes minesHeatPulse {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50% { box-shadow: 0 0 16px 1px color-mix(in srgb, var(--color-red) 35%, transparent); }
        }
        .mines-heat-pulse { animation: minesHeatPulse 1.15s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .mines-tile-gem-pop, .mines-tile-mine-hit, .mines-bust-shake, .mines-heat-pulse { animation: none; }
          .mines-bust-flash { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
