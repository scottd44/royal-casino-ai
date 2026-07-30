import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GameLayout, Panel, PageHead, Stat, Button } from '@/platform/ui'
import { Reveal, shouldAnimate, DUR, EASE_BRAND } from '@/platform/motion'
import { Icon } from '@/platform/icons'
import BetField, { useBetRef, readBet } from '../../components/BetField'
import AgentMount from '../../components/AgentMount'
import { useWalletStore, cheatWin } from '@/platform/money/walletStore'
import { fmt, money } from '@/platform/money/format'
import { useIsMobile } from '@/platform/layout/useMediaQuery'
import { coinflipSounds } from './sounds'

/* ============================================================
   Coinflip — ported from js/games/coinflip.js.

   AGENT CONTRACT (agent-ui.js:1291):
     detect()  window.CoinflipAPI && #cfCoins
     play()    applyBet() -> #betInput, API.setCoins(n), then API.call(side),
               then loops API.call(...) (sleeping ~520ms between calls) while
               API.inRound() && API.streak() < target, finally API.cashOut().
               Reads #cfMsg afterward for the status line.

   The API drives the ENTIRE round — there is no DOM click simulated for
   Heads/Tails/Cash Out; `call()`/`cashOut()` are invoked directly on the
   object, same as coinflip.js's own window.CoinflipAPI. Heads/tails mapping
   verified against agent-ui.js:1305-1307: `const side = dec.action ===
   "tails" ? 0 : 1` then `API.call(side)` — 0 is tails, 1 is heads, matching
   coinflip.js:225's own `call: (pick) => call(pick ? 1 : 0)` verbatim.

   Registered on mount, REMOVED on unmount (HANDOFF §2b) — same technique as
   HoldemGame.tsx's window.HoldemAPI: a stale API would make
   coinflip.detect() return true on another route, and the agent would call
   into a dead round.
   ============================================================ */

const EDGE = 0.02 // per-step house edge -> RTP 0.98
const payoutFor = (coins: number) => Math.pow(2, coins) * (1 - EDGE) // 1.96 / 3.92 / 7.84

// Provably-fair seed machinery, ported verbatim from coinflip.js:14-18 —
// cosmetic (not part of the agent contract), kept for parity with the
// legacy round.
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
const seedHash = (s: string) => xmur3(s)().toString(16).padStart(8, '0')
const randSeed = () =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
/** Deterministic coin face from committed seeds — 0 = Tails, 1 = Heads. */
const coinFace = (server: string, client: string, nonce: number, idx: number): 0 | 1 =>
  (xmur3(`${server}:${client}:${nonce}:${idx}`)() & 1) as 0 | 1

type Phase = 'idle' | 'playing' | 'over'
type Tone = 'idle' | 'win' | 'lose'
type HistEntry = { id: number; win: boolean; faces: (0 | 1)[] }

export default function CoinflipGame() {
  const isMobile = useIsMobile()
  const betRef = useBetRef()

  // Round truth lives in refs, exactly like HoldemGame's tblRef/stacksRef —
  // window.CoinflipAPI's functions must read the CURRENT state synchronously
  // when the agent calls them, never a stale render closure.
  const phaseRef = useRef<Phase>('idle')
  const stakeRef = useRef(0)
  const multRef = useRef(1)
  const streakRef = useRef(0)
  const coinsRef = useRef<1 | 2 | 3>(1)
  const facesRef = useRef<(0 | 1)[] | null>(null)
  const flipIdRef = useRef(0)
  const histRef = useRef<HistEntry[]>([])
  const histIdRef = useRef(0)
  const msgRef = useRef('Set a bet, pick your side.')
  const toneRef = useRef<Tone>('idle')
  // server re-rolled each round, client fixed for the session, nonce
  // incremented once per resolved round — same lifecycle as coinflip.js.
  const serverRef = useRef(randSeed())
  const clientRef = useRef(randSeed())
  const nonceRef = useRef(1)

  const [, setTick] = useState(0)
  const repaint = useCallback(() => setTick((t) => t + 1), [])

  const placeBet = useWalletStore((s) => s.placeBet)
  const payout = useWalletStore((s) => s.payout)

  const endRound = useCallback(() => {
    phaseRef.current = 'over'
    nonceRef.current++
  }, [])

  const call = useCallback(
    (pick: 0 | 1) => {
      if (phaseRef.current !== 'playing') {
        const stake = readBet(betRef)
        if (!placeBet(stake)) {
          msgRef.current = 'Not enough cash for that bet.'
          toneRef.current = 'lose'
          repaint()
          return
        }
        stakeRef.current = stake
        multRef.current = 1
        streakRef.current = 0
        phaseRef.current = 'playing'
        serverRef.current = randSeed()
        histRef.current = []
      }

      const n = coinsRef.current
      let faces = Array.from({ length: n }, (_, i) =>
        coinFace(serverRef.current, clientRef.current, nonceRef.current, streakRef.current * 10 + i),
      )
      // The 😈 rig: make every coin match the pick.
      if (cheatWin()) faces = faces.map(() => pick)
      facesRef.current = faces
      flipIdRef.current++
      const win = faces.every((f) => f === pick)
      histRef.current = [{ id: ++histIdRef.current, win, faces }, ...histRef.current].slice(0, 12)

      if (win) {
        streakRef.current++
        multRef.current *= payoutFor(n)
        msgRef.current = `${n > 1 ? `All ${n} match` : 'Correct'}! Streak ${streakRef.current} · ${multRef.current.toFixed(2)}×.`
        toneRef.current = 'win'
        if (multRef.current >= 8) coinflipSounds.bigwin()
        else coinflipSounds.win()
      } else {
        msgRef.current = `Wrong! Streak over — lost ${money(stakeRef.current)}. Pick a side to play again.`
        toneRef.current = 'lose'
        coinflipSounds.lose()
        endRound()
      }
      repaint()
    },
    [betRef, endRound, placeBet, repaint],
  )

  const cashOut = useCallback(() => {
    if (phaseRef.current !== 'playing' || streakRef.current === 0) return
    const ret = Math.round(stakeRef.current * multRef.current)
    payout(ret)
    msgRef.current = `Cashed out ${multRef.current.toFixed(2)}× = ${money(ret)} (+${fmt(ret - stakeRef.current)}). Pick a side to go again.`
    toneRef.current = 'win'
    coinflipSounds.cashout()
    endRound()
    repaint()
  }, [endRound, payout, repaint])

  const setCoins = useCallback(
    (n: 1 | 2 | 3) => {
      if (phaseRef.current === 'playing') return
      coinsRef.current = n
      repaint()
    },
    [repaint],
  )

  /* ---------------- window.CoinflipAPI ----------------
     The adapter's entire view of this game. Registered on mount, DELETED on
     unmount so detect() can never return true for an unmounted round. */
  useEffect(() => {
    const api = {
      inRound: () => phaseRef.current === 'playing',
      streak: () => streakRef.current,
      mult: () => multRef.current,
      setCoins: (n: number) => setCoins(Math.max(1, Math.min(3, Math.round(n))) as 1 | 2 | 3),
      call: (pick: number) => call(pick ? 1 : 0),
      cashOut: () => cashOut(),
    }

    ;(window as unknown as { CoinflipAPI: typeof api }).CoinflipAPI = api

    return () => {
      delete (window as unknown as { CoinflipAPI?: typeof api }).CoinflipAPI
    }
  }, [call, cashOut, setCoins])

  /* ---------------- render ---------------- */
  const phase = phaseRef.current
  const streak = streakRef.current
  const mult = multRef.current
  const coins = coinsRef.current
  const faces = facesRef.current
  const msg = msgRef.current
  const tone = toneRef.current
  const hist = histRef.current
  const cashVal = phase === 'playing' && streak > 0 ? money(Math.round(stakeRef.current * mult)) : '—'

  const toneColor =
    tone === 'win' ? 'var(--color-green)' : tone === 'lose' ? 'var(--color-red)' : 'var(--color-muted)'

  return (
    <div>
      <PageHead
        title="Coinflip"
        sub={`Call it right and compound your stake ${payoutFor(1).toFixed(2)}× per flip. Cash out or push your streak — one wrong call ends it. Flip up to 3 coins for bigger jumps.`}
        icon="circle-dollar-sign"
      />

      <GameLayout>
        <Panel>
          {/* The stage — a recessed, backlit housing behind the coins, same
              family of treatment as Dice's Probability Engine console /
              Wheel's stage: layered gradients + inset shadows for real
              depth, a border/glow that flushes to the outcome colour. */}
          <div
            className={`relative rounded-2xl text-center overflow-hidden ${
              isMobile ? 'px-3 pt-4 pb-3' : 'px-6 pt-6 pb-5'
            }`}
            style={{
              background:
                'radial-gradient(120% 140% at 50% -10%, color-mix(in srgb, #10182c 88%, transparent), var(--color-panel-2) 72%)',
              border: `1px solid ${tone === 'idle' ? 'var(--glass-line)' : `color-mix(in srgb, ${toneColor} 45%, var(--glass-line))`}`,
              boxShadow: `inset 0 0 40px rgba(0,0,0,0.45), ${
                tone === 'idle' ? 'none' : `0 0 50px -12px color-mix(in srgb, ${toneColor} 45%, transparent)`
              }`,
              transition: 'border-color 0.3s var(--ease), box-shadow 0.3s var(--ease)',
            }}
          >
            {/* #cfCoins is half of detect() — must stay mounted regardless of
                round phase. Faces default to blanks (coinsRef.current count)
                until the first flip lands. */}
            <div
              id="cfCoins"
              className={`flex justify-center py-3 ${isMobile ? 'gap-2' : 'gap-4'}`}
              style={{ perspective: 800 }}
            >
              {(faces ?? Array(coins).fill(null)).map((f, i) => (
                <Reveal
                  key={`${flipIdRef.current}-${i}`}
                  as="div"
                  preset="scaleIn"
                  duration={0.3}
                  delay={i * 0.08}
                >
                  <CoinFace face={f as 0 | 1 | null} spin={f != null} size={isMobile ? 54 : 76} />
                </Reveal>
              ))}
            </div>

            <div
              className={`text-center num font-semibold my-2 ${isMobile ? 'text-2xl' : 'text-4xl'}`}
              style={{ color: 'var(--color-gold)', textShadow: '0 0 22px var(--glow-gold)' }}
            >
              {mult.toFixed(2)}×
            </div>

            <div
              id="cfMsg"
              className="text-sm text-center mt-1 flex items-center justify-center gap-1.5"
              style={{ color: toneColor }}
            >
              {tone === 'win' && <Icon name="trending-up" size={14} color={toneColor} />}
              {tone === 'lose' && <Icon name="x" size={14} color={toneColor} />}
              <span>{msg}</span>
            </div>
          </div>

          <div className="h-px my-5" style={{ background: 'var(--glass-line)' }} />

          <div>
            <h4 className="text-xs uppercase tracking-wide text-muted mb-2">Streak</h4>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {hist.map((h) => (
                <Reveal key={h.id} as="span" preset="scaleIn" duration={0.22}>
                  <span
                    className={`num rounded-md tracking-wide border ${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'}`}
                    style={{
                      background: h.win
                        ? 'color-mix(in srgb, var(--color-green) 16%, transparent)'
                        : 'color-mix(in srgb, var(--color-red) 16%, transparent)',
                      color: h.win ? 'var(--color-green)' : 'var(--color-red)',
                      borderColor: h.win
                        ? 'color-mix(in srgb, var(--color-green) 55%, transparent)'
                        : 'color-mix(in srgb, var(--color-red) 40%, transparent)',
                      boxShadow: h.win ? '0 0 10px -2px var(--glow-green)' : 'none',
                    }}
                  >
                    {h.faces.map((f) => (f === 1 ? 'H' : 'T')).join('')}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-faint mt-3">
            {phase === 'over' ? (
              <>
                Revealed · server <code>{serverRef.current}</code> · hash{' '}
                <code>{seedHash(serverRef.current)}</code>
              </>
            ) : (
              <>
                Provably fair · committed hash <code>{seedHash(serverRef.current)}</code> · nonce{' '}
                {nonceRef.current}
              </>
            )}
          </div>
        </Panel>

        {/* The controls panel. */}
        <Panel>
          <BetField inputRef={betRef} />

          <div className="field mb-4">
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
              Coins (all must match)
            </label>
            <div className="grid grid-cols-3 gap-2" id="cfCoinSel">
              {([1, 2, 3] as const).map((n) => (
                <Button
                  key={n}
                  type="button"
                  data-coins={n}
                  variant={coins === n ? 'gold' : 'ghost'}
                  size="sm"
                  disabled={phase === 'playing'}
                  onClick={() => setCoins(n)}
                >
                  {n} · {payoutFor(n).toFixed(2)}×
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Button id="cfHeads" variant="blue" size="lg" block onClick={() => call(1)}>
              Heads
            </Button>
            <Button id="cfTails" variant="purple" size="lg" block onClick={() => call(0)}>
              Tails
            </Button>
          </div>

          {phase === 'playing' && (
            <Button id="cfCash" variant="green" size="lg" block className="mt-2" onClick={cashOut}>
              Cash Out
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <Stat k="Streak" v={streak} />
            <Stat k="Cash out" v={cashVal} />
          </div>

          <AgentMount />
        </Panel>
      </GameLayout>
    </div>
  )
}

/* The coin is built from CSS, not an icon — H/T is clearer at a glance than
   any Lucide glyph, and matches the legacy engraved-mark treatment closely
   enough without pulling in coinflip.js's GSAP 3D-flip rig.

   Real coin materiality, same layering technique Roulette's chip badges /
   Wheel's hub use: a radial-gradient face (gold tones for Heads, purple
   tones for Tails — both existing tokens, no new colours), a beveled metal
   rim built from stacked inset highlight/shadow + a dark outer ring, and an
   embossed glyph (a light top edge + dark underside on the text-shadow)
   instead of flat lettering. A blank (pre-flip) coin stays a plain dashed
   glass disc so the "?" reads as inert, not another coin.

   `spin`: true only for a just-landed, non-null face (never the idle blank
   placeholders). Each flip already gets a fresh CoinFace mount via
   `Reveal`'s `key={flipIdRef.current}-${i}`, so `initial`/`animate` here
   fire exactly once per flip — a single rotateY sweep that reads as the
   coin tumbling to a stop, gated on shouldAnimate() the same way every
   other flip/spin in this app degrades under reduced motion / a
   backgrounded tab (motionPolicy() read once, not reactively, matching
   Reveal's own latch-at-mount rule). */
function CoinFace({ face, spin, size = 76 }: { face: 0 | 1 | null; spin: boolean; size?: number }) {
  const blank = face == null
  const heads = face === 1
  const animated = spin && shouldAnimate()

  const background = blank
    ? 'var(--glass-2)'
    : heads
      ? 'radial-gradient(circle at 35% 28%, var(--color-gold-2), var(--color-gold) 55%, var(--color-gold-deep) 100%)'
      : 'radial-gradient(circle at 35% 28%, color-mix(in srgb, var(--color-purple) 55%, white), var(--color-purple) 55%, color-mix(in srgb, var(--color-purple) 55%, black) 100%)'

  const glyphColor = blank ? 'var(--color-faint)' : heads ? 'var(--color-gold-deep)' : '#241238'
  const glyphShadow = blank
    ? 'none'
    : heads
      ? '0 1px 0 rgba(255,255,255,0.55), 0 -1px 1px rgba(0,0,0,0.35)'
      : '0 1px 0 rgba(255,255,255,0.35), 0 -1px 1px rgba(0,0,0,0.5)'

  return (
    <motion.div
      className="flex items-center justify-center rounded-full num text-2xl font-bold shrink-0"
      style={{
        width: size,
        height: size,
        background,
        color: glyphColor,
        textShadow: glyphShadow,
        border: blank ? '1px dashed var(--glass-line)' : '1px solid rgba(0,0,0,0.45)',
        boxShadow: blank
          ? 'none'
          : '0 0 0 3px rgba(0,0,0,0.35), 0 8px 16px -4px rgba(0,0,0,0.55), inset 0 2px 3px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.45)',
      }}
      initial={animated ? { rotateY: -180 } : false}
      animate={animated ? { rotateY: 0 } : {}}
      transition={animated ? { duration: DUR.reveal, ease: EASE_BRAND } : { duration: 0 }}
    >
      {blank ? '?' : heads ? 'H' : 'T'}
    </motion.div>
  )
}
