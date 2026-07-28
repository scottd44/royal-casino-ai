import { useRef, useState } from 'react'
import { Gem, Bomb } from 'lucide-react'
import { GameLayout, Panel, PageHead, Stat, Button } from '../../components/Panel'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money, randInt, pick } from '@/platform/money/format'

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

  function endLoss(hitIdx: number) {
    activeRef.current = false
    setActive(false)
    revealAll(hitIdx)
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

  return (
    <div>
      <PageHead
        title="Mines"
        sub="Uncover gems to grow your multiplier. Hit a mine and you lose the bet."
      />

      <GameLayout>
        <Panel>
          <div className="mines-grid grid grid-cols-5 gap-2" id="grid">
            {tiles.map((st, i) => {
              const revealed = st !== 'hidden'
              const isGem = st === 'gem'
              const isMine = st === 'mine' || st === 'dim-mine'
              const dim = st === 'dim-gem' || st === 'dim-mine'
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
                    'tile aspect-square rounded-[10px] border flex items-center justify-center transition-all',
                    revealed ? 'revealed' : '',
                    isGem ? 'gem' : '',
                    isMine ? 'mine' : '',
                    dim ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    borderColor: 'var(--glass-line)',
                    background: isGem
                      ? 'color-mix(in srgb, var(--color-green) 18%, transparent)'
                      : isMine
                        ? 'color-mix(in srgb, var(--color-red) 18%, transparent)'
                        : 'var(--glass-2)',
                    cursor: active && !revealed ? 'pointer' : 'default',
                  }}
                >
                  {isGem && <Gem size={20} style={{ color: 'var(--color-green)' }} />}
                  {isMine && <Bomb size={20} style={{ color: 'var(--color-red)' }} />}
                </button>
              )
            })}
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

          <div className="stat-grid grid grid-cols-2 gap-2">
            <Stat k="Gems found" v={revealedCount} id="gemsFound" />
            <Stat k="Multiplier" v={`${curMult.toFixed(2)}×`} id="curMult" />
            <Stat k="Next tile" v={active ? `${nextMult.toFixed(2)}×` : '—'} id="nextMult" />
            <Stat
              k="Cash out"
              v={active ? fmt(Math.floor(stake * curMult)) : '—'}
              id="cashVal"
            />
          </div>

          {/* #startBtn.disabled IS the adapter's round-in-progress signal. */}
          <Button
            id="startBtn"
            disabled={active}
            onClick={start}
            className="btn-block btn-green w-full mt-4 text-base py-3.5 text-bg-0 font-semibold"
            style={{ background: 'var(--color-green)' }}
          >
            Start Game
          </Button>
          <Button
            id="cashBtn"
            disabled={!active || revealedCount === 0}
            onClick={cashOut}
            className="btn-block w-full mt-2.5 text-base py-3.5 text-bg-0 font-semibold"
            style={{ background: 'var(--color-gold)' }}
          >
            Cash Out
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
