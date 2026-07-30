import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/platform/icons'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import { TileGrid } from '../../components/TileGrid'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { battleshipSounds } from './sounds'

/* ============================================================
   Battleship — ported from js/games/battleship.js.

   AGENT CONTRACT (agent-ui.js:1233):
     detect()  #bsDeal + #bsGrid
     play()    applyBet() -> #betInput, clicks #bsDeal to deploy, then loops
               `while (API.inRound() && API.shotsLeft() > 0)` calling
               `API.suggest()` (the hunt/target AI -> {r,c} or null) and
               `API.fire(r,c)` — it NEVER clicks grid cells directly — then
               `API.cashOut()` if still in round, and finally reads
               #bsStatus for the result text.

   window.BattleshipAPI is therefore the adapter's ENTIRE view of this
   game — grid cell markup itself carries no agent contract (confirmed:
   the adapter only ever calls the API, never inspects a `.bs-cell`
   class), so cell styling below is free-form. The API is registered from
   an effect and REMOVED on unmount, mirroring HoldemGame.tsx:221-280 —
   a stale window.BattleshipAPI would make battleship.detect() return true
   on another route, and the agent would sit there firing into a dead board.

   BOARD SIZE NOTE: the adapter's own rules string ("...hidden fleet on a
   6×6 sea...", agent-ui.js:1240) and its local `COLS = "ABCDEF"` constant
   are cosmetic only — the actual legacy engine this game must be faithful
   to (js/games/battleship.js:19-33) places the fleet on a 5×5 sea
   (`const N = 5`, `const COLS = "ABCDE"`). Ported to match the real
   engine; the adapter only ever indexes `COLS[mv.c]` for a status string,
   so its 6-letter constant strung over 5 real columns never breaks it.
   ============================================================ */

const N = 5
const COLS = 'ABCDE'

type ShipDef = { name: string; size: number; sink: number }
const FLEET: ShipDef[] = [
  { name: 'Carrier', size: 4, sink: 3.8 },
  { name: 'Battleship', size: 3, sink: 1.25 },
  { name: 'Destroyer', size: 2, sink: 0.48 },
  { name: 'Patrol Boat', size: 1, sink: 0.24 },
]
const TOTAL_TILES = FLEET.reduce((a, f) => a + f.size, 0) // 10
const BASE = 0.045 // per ship piece hit
const GRAND = 100 // sink the whole fleet — only reachable by buying extra shots
const SHOTS = 5 // included with the bet
const EDGE = 0.05 // house edge baked into bought shots

const inBounds = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const key = (r: number, c: number) => `${r},${c}`

/* ---------- seedable RNG + hash (provably-fair-style), ported verbatim
   from battleship.js:38-47 ---------- */
function xmur3(str: string) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const seedHash = (s: string) => xmur3(s)().toString(16).padStart(8, '0')
const randSeed = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)

/* ---------- fleet placement from any RNG, ported verbatim from
   battleship.js:50-67 ---------- */
type Ship = { name: string; size: number; sink: number; cells: [number, number][]; hit: number; sunk: boolean }
type Board = { occ: Map<string, number>; ships: Ship[] }

function placeFleet(rng: () => number): Board {
  const occ = new Map<string, number>()
  const ships: Ship[] = FLEET.map((f) => ({
    name: f.name,
    size: f.size,
    sink: f.sink,
    cells: [],
    hit: 0,
    sunk: false,
  }))
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i].size
    for (let g = 0; g < 3000; g++) {
      const horiz = rng() < 0.5
      const r = Math.floor(rng() * (horiz ? N : N - s + 1))
      const c = Math.floor(rng() * (horiz ? N - s + 1 : N))
      const cells: [number, number][] = []
      let ok = true
      for (let k = 0; k < s; k++) {
        const rr = horiz ? r : r + k
        const cc = horiz ? c + k : c
        if (occ.has(key(rr, cc))) {
          ok = false
          break
        }
        cells.push([rr, cc])
      }
      if (!ok) continue
      cells.forEach(([rr, cc]) => occ.set(key(rr, cc), i))
      ships[i].cells = cells
      break
    }
  }
  return { occ, ships }
}
const deriveBoard = (server: string, client: string, nonce: number): Board =>
  placeFleet(mulberry32(xmur3(`${server}:${client}:${nonce}`)()))

/* ---------- hunt/target auto-player — this IS window.BattleshipAPI's
   suggest(), ported verbatim from battleship.js:71-86. shots grid values:
   0 unknown · 1 miss · 2 hit · 3 sunk. ---------- */
type Shots = number[][]

function bestShot(shots: Shots): { r: number; c: number } | null {
  const hits: [number, number][] = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (shots[r][c] === 2) hits.push([r, c])

  if (hits.length) {
    if (hits.length >= 2) {
      const byRow: Record<number, number[]> = {}
      const byCol: Record<number, number[]> = {}
      hits.forEach(([r, c]) => {
        ;(byRow[r] = byRow[r] || []).push(c)
        ;(byCol[c] = byCol[c] || []).push(r)
      })
      for (const rk in byRow) {
        if (byRow[rk].length >= 2) {
          const cs = [...byRow[rk]].sort((a, b) => a - b)
          const rr = Number(rk)
          for (const cc of [cs[0] - 1, cs[cs.length - 1] + 1]) {
            if (inBounds(rr, cc) && shots[rr][cc] === 0) return { r: rr, c: cc }
          }
        }
      }
      for (const ck in byCol) {
        if (byCol[ck].length >= 2) {
          const rs = [...byCol[ck]].sort((a, b) => a - b)
          const cc = Number(ck)
          for (const rr of [rs[0] - 1, rs[rs.length - 1] + 1]) {
            if (inBounds(rr, cc) && shots[rr][cc] === 0) return { r: rr, c: cc }
          }
        }
      }
    }
    for (const [r, c] of hits) {
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const rr = r + dr
        const cc = c + dc
        if (inBounds(rr, cc) && shots[rr][cc] === 0) return { r: rr, c: cc }
      }
    }
  }

  const any: [number, number][] = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (shots[r][c] === 0) any.push([r, c])
  if (!any.length) return null
  const [r, c] = any[Math.floor(Math.random() * any.length)]
  return { r, c }
}

/* ----- buy-shot pricing: Monte-Carlo over boards consistent with what's
   revealed so far, ported verbatim from battleship.js:249-289 ----- */
function priceExtraShot(board: Board | null, shots: Shots | null, bet: number): number {
  if (!board || !shots) return 0
  const known: ('water' | 'ship' | 'unknown')[][] = []
  let revealedShip = 0
  for (let r = 0; r < N; r++) {
    known[r] = []
    for (let c = 0; c < N; c++) {
      const s = shots[r][c]
      known[r][c] = s === 1 ? 'water' : s === 2 || s === 3 ? 'ship' : 'unknown'
      if (s === 2 || s === 3) revealedShip++
    }
  }

  const sums: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  let count = 0
  let attempts = 0
  while (count < 500 && attempts < 6000) {
    attempts++
    const sample = placeFleet(Math.random)
    // Consistency: water tiles must be empty in the sample, revealed-ship
    // tiles must be occupied — only samples matching what's already known
    // count toward the average.
    let ok = true
    for (let r = 0; r < N && ok; r++) {
      for (let c = 0; c < N; c++) {
        const occ = sample.occ.has(key(r, c))
        if (known[r][c] === 'water' && occ) {
          ok = false
          break
        }
        if (known[r][c] === 'ship' && !occ) {
          ok = false
          break
        }
      }
    }
    if (!ok) continue
    count++
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (known[r][c] !== 'unknown') continue
        if (!sample.occ.has(key(r, c))) continue // firing here misses in this sample -> 0
        let val = BASE
        const ship = sample.ships[sample.occ.get(key(r, c))!]
        // Completes the ship if all its OTHER cells are already revealed.
        const othersRevealed = ship.cells.every(([rr, cc]) => (rr === r && cc === c) || known[rr][cc] === 'ship')
        if (othersRevealed) {
          val += ship.sink
          if (revealedShip + 1 === TOTAL_TILES) val += GRAND
        }
        sums[r][c] += val
      }
    }
  }

  let bestEV = 0
  if (count >= 20) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) bestEV = Math.max(bestEV, sums[r][c] / count)
  } else {
    bestEV = BASE + FLEET[0].sink // couldn't sample -- price conservatively high (Carrier's own sink bonus)
  }
  return Math.max(Math.ceil(bet * 0.05), Math.round(bet * bestEV * (1 + EDGE)))
}

type Phase = 'idle' | 'playing' | 'over'
type Tone = 'idle' | 'live' | 'win' | 'lose'
type CellState = 'empty' | 'miss' | 'hit' | 'sunk' | 'reveal'
type Cell = { r: number; c: number; state: CellState }

export default function BattleshipGame() {
  const betRef = useBetRef()

  // All mutable round truth lives in refs — window.BattleshipAPI.fire()/
  // suggest() must resolve synchronously against the CURRENT board/shots,
  // and the adapter's play() loop drives this far faster than a
  // state-driven re-render would settle (same reasoning as
  // HoldemGame.tsx:55-58). `repaint` asks React to re-read the refs.
  const boardRef = useRef<Board | null>(null)
  const shotsRef = useRef<Shots | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const stakeRef = useRef(0)
  const multRef = useRef(0)
  const shotsLeftRef = useRef(0)
  const sunkCountRef = useRef(0)
  const shotPriceRef = useRef(0)
  const serverRef = useRef(randSeed())
  const clientRef = useRef(randSeed())
  const nonceRef = useRef(1)
  const logRef = useRef<string[]>([])
  const statusRef = useRef<{ msg: string; tone: Tone }>({
    msg: 'Place a bet and open fire.',
    tone: 'idle',
  })

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  // Newest first, capped at 7 lines — mirrors battleship.js:190-196's
  // `el.prepend(line)` + trim.
  const log = useCallback((line: string) => {
    logRef.current = [line, ...logRef.current].slice(0, 7)
  }, [])

  const setStatus = useCallback((msg: string, tone: Tone) => {
    statusRef.current = { msg, tone }
  }, [])

  const priceNow = useCallback(() => priceExtraShot(boardRef.current, shotsRef.current, stakeRef.current), [])

  const cashOut = useCallback(
    (auto = false) => {
      if (phaseRef.current !== 'playing') return
      const bet = stakeRef.current
      const mult = multRef.current
      const ret = Math.round(bet * mult)
      phaseRef.current = 'over'
      if (ret > 0) payout(ret)
      const net = ret - bet
      if (ret > 0) {
        setStatus(
          `Cashed out ${mult.toFixed(2)}× — ${net >= 0 ? '+' + fmt(net) : '-' + fmt(-net)}.`,
          net >= 0 ? 'win' : 'lose',
        )
      } else {
        setStatus(`No hits — lost ${money(bet)}.`, 'lose')
      }
      log(`Cashed out ${mult.toFixed(2)}× = ${money(ret)} (net ${net >= 0 ? '+' : ''}${fmt(net)}).`)
      if (!auto) {
        if (net > 0) battleshipSounds.win()
        else battleshipSounds.lose()
      }
      nonceRef.current++
      repaint()
    },
    [log, payout, repaint, setStatus],
  )

  const fire = useCallback(
    (r: number, c: number) => {
      const board = boardRef.current
      const shots = shotsRef.current
      if (phaseRef.current !== 'playing' || shotsLeftRef.current <= 0 || !board || !shots) return
      if (shots[r][c] !== 0) return

      shotsLeftRef.current--
      const occIdx = board.occ.get(key(r, c))
      if (occIdx !== undefined) {
        shots[r][c] = 2
        multRef.current += BASE
        const ship = board.ships[occIdx]
        ship.hit++
        if (ship.hit === ship.size) {
          ship.sunk = true
          sunkCountRef.current++
          multRef.current += ship.sink
          ship.cells.forEach(([rr, cc]) => (shots[rr][cc] = 3))
          log(`Sank the ${ship.name}! +${ship.sink}× (${COLS[c]}${r + 1})`)
          battleshipSounds.cashout()
          if (sunkCountRef.current === FLEET.length) {
            multRef.current += GRAND
            log(`WHOLE FLEET SUNK! +${GRAND}× GRAND JACKPOT!`)
            battleshipSounds.bigwin()
            cashOut(true) // banks the jackpot immediately, same as battleship.js:322
            return
          }
        } else {
          log(`Hit at ${COLS[c]}${r + 1} +${BASE}×`)
          battleshipSounds.tick()
        }
      } else {
        shots[r][c] = 1
        log(`Miss at ${COLS[c]}${r + 1}.`)
      }

      if (shotsLeftRef.current === 0) {
        shotPriceRef.current = priceNow()
        setStatus('Out of shots — buy another or cash out.', 'live')
      } else {
        setStatus(
          `Multiplier ${multRef.current.toFixed(2)}× — ${shotsLeftRef.current} shot${
            shotsLeftRef.current === 1 ? '' : 's'
          } left.`,
          'live',
        )
      }
      repaint()
    },
    [cashOut, log, priceNow, repaint, setStatus],
  )

  const deal = useCallback(() => {
    if (phaseRef.current === 'playing') return
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      setStatus('Not enough cash for that bet.', 'lose')
      repaint()
      return
    }

    serverRef.current = randSeed()
    boardRef.current = deriveBoard(serverRef.current, clientRef.current, nonceRef.current)
    shotsRef.current = Array.from({ length: N }, () => new Array(N).fill(0))
    stakeRef.current = bet
    multRef.current = 0
    sunkCountRef.current = 0
    shotsLeftRef.current = SHOTS
    shotPriceRef.current = 0
    phaseRef.current = 'playing'
    logRef.current = []

    setStatus(`Fire! ${SHOTS} shots loaded — hit pieces, sink ships.`, 'live')
    log(`Bet ${money(bet)} — ${SHOTS} shots loaded. Round #${nonceRef.current}.`)
    battleshipSounds.tick()
    repaint()
    // betRef is a stable ref object — deliberately excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, placeBet, repaint, setStatus])

  const buyShot = useCallback(() => {
    if (phaseRef.current !== 'playing' || shotsLeftRef.current > 0) return
    const price = shotPriceRef.current || priceNow()
    if (!placeBet(price)) {
      setStatus('Not enough cash for another shot.', 'lose')
      repaint()
      return
    }
    shotsLeftRef.current++
    log(`Bought a shot for ${money(price)}.`)
    battleshipSounds.tick()
    setStatus('Extra shot loaded — make it count.', 'live')
    repaint()
  }, [log, placeBet, priceNow, repaint, setStatus])

  /* ---------------- window.BattleshipAPI ----------------
     agent-ui.js:1233's ENTIRE view of this game. Registered on mount,
     REMOVED on unmount (mirrors HoldemGame.tsx:221-280) so a stale API can
     never make battleship.detect() return true on another route. */
  useEffect(() => {
    const api = {
      inRound: () => phaseRef.current === 'playing',
      over: () => phaseRef.current !== 'playing',
      shotsLeft: () => shotsLeftRef.current,
      mult: () => multRef.current,
      suggest: (): { r: number; c: number } | null => {
        const shots = shotsRef.current
        const board = boardRef.current
        if (phaseRef.current !== 'playing' || !shots || !board) return null

        // The rig (legacy: Casino.cheat.isOn()'s x-ray branch,
        // battleship.js:373-381) finishes the most-wounded / largest ship
        // first so its sink bonus lands. Ported onto this codebase's own
        // per-call cheatWin() convention (walletStore.ts) instead of a
        // standing "x-ray on" toggle — every other ported game's rig
        // (Mines/Tower/Dice/RPS/Coinflip/Holdem) checks cheatWin() at the
        // moment of the decision, not a persistent flag, and Battleship's
        // board can't be silently moved after deploy() without breaking
        // its own provably-fair claim, so biasing the SUGGESTION is the
        // only rig surface available here, same as the legacy game.
        if (cheatWin()) {
          let target: Ship | null = null
          let bestScore = -1
          for (const ship of board.ships) {
            if (ship.sunk) continue
            const score = ship.hit * 10 + ship.size // finish wounded ships first, else start the largest
            if (score > bestScore) {
              bestScore = score
              target = ship
            }
          }
          if (target) {
            for (const [r, c] of target.cells) {
              if (shots[r][c] === 0) return { r, c }
            }
          }
        }
        return bestShot(shots)
      },
      fire: (r: number, c: number) => fire(r, c),
      buyPrice: () => priceNow(),
      buyShot: () => buyShot(),
      cashOut: () => cashOut(false),
      deploy: () => deal(),
    }

    ;(window as unknown as { BattleshipAPI: typeof api }).BattleshipAPI = api

    return () => {
      delete (window as unknown as { BattleshipAPI?: typeof api }).BattleshipAPI
    }
  }, [buyShot, cashOut, deal, fire, priceNow])

  /* ---------------- render ---------------- */
  const board = boardRef.current
  const shots = shotsRef.current
  const phase = phaseRef.current
  const status = statusRef.current
  const shotsLeft = shotsLeftRef.current
  const mult = multRef.current
  const stake = stakeRef.current
  const buyPrice = shotPriceRef.current

  const cells: Cell[] = Array.from({ length: N * N }, (_, i) => {
    const r = Math.floor(i / N)
    const c = i % N
    const s = shots ? shots[r][c] : 0
    const isShip = board?.occ.has(key(r, c)) ?? false
    let state: CellState = 'empty'
    if (s === 1) state = 'miss'
    else if (s === 2) state = 'hit'
    else if (s === 3) state = 'sunk'
    else if (phase === 'over' && isShip) state = 'reveal' // ghost the ships that were never found, closure for the round
    return { r, c, state }
  })

  const canBuy = phase === 'playing' && shotsLeft === 0
  const canCash = phase === 'playing'
  const cashVal = phase === 'playing' && stake ? Math.round(stake * mult) : 0

  const toneColor: Record<Tone, string> = {
    idle: 'var(--color-muted)',
    live: 'var(--color-gold-2)',
    win: 'var(--color-green)',
    lose: 'var(--color-red)',
  }

  return (
    <div>
      <PageHead
        title="Battleship"
        sub={`Your bet buys ${SHOTS} shots at a hidden fleet. Hit pieces to build a multiplier, sink ships for big bonuses, and sink the whole fleet for the ${GRAND}× jackpot. No bust — cash out any time.`}
        icon="ship"
      />

      <GameLayout>
        <Panel>
          <div className="mx-auto max-w-[420px]">
            <TileGrid
              id="bsGrid"
              tiles={cells}
              cols={N}
              onTileClick={(i) => fire(cells[i].r, cells[i].c)}
              disabled={(tile) => phase !== 'playing' || tile.state !== 'empty'}
              tileClassName={(tile) => {
                switch (tile.state) {
                  case 'miss':
                    return 'bs-miss bg-glass-2 border-glass-line'
                  case 'hit':
                    return 'bs-hit bg-red/15 border-red/40'
                  case 'sunk':
                    return 'bs-sunk bg-gold/15 border-gold/40'
                  case 'reveal':
                    return 'bs-reveal opacity-30 border-glass-line'
                  default:
                    return 'bs-empty border-glass-line hover:bg-glass-2'
                }
              }}
              renderTile={(tile) => {
                // The tile <button> (owned by TileGrid) never unmounts —
                // only the icon inside mounts fresh the instant a cell
                // resolves, and unmounts again when the next deal() resets
                // it back to 'empty'. Same rule Mines/Tower's own tiles
                // follow (MinesGame.tsx:222-227).
                if (tile.state === 'miss') {
                  return (
                    <Reveal as="span" preset="scaleIn" duration={0.16}>
                      <Icon name="x" size={14} style={{ color: 'var(--color-muted)' }} />
                    </Reveal>
                  )
                }
                if (tile.state === 'hit') {
                  return (
                    <Reveal as="span" preset="scaleIn" duration={0.2}>
                      <Icon name="crosshair" size={18} style={{ color: 'var(--color-red)' }} />
                    </Reveal>
                  )
                }
                if (tile.state === 'sunk') {
                  return (
                    <Reveal as="span" preset="scaleIn" duration={0.2}>
                      <Icon name="crosshair" size={18} style={{ color: 'var(--color-gold)' }} />
                    </Reveal>
                  )
                }
                if (tile.state === 'reveal') {
                  return <Icon name="ship" size={14} style={{ color: 'var(--color-muted)' }} />
                }
                return null
              }}
            />
          </div>

          <div className="mt-4 text-center text-sm" id="bsStatus" style={{ color: toneColor[status.tone] }}>
            {status.msg}
          </div>

          {board && (
            <div className="mt-4 grid gap-1.5">
              {board.ships.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between text-xs rounded-[8px] border px-2.5 py-1.5"
                  style={{
                    borderColor: 'var(--glass-line)',
                    background: s.sunk
                      ? 'color-mix(in srgb, var(--color-gold) 14%, transparent)'
                      : s.hit > 0
                        ? 'color-mix(in srgb, var(--color-red) 12%, transparent)'
                        : 'var(--glass)',
                  }}
                >
                  <span className="text-muted">{s.name}</span>
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: s.size }, (_, i) => (
                      <Icon key={i} name="square" size={7} style={{ color: 'var(--color-text)' }} />
                    ))}
                  </span>
                  <span className="text-gold num">+{s.sink}×</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} defaultValue={25} />

          <Button
            id="bsDeal"
            variant="green"
            size="lg"
            block
            disabled={phase === 'playing'}
            onClick={deal}
            className="mt-1 inline-flex items-center justify-center gap-2"
          >
            <Icon name="crosshair" size={16} /> Open Fire ({SHOTS} shots)
          </Button>

          {phase === 'playing' && (
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <Button id="bsBuy" variant="blue" disabled={!canBuy} onClick={buyShot}>
                {canBuy ? `Buy Shot (${money(buyPrice)})` : 'Buy Shot'}
              </Button>
              <Button id="bsCash" variant="gold" disabled={!canCash} onClick={() => cashOut(false)}>
                Cash Out
              </Button>
            </div>
          )}

          <div className="stat-grid grid grid-cols-2 gap-2 mt-4">
            <Stat k="Multiplier" v={`${mult.toFixed(2)}×`} />
            <Stat k="Shots left" v={phase === 'playing' ? String(shotsLeft) : '—'} />
            <Stat k="Cash out" v={phase === 'playing' && stake ? money(cashVal) : '—'} />
            <Stat k="Next shot" v={phase === 'playing' ? (shotsLeft === 0 ? money(buyPrice) : 'free') : '—'} />
          </div>

          <div className="mt-4 text-[11px] text-faint leading-relaxed">
            {phase === 'over' && board ? (
              <>
                <b className="text-text">Round #{nonceRef.current} verified.</b> Server seed{' '}
                <code>{serverRef.current}</code> · client <code>{clientRef.current}</code> · hash{' '}
                <code>{seedHash(serverRef.current)}</code>
              </>
            ) : (
              <>
                Provably fair · committed hash <code>{seedHash(serverRef.current)}</code> · client{' '}
                <code>{clientRef.current}</code> · nonce {nonceRef.current}
              </>
            )}
          </div>

          <div className="mt-3 text-xs text-faint max-h-32 overflow-y-auto space-y-0.5">
            {logRef.current.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}
