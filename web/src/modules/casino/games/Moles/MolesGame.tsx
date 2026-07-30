import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/platform/icons'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal } from '@/platform/motion'
import { TileGrid } from '../../components/TileGrid'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money, randInt } from '@/platform/money/format'
import { molesSounds } from './sounds'

/* ============================================================
   Moles — ported from js/games/moles.js. Whack-a-mole push-your-luck,
   same fair-odds math shape as Mines: 9 holes hide a chosen number of
   MOLES (safe); whacking a trap busts you, whacking a mole grows the
   multiplier, cash out any time.

   AGENT CONTRACT (agent-ui.js:1265) — every one of these is load-bearing:

     detect()   window.MolesAPI + #molGrid
     play()     applyBet() (raw #betInput write, shared shim), then writes
                #molSelect RAW with no event (js/agent/agent-ui.js:1279,
                mirrors #mineSelect's own uncontrolled contract), then
                clicks #molStart directly (NOT window.MolesAPI.start() —
                that member exists on the API for shape-completeness/parity
                with the legacy object but the adapter's own play() never
                calls it; a live round is driven by the button click)
     loop       `while (API.inRound() && API.found() < target && ...)`
                calling `API.whackRandom()` each pass, `API.cashOut()`
                once done
     reads      #molMsg textContent for the final status line

   #molSelect is UNCONTROLLED for the exact reason #mineSelect is in
   MinesGame.tsx: the adapter's raw `.value =` dispatches no event, so a
   controlled <select> would silently keep the default mole count.

   window.MolesAPI is attached on mount and DELETED on unmount, mirroring
   HoldemGame.tsx's window.HoldemAPI pattern exactly (HANDOFF §2b: a stale
   API makes detect() return true on the wrong route).
   ============================================================ */

const HOLES = 9 // 3x3 board
const EDGE = 0.03 // house edge -> RTP 0.97
const DEFAULT_MOLES = 3
const MOLE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

/** Cash-out multiplier after finding k moles, with M moles among HOLES holes.
 *  (1-edge) x C(HOLES,k) / C(M,k) = (1-edge) x product (HOLES-i)/(M-i) */
function multiplier(M: number, k: number): number {
  let m = 1 - EDGE
  for (let i = 0; i < k; i++) m *= (HOLES - i) / (M - i)
  return m
}

/* hidden          -> never whacked, board hasn't been revealed
   mole / trap     -> whacked THIS hole, the true find
   dim-mole        -> round ended, this hole hid a mole the player never
                      whacked (revealAll shows it dim, matching legacy's
                      "done faint" + mol-core)
   dim-empty       -> round ended, this hole was an unwhacked trap (legacy's
                      "done faint" + mol-dot) */
type HoleState = 'hidden' | 'mole' | 'trap' | 'dim-mole' | 'dim-empty'

/** Legacy's own `.mol-hole` / `.done` / `.mole` / `.trap` / `.faint` class
 *  vocabulary (css/styles.css:1114-1178), reproduced verbatim per
 *  PHASE_3_GAMES_PLAN.md §3a's `tileClassName` escape hatch — the actual
 *  paint (border/background/glow/pop-or-shake) rides along as Tailwind
 *  arbitrary-value utilities plus the two local `mol-pop`/`mol-hit-shake`
 *  keyframe classes below, since TileGrid deliberately owns no per-tile
 *  inline style hook (TileGrid.tsx's own doc comment). Material/feedback
 *  treatment mirrors MinesGame.tsx's own tile bevel + reveal-glow bar: a
 *  beveled unrevealed tile, a green glow+pop on a genuine mole find, a red
 *  glow+shake on the trap that busts the round, and a plain faint tint (no
 *  glow, no animation — those are reserved for the FRESH find) for
 *  reveal-all's dim holes. */
function holeClassName(tile: HoleState): string {
  const isFreshMole = tile === 'mole'
  const isFreshTrap = tile === 'trap'
  const isMoleLike = tile === 'mole' || tile === 'dim-mole'
  const dim = tile === 'dim-mole' || tile === 'dim-empty'
  return [
    'mol-hole',
    tile !== 'hidden' ? 'done' : '',
    isFreshMole ? 'mole' : '',
    isFreshTrap ? 'trap' : '',
    dim ? 'faint' : '',
    tile === 'hidden'
      ? [
          'border-[var(--glass-line)]',
          'bg-[linear-gradient(160deg,var(--color-panel-2)_0%,var(--color-panel)_100%)]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-6px_10px_rgba(0,0,0,0.35)]',
          'hover:border-gold-deep hover:-translate-y-0.5 active:scale-90',
        ].join(' ')
      : isFreshMole
        ? [
            'border-[color-mix(in_srgb,var(--color-green)_55%,var(--glass-line))]',
            'bg-[radial-gradient(circle_at_50%_32%,color-mix(in_srgb,var(--color-green)_38%,transparent),color-mix(in_srgb,var(--color-green)_12%,transparent)_72%)]',
            'shadow-[0_0_16px_-3px_var(--glow-green),inset_0_1px_0_rgba(255,255,255,0.12)]',
            'mol-pop',
          ].join(' ')
        : isFreshTrap
          ? [
              'border-[color-mix(in_srgb,var(--color-red)_65%,var(--glass-line))]',
              'bg-[radial-gradient(circle_at_50%_32%,color-mix(in_srgb,var(--color-red)_42%,transparent),color-mix(in_srgb,var(--color-red)_14%,transparent)_72%)]',
              'shadow-[0_0_22px_-2px_var(--glow-red),inset_0_1px_0_rgba(255,255,255,0.1)]',
              'mol-hit-shake',
            ].join(' ')
          : isMoleLike
            ? 'border-[color-mix(in_srgb,var(--color-green)_35%,var(--glass-line))] bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)]'
            : 'border-[var(--glass-line)] bg-[var(--color-panel-2)]',
    dim ? 'opacity-40' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Fresh finds ('mole'/'trap') get the animal/trap glyph at full size and
 *  opacity — reveal-all's dim holes get the same glyph, smaller and faint,
 *  so a busted board still reads as "these were the moles" at a glance
 *  without competing visually with the hole that actually ended the round
 *  (MinesGame.tsx's own dim-gem/dim-mine precedent). */
function renderHole(tile: HoleState) {
  switch (tile) {
    case 'mole':
      return (
        <Reveal as="span" preset="scaleIn" duration={0.18}>
          <Icon name="rabbit" size={22} style={{ color: 'var(--color-green)' }} />
        </Reveal>
      )
    case 'trap':
      return (
        <Reveal as="span" preset="scaleIn" duration={0.18}>
          <Icon name="bomb" size={22} style={{ color: 'var(--color-red)' }} />
        </Reveal>
      )
    case 'dim-mole':
      return (
        <Reveal as="span" preset="scaleIn" duration={0.18}>
          <Icon name="rabbit" size={16} style={{ color: 'var(--color-green)', opacity: 0.7 }} />
        </Reveal>
      )
    case 'dim-empty':
      return (
        <Reveal as="span" preset="scaleIn" duration={0.18}>
          <Icon name="bomb" size={14} style={{ color: 'var(--color-faint)', opacity: 0.5 }} />
        </Reveal>
      )
    default:
      return null
  }
}

export default function MolesGame() {
  const betRef = useBetRef()
  const molSelectRef = useRef<HTMLSelectElement>(null)

  const [holes, setHoles] = useState<HoleState[]>(() => Array(HOLES).fill('hidden'))
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [moles, setMoles] = useState(DEFAULT_MOLES)
  const [found, setFound] = useState(0)
  const [stake, setStake] = useState(0)
  const [msg, setMsg] = useState('Set your bet and start whacking.')
  const [msgTone, setMsgTone] = useState<'idle' | 'win' | 'lose' | 'live'>('idle')

  // Board truth lives in refs — whackRandom() (called by window.MolesAPI in
  // a tight agent loop) and the click handler both need the CURRENT layout
  // synchronously, same reasoning as MinesGame.tsx's minesRef/revealedRef.
  const boardRef = useRef<boolean[]>([]) // true = mole at that index
  const doneRef = useRef<Set<number>>(new Set()) // whacked indices, any outcome
  const phaseRef = useRef<'idle' | 'playing' | 'over'>('idle')
  const stakeRef = useRef(0)
  const molesRef = useRef(DEFAULT_MOLES)
  const foundRef = useRef(0)

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const curMult = phase === 'playing' ? multiplier(moles, found) : 1
  const nextMult = phase === 'playing' && found < moles ? multiplier(moles, found + 1) : null
  const cashValue = phase === 'playing' && found > 0 ? Math.round(stake * curMult) : null

  /** Fills every still-hidden hole in with its true content (dim), leaving
   *  already-whacked holes untouched — ports revealAll()'s own "skip .done"
   *  guard (js/games/moles.js:143-148). */
  function revealAll() {
    setHoles((prev) =>
      prev.map((v, i) => (doneRef.current.has(i) ? v : boardRef.current[i] ? 'dim-mole' : 'dim-empty')),
    )
  }

  const cashOut = useCallback(
    (auto: boolean) => {
      if (phaseRef.current !== 'playing') return
      const mult = multiplier(molesRef.current, foundRef.current)
      const ret = Math.round(stakeRef.current * mult)
      payout(ret)
      phaseRef.current = 'over'
      setPhase('over')
      revealAll()
      const net = ret - stakeRef.current
      setMsg(
        `${auto && foundRef.current >= molesRef.current ? 'All moles found! ' : ''}Cashed out ${mult.toFixed(2)}× — ${
          net >= 0 ? '+' + fmt(net) : '-' + fmt(-net)
        }.`,
      )
      setMsgTone(net >= 0 ? 'win' : 'lose')
      if (net >= stakeRef.current * 3) molesSounds.bigwin()
      else molesSounds.cashout()
    },
    [payout],
  )

  const whack = useCallback(
    (i: number) => {
      if (phaseRef.current !== 'playing' || doneRef.current.has(i)) return

      // Rigged odds: turn an about-to-be-hit trap into a mole when the
      // cheat fires and a mole is still buried somewhere unwhacked.
      if (!boardRef.current[i] && cheatWin()) {
        const buried = boardRef.current.findIndex((isMole, j) => isMole && !doneRef.current.has(j))
        if (buried >= 0) {
          boardRef.current[buried] = false
          boardRef.current[i] = true
        }
      }

      doneRef.current.add(i)

      if (boardRef.current[i]) {
        foundRef.current++
        setHoles((h) => h.map((v, k) => (k === i ? 'mole' : v)))
        setFound(foundRef.current)
        molesSounds.win()
        if (foundRef.current >= molesRef.current) {
          cashOut(true)
          return
        }
        setMsg(`Mole! ${multiplier(molesRef.current, foundRef.current).toFixed(2)}× — keep going or cash out.`)
        setMsgTone('win')
      } else {
        setHoles((h) => h.map((v, k) => (k === i ? 'trap' : v)))
        phaseRef.current = 'over'
        setPhase('over')
        revealAll()
        setMsg(`Empty hole — busted! Lost ${money(stakeRef.current)}.`)
        setMsgTone('lose')
        molesSounds.lose()
      }
    },
    [cashOut],
  )

  const start = useCallback(() => {
    if (phaseRef.current === 'playing') return
    const bet = readBet(betRef)
    if (!placeBet(bet)) {
      setMsg('Not enough cash for that bet.')
      setMsgTone('lose')
      return
    }

    // Read the select from the DOM, not state — same reasoning as
    // MinesGame.tsx's #mineSelect: the agent writes it raw with no event.
    const m = Math.max(1, Math.min(8, Number(molSelectRef.current?.value) || DEFAULT_MOLES))

    const idx = Array.from({ length: HOLES }, (_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = randInt(0, i)
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    const board = new Array(HOLES).fill(false)
    idx.slice(0, m).forEach((i) => (board[i] = true))

    boardRef.current = board
    doneRef.current = new Set()
    phaseRef.current = 'playing'
    stakeRef.current = bet
    molesRef.current = m
    foundRef.current = 0

    setHoles(Array(HOLES).fill('hidden'))
    setMoles(m)
    setStake(bet)
    setFound(0)
    setPhase('playing')
    setMsg('Whack a hole!')
    setMsgTone('live')
    molesSounds.tick()
  }, [placeBet])

  /* ---------------- window.MolesAPI ----------------
     Registered on mount, DELETED on unmount (HoldemGame.tsx's own
     window.HoldemAPI pattern) so detect() can never return true for an
     unmounted route. Shape is the legacy object verbatim
     (js/games/moles.js:171-180): inRound, over, found, moles, holesLeft,
     start, whackRandom, cashOut. */
  useEffect(() => {
    const api = {
      inRound: () => phaseRef.current === 'playing',
      over: () => phaseRef.current !== 'playing',
      found: () => foundRef.current,
      moles: () => molesRef.current,
      holesLeft: () => HOLES - doneRef.current.size,
      start: (b?: number, m?: number) => {
        if (b != null && betRef.current) betRef.current.value = String(b)
        if (m != null && molSelectRef.current) molSelectRef.current.value = String(m)
        start()
      },
      // Reads the component's OWN tracked board state (doneRef, kept in
      // lockstep with `holes`) to pick a still-hidden index — never a DOM
      // query. Legacy's own whackRandom queried
      // `.mol-hole:not(.done)` directly; this port intentionally does not.
      whackRandom: () => {
        if (phaseRef.current !== 'playing') return
        const open: number[] = []
        for (let i = 0; i < HOLES; i++) if (!doneRef.current.has(i)) open.push(i)
        if (open.length) whack(open[Math.floor(Math.random() * open.length)])
      },
      cashOut: () => cashOut(false),
    }

    ;(window as unknown as { MolesAPI: typeof api }).MolesAPI = api

    return () => {
      delete (window as unknown as { MolesAPI?: typeof api }).MolesAPI
    }
  }, [start, whack, cashOut])

  const toneColor =
    msgTone === 'win'
      ? 'var(--color-green)'
      : msgTone === 'lose'
        ? 'var(--color-red)'
        : msgTone === 'live'
          ? 'var(--color-gold-2)'
          : 'var(--color-muted)'

  // A bust needs the same board-level beat Mines gets on a mine hit — a
  // shake on the whole grid plus a decaying red flash — not just the single
  // tile's own glow, so the "you busted" moment reads instantly even from a
  // glance away from the exact hole. Keyed off phase/msgTone (not the tile
  // array) so it never fires on a clean cash-out (msgTone stays 'win' there).
  const busted = phase === 'over' && msgTone === 'lose'

  return (
    <div>
      <PageHead
        title="Moles"
        sub="Whack holes to find the hidden moles. Each mole grows your multiplier — but an empty hole busts you. Fewer moles means bigger, riskier payouts."
        icon="hammer"
      />

      <GameLayout>
        <Panel>
          {/* Plain block wrapper, NOT a flex column — Battleship's own
              `#bsGrid` wrapper (BattleshipGame.tsx) is the working pattern
              this copies. A `flex flex-col items-center` wrapper (what this
              div used to be) makes TileGrid's own `<div class="grid">` a
              flex ITEM whose cross-axis (width, since the wrapper is a
              column) defaults to fit-content under `align-items: center`
              instead of stretching to the panel's width. With no explicit
              width of its own, the grid's `repeat(3, 1fr)` columns then had
              nothing to divide, and the whole board collapsed to its
              near-zero intrinsic size (a confirmed 22x22px box for all 9
              tiles). `mx-auto max-w-[360px]` on a plain block div instead
              gives the grid a real, capped width to stretch to and centers
              it the same way Battleship's wrapper does. */}
          <div
            className={['mol-wrap relative mx-auto w-full max-w-[360px]', busted ? 'mol-bust-shake' : ''].join(' ')}
          >
            <TileGrid
              id="molGrid"
              tiles={holes}
              cols={3}
              renderTile={renderHole}
              tileClassName={holeClassName}
              onTileClick={whack}
              disabled={(tile) => phase !== 'playing' || tile !== 'hidden'}
            />

            {/* A radial red flash decaying over the board the instant an
                empty hole busts the round — MinesGame.tsx's own
                `.mines-bust-flash` treatment, paired with the shake above. */}
            {busted && <div className="mol-bust-flash absolute inset-0 rounded-2xl pointer-events-none" />}
          </div>

          <div className="win-banner mt-4.5 text-center text-sm" id="molMsg" style={{ color: toneColor }}>
            {msg}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="field mb-3">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
              Moles (safe holes)
            </label>
            <select
              ref={molSelectRef}
              className="input w-full rounded-[10px] border px-3 py-2 text-text outline-none"
              id="molSelect"
              defaultValue={String(DEFAULT_MOLES)}
              disabled={phase === 'playing'}
              onChange={(e) => setMoles(Number(e.target.value))}
              style={{ borderColor: 'var(--glass-line)', background: 'var(--color-panel-2)' }}
            >
              {MOLE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} mole{n > 1 ? 's' : ''} · {HOLES - n} trap{HOLES - n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="stat-grid grid grid-cols-2 gap-2 mt-3.5">
            <Stat k="Moles found" v={phase === 'playing' ? `${found}/${moles}` : '0'} id="molFound" />
            <Stat k="Multiplier" v={`${curMult.toFixed(2)}×`} id="molMult" />
            <Stat k="Next mole" v={nextMult != null ? `${nextMult.toFixed(2)}×` : '—'} id="molNext" />
            <Stat k="Cash out" v={cashValue != null ? money(cashValue) : '—'} id="molCash" />
          </div>

          <Button
            id="molStart"
            variant="green"
            size="lg"
            block
            disabled={phase === 'playing'}
            onClick={start}
            className="mt-4"
          >
            Start
          </Button>
          <Button
            id="molCashBtn"
            variant="gold"
            size="lg"
            block
            disabled={phase !== 'playing' || found === 0}
            onClick={() => cashOut(false)}
            className="mt-2.5"
          >
            Cash Out
          </Button>

          <AgentMount />
        </Panel>
      </GameLayout>

      {/* Scoped keyframes — Mines' own convention (MinesGame.tsx), classes
          referenced above (mol-pop/mol-hit-shake/mol-bust-shake/
          mol-bust-flash) had no definition anywhere in the build; whacking
          a hole animated nothing. */}
      <style>{`
        @keyframes molPop {
          0% { transform: scale(0.9); filter: brightness(1); }
          45% { transform: scale(1.07); filter: brightness(1.35); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .mol-pop { animation: molPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes molHitShake {
          0%, 100% { transform: translateX(0) scale(1); }
          15% { transform: translateX(-3px) scale(1.05); }
          30% { transform: translateX(3px) scale(1.05); }
          45% { transform: translateX(-2px) scale(1.02); }
          60% { transform: translateX(2px) scale(1.02); }
          75% { transform: translateX(-1px); }
        }
        .mol-hit-shake { animation: molHitShake 420ms ease-in-out; }
        @keyframes molBustShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-7px) rotate(-0.5deg); }
          30% { transform: translateX(6px) rotate(0.4deg); }
          45% { transform: translateX(-5px) rotate(-0.35deg); }
          60% { transform: translateX(4px) rotate(0.3deg); }
          75% { transform: translateX(-2px); }
        }
        .mol-bust-shake { animation: molBustShake 460ms ease-in-out; }
        @keyframes molBustFlash {
          0% { opacity: 0.55; }
          100% { opacity: 0; }
        }
        .mol-bust-flash {
          animation: molBustFlash 700ms ease-out forwards;
          background: radial-gradient(circle at 50% 45%, var(--glow-red), transparent 70%);
        }
        @media (prefers-reduced-motion: reduce) {
          .mol-pop, .mol-hit-shake, .mol-bust-shake { animation: none; }
          .mol-bust-flash { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
