import { useRef, useState } from 'react'
import { Icon } from '@/platform/icons'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { AnimatedNumber, Reveal } from '@/platform/motion'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money, randInt, pick } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { sound } from '@/platform/audio/soundStore'

/* ============================================================
   Tower — ported from js/games/tower.js.

   AGENT CONTRACT (agent-ui.js:857) — every one of these is load-bearing:

     detect()   #towerGrid + #towerStart
     setup      writes #diffSelect RAW with no event (same uncontrolled
                pattern as Mines' #mineSelect — see BetField.tsx/
                MinesGame.tsx), then applyBet, then clicks #towerStart
     loop gate  `while ($("#towerStart").disabled && !ctx.shouldStop()
                 && guard++ < 12)` -> #towerStart MUST stay disabled for
                the whole live round or the agent climbs zero rows
     reads      #towerGrid .tower-row.active   (the ONE row currently
                                                 climbable — querySelector
                                                 returns the first match,
                                                 so at most one row may
                                                 ever carry `.active`)
                that row's .tile elements       (index order == render
                                                 order; the adapter clicks
                                                 tiles[idx] by array
                                                 position within the active
                                                 row, not by data-col)
                .tile.revealed                  (to compute which columns
                                                 are still pickable)
                #rowsClimbed / #curMult / #nextMult textContent
     cashout    clicks #cashBtn (only once #rowsClimbed > 0)
     result     reads #towerMsg

   TileGrid (components/TileGrid.tsx) doesn't fit here: it renders exactly
   one container div per instance with no room for the per-row `.tower-row
   active/locked` classes the adapter's `.tower-row.active` selector needs,
   and Tower is row-GROUPED (only one of eight small rows is ever
   clickable) rather than one flat tile field like Mines. This file hand-
   rolls the row/tile markup instead, but still honors TileGrid's two
   non-negotiable rules by hand: tile order within `.tower-row.active` is
   the contract (array index == DOM position, enforced by mapping each
   row's array in column order with no sort/filter), and the tile
   `<button>` itself never unmounts — only the revealed icon inside it
   mounts/unmounts (via `Reveal`, same as Mines' own tiles).
   ============================================================ */

const HOUSE_EDGE = 0.99
const ROWS = 8

type DiffKey = 'easy' | 'medium' | 'hard' | 'expert' | 'master'
interface DiffSpec {
  tiles: number
  safe: number
  label: string
}

const DIFFS: Record<DiffKey, DiffSpec> = {
  easy: { tiles: 4, safe: 3, label: 'Easy' },
  medium: { tiles: 3, safe: 2, label: 'Medium' },
  hard: { tiles: 2, safe: 1, label: 'Hard' },
  expert: { tiles: 3, safe: 1, label: 'Expert' },
  master: { tiles: 4, safe: 1, label: 'Master' },
}
// Insertion order matters for the <select> option list and matches the
// adapter's own `TDIFF`/`DIFFS` key order (agent-ui.js:860-864) — not
// functionally load-bearing, just kept in sync for fidelity.
const DIFF_KEYS = Object.keys(DIFFS) as DiffKey[]

/** Cumulative multiplier after `L` cleared rows — ported verbatim from
 *  js/games/tower.js's `multiplierAfter` (house edge applied once, like
 *  Mines). */
function multiplierAfter(L: number, d: DiffSpec): number {
  if (L <= 0) return 0
  return HOUSE_EDGE * Math.pow(d.tiles / d.safe, L)
}

type CellTruth = 'safe' | 'mine'
type TileState = 'hidden' | 'gem' | 'mine' | 'dim-gem' | 'dim-mine'

/** One mine layout per row, `d.tiles - d.safe` mines scattered per row —
 *  ported from js/games/tower.js's `buildBoard`. */
function buildBoard(d: DiffSpec): CellTruth[][] {
  const b: CellTruth[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: CellTruth[] = Array(d.tiles).fill('safe')
    const mines = d.tiles - d.safe
    const idxs = [...Array(d.tiles).keys()]
    for (let m = 0; m < mines; m++) {
      const idx = idxs.splice(randInt(0, idxs.length - 1), 1)[0]
      row[idx] = 'mine'
    }
    b.push(row)
  }
  return b
}

function buildEmptyDisplay(d: DiffSpec): TileState[][] {
  return Array.from({ length: ROWS }, () => Array(d.tiles).fill('hidden') as TileState[])
}

/** Mirrors js/games/tower.js's `revealRow` dim rule exactly: a mine is dim
 *  unless it IS the hit column; a safe tile is dim only when some OTHER
 *  column was the pick (hitCol defined and it isn't this one). When hitCol
 *  is undefined (closure-reveal of untouched rows on cash-out/loss), every
 *  mine is dim and every safe tile is full-bright — showing where the
 *  safe path would have been without spoiling which one was "the" pick. */
function cellState(truth: CellTruth, c: number, hitCol: number | undefined): TileState {
  if (truth === 'mine') return c !== hitCol ? 'dim-mine' : 'mine'
  return hitCol !== undefined && c !== hitCol ? 'dim-gem' : 'gem'
}

export default function TowerGame() {
  const betRef = useBetRef()
  const diffSelectRef = useRef<HTMLSelectElement>(null)
  // Fixed px tiles (see the comment above the tower-grid div) were sized for
  // desktop — 4 tiles/row at 68px plus gaps overflows a phone-width panel.
  // Shrinking the tile/gap/icon size on narrow viewports keeps the same
  // fixed-size-tile approach (still no per-row stretch) without ever
  // touching the tile markup, ids, or click contract.
  const isMobile = useIsMobile()
  const tileSize = isMobile ? 52 : 68
  const tileGap = isMobile ? 6 : 10
  const tileIconSize = isMobile ? 20 : 24

  const [diff, setDiff] = useState<DiffKey>('easy')
  const [tileDisplay, setTileDisplay] = useState<TileState[][]>(() => buildEmptyDisplay(DIFFS.easy))
  const [active, setActive] = useState(false)
  const [cleared, setCleared] = useState(0)
  const [stake, setStake] = useState(0)
  const [msg, setMsg] = useState('Choose difficulty and press Start.')
  const [msgTone, setMsgTone] = useState<'idle' | 'win' | 'lose' | 'live'>('idle')

  // Truth lives in refs, same reasoning as Mines: onTile must resolve
  // synchronously against the CURRENT board/cleared-row count, and the
  // agent's click loop fires far faster than a state-driven re-render
  // would settle (agent-ui.js:889's `while (...disabled...)` loop has no
  // await between reading `cols` and clicking the next tile).
  const boardRef = useRef<CellTruth[][]>([])
  const clearedRef = useRef(0)
  const activeRef = useRef(false)
  const stakeRef = useRef(0)
  const diffRef = useRef<DiffKey>('easy')

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const d = DIFFS[diff]
  const curMultDisplay = cleared === 0 ? 1 : multiplierAfter(cleared, d)
  const nextMult = multiplierAfter(cleared + 1, d)
  const cashVal = active && cleared > 0 ? Math.floor(stake * multiplierAfter(cleared, d)) : null

  function revealRow(r: number, hitCol: number | undefined) {
    const row = boardRef.current[r]
    setTileDisplay((prev) => {
      const next = prev.slice()
      next[r] = row.map((truth, c) => cellState(truth, c, hitCol))
      return next
    })
  }

  function endLoss(r: number, hitCol: number) {
    activeRef.current = false
    setActive(false)
    for (let i = r; i < ROWS; i++) revealRow(i, i === r ? hitCol : undefined)
    sound.play('lose')
    setMsg(`Mine on row ${r + 1}! Lost ${money(stakeRef.current)}.`)
    setMsgTone('lose')
  }

  function finishWin() {
    const spec = DIFFS[diffRef.current]
    const mult = multiplierAfter(ROWS, spec)
    const winnings = Math.floor(stakeRef.current * mult)
    payout(winnings)
    activeRef.current = false
    setActive(false)
    sound.play('bigwin')
    setMsg(`Reached the top! ${mult.toFixed(2)}× — +${fmt(winnings - stakeRef.current)}!`)
    setMsgTone('win')
  }

  function onTile(r: number, c: number) {
    if (!activeRef.current || r !== clearedRef.current) return
    const board = boardRef.current

    // Rigged odds: if this tile is a mine, quietly swap it for a safe tile
    // elsewhere in the same row — ported from tower.js's onTile cheat hook.
    if (board[r][c] === 'mine' && cheatWin()) {
      const safeCols: number[] = []
      for (let k = 0; k < board[r].length; k++) if (board[r][k] === 'safe') safeCols.push(k)
      if (safeCols.length) {
        board[r][c] = 'safe'
        board[r][pick(safeCols)] = 'mine'
      }
    }

    if (board[r][c] === 'mine') {
      endLoss(r, c)
      return
    }

    // Safe — reveal this row, climb. `clearedRef` advances synchronously so
    // a second click landing before React re-renders still fails the
    // `r !== clearedRef.current` guard above (same trick Mines' own
    // `revealedRef` mutation relies on).
    revealRow(r, c)
    sound.play('tick')
    clearedRef.current += 1
    setCleared(clearedRef.current)
    if (clearedRef.current === ROWS) {
      finishWin()
      return
    }
    setMsg(`Row ${clearedRef.current} cleared — keep climbing or cash out.`)
    setMsgTone('live')
  }

  function start() {
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      setMsg('Not enough cash for that bet.')
      setMsgTone('lose')
      return
    }

    // Read the select from the DOM, not state: the agent writes it raw
    // with no event (agent-ui.js:882), so state may not have heard about it.
    const chosen = (diffSelectRef.current?.value as DiffKey) || 'easy'
    const spec = DIFFS[chosen]

    boardRef.current = buildBoard(spec)
    clearedRef.current = 0
    activeRef.current = true
    stakeRef.current = bet
    diffRef.current = chosen

    setDiff(chosen)
    setStake(bet)
    setCleared(0)
    setActive(true)
    setTileDisplay(buildEmptyDisplay(spec))
    setMsg('Pick a tile on the bottom row…')
    setMsgTone('live')
  }

  function cashOut() {
    // #cashBtn is disabled whenever `!active || cleared === 0`, so this is
    // unreachable through the UI — kept as a defensive guard only, mirroring
    // tower.js's own belt-and-braces check in `cashOut()`.
    if (!activeRef.current || clearedRef.current === 0) return

    const spec = DIFFS[diffRef.current]
    const mult = multiplierAfter(clearedRef.current, spec)
    const winnings = Math.floor(stakeRef.current * mult)
    payout(winnings)
    activeRef.current = false
    setActive(false)
    sound.play(mult >= 5 ? 'bigwin' : 'cashout')
    // Reveal remaining rows for closure — same as tower.js's cashOut().
    for (let i = clearedRef.current; i < ROWS; i++) revealRow(i, undefined)
    setMsg(`Cashed out ${mult.toFixed(2)}× — +${fmt(winnings - stakeRef.current)} profit!`)
    setMsgTone('win')
  }

  const toneColor =
    msgTone === 'win'
      ? 'var(--color-green)'
      : msgTone === 'lose'
        ? 'var(--color-red)'
        : msgTone === 'live'
          ? 'var(--color-gold-2)'
          : 'var(--color-muted)'

  // Render order: row ROWS-1 (top of the tower) first, row 0 (bottom, first
  // climbed) last — ported from tower.js's buildGrid() `for (r = ROWS-1;
  // r >= 0; r--)` loop, so the DOM's visual top-to-bottom order matches.
  const rowOrder = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i)

  return (
    <div>
      <PageHead
        title="Tower"
        sub="Climb from the bottom. Pick a safe tile on each row to rise and grow your multiplier — one mine ends the run. Cash out any time."
        icon="layers"
      />

      <GameLayout>
        <Panel>
          {/* Fixed-size, centered tiles — a bare `flex-1 aspect-square` tile
              stretches to fill the row's own available width, so a row with
              FEWER tiles (hard/expert/master, which have 2-3 tiles/row
              instead of easy's 4) renders each tile LARGER, not smaller,
              blowing the whole 8-row tower's height well past a normal
              viewport. Pinning tile size in px keeps every row (and every
              difficulty) the same tower height, matching Mines' own
              `maxWidth`-cap pattern in spirit — just applied to tile size
              instead of grid width, since Tower is row-grouped rather than
              one flat field. */}
          <div
            className="tower-grid flex flex-col mx-auto"
            id="towerGrid"
            style={{ maxWidth: 420, gap: tileGap }}
          >
            {rowOrder.map((r) => {
              const isActiveRow = active && r === cleared
              const isLocked = active && r > cleared
              return (
                <div
                  key={r}
                  data-row={r}
                  className={[
                    'tower-row flex justify-center',
                    isActiveRow ? 'active' : '',
                    isLocked ? 'locked opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ gap: tileGap }}
                >
                  {tileDisplay[r].map((st, c) => {
                    const revealed = st !== 'hidden'
                    const isGem = st === 'gem' || st === 'dim-gem'
                    const isMine = st === 'mine' || st === 'dim-mine'
                    const dim = st === 'dim-gem' || st === 'dim-mine'
                    return (
                      <button
                        key={c}
                        type="button"
                        data-row={r}
                        data-col={c}
                        disabled={!isActiveRow || revealed}
                        onClick={() => onTile(r, c)}
                        /* `.revealed` isn't read by the adapter directly (it
                           infers "still pickable" from the ABSENCE of
                           `.revealed`), but it's kept for parity with
                           tower.js and for the dom-contract test's own
                           structural assertions. The tile <button> itself
                           never unmounts across a round — only the Reveal-
                           wrapped icon inside mounts/unmounts fresh, same
                           rule as Mines' `.tile`. */
                        className={[
                          'tile tower-tile aspect-square rounded-[10px] border flex items-center justify-center transition-all shrink-0',
                          revealed ? 'revealed' : '',
                          isGem ? 'gem' : '',
                          isMine ? 'mine' : '',
                          dim ? 'opacity-40' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          width: tileSize,
                          height: tileSize,
                          borderColor: 'var(--glass-line)',
                          background: isGem
                            ? 'color-mix(in srgb, var(--color-green) 18%, transparent)'
                            : isMine
                              ? 'color-mix(in srgb, var(--color-red) 18%, transparent)'
                              : 'var(--glass-2)',
                          cursor: isActiveRow && !revealed ? 'pointer' : 'default',
                        }}
                      >
                        {isGem && (
                          <Reveal as="span" preset="scaleIn" duration={0.18}>
                            <Icon name="gem" size={tileIconSize} style={{ color: 'var(--color-green)' }} />
                          </Reveal>
                        )}
                        {isMine && (
                          <Reveal as="span" preset="scaleIn" duration={0.18}>
                            <Icon name="bomb" size={tileIconSize} style={{ color: 'var(--color-red)' }} />
                          </Reveal>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="win-banner mt-5 text-center text-sm" id="towerMsg" style={{ color: toneColor }}>
            {msg}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} defaultValue={20} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Difficulty</label>
            <select
              ref={diffSelectRef}
              className="input w-full rounded-[10px] border px-3 py-2 text-text outline-none"
              id="diffSelect"
              defaultValue="easy"
              disabled={active}
              onChange={(e) => {
                const k = e.target.value as DiffKey
                setDiff(k)
                if (!activeRef.current) setTileDisplay(buildEmptyDisplay(DIFFS[k]))
              }}
              style={{ borderColor: 'var(--glass-line)', background: 'var(--color-panel-2)' }}
            >
              {DIFF_KEYS.map((k) => (
                <option key={k} value={k}>
                  {DIFFS[k].label} — {DIFFS[k].safe}/{DIFFS[k].tiles} safe
                </option>
              ))}
            </select>
          </div>

          {/* rowsClimbed/curMult/nextMult ARE in NUMERIC_CONTRACT_IDS
              (contractIds.ts) — agent-ui.js:895,903,904 parse their raw
              textContent mid-round. AnimatedNumber's own isNumericContractId
              guard writes those straight to text, never tweens, so passing
              the id through here is exactly the "trust the guard" case
              PHASE_3_GAMES_PLAN.md/MinesGame.tsx already establish. */}
          <div className="stat-grid grid grid-cols-2 gap-2">
            <Stat
              k="Rows climbed"
              v={<AnimatedNumber value={cleared} format={(n) => String(n)} id="rowsClimbed" />}
            />
            <Stat
              k="Multiplier"
              v={
                <AnimatedNumber
                  value={curMultDisplay}
                  format={(n) => `${n.toFixed(2)}×`}
                  id="curMult"
                  className="multiplier-tag"
                />
              }
            />
            <Stat
              k="Next row"
              v={
                active ? (
                  <AnimatedNumber
                    value={nextMult}
                    format={(n) => `${n.toFixed(2)}×`}
                    id="nextMult"
                    className="multiplier-tag"
                  />
                ) : (
                  <span id="nextMult" className="multiplier-tag">
                    —
                  </span>
                )
              }
            />
            <Stat
              k="Cash out"
              v={
                cashVal !== null ? (
                  <AnimatedNumber value={cashVal} id="cashVal" />
                ) : (
                  <span id="cashVal">—</span>
                )
              }
            />
          </div>

          {/* #towerStart.disabled IS the adapter's round-in-progress signal
              (agent-ui.js:889's loop gate). */}
          <Button id="towerStart" variant="green" size="lg" block disabled={active} onClick={start} className="mt-4">
            Start Game
          </Button>
          <Button
            id="cashBtn"
            variant="gold"
            size="lg"
            block
            disabled={!active || cleared === 0}
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
