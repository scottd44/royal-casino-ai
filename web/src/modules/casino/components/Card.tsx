import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { motion } from 'framer-motion'
import { DUR, MS, armWatchdog, flipFace, motionPolicy } from '@/platform/motion'
import { cn } from '@/platform/ui'

/* ============================================================
   Card — a single playing card, the shared primitive Wave 4's seven card
   games (Blackjack, Video Poker, Baccarat, Three Card, Casino War, Red
   Dog, Hilo — PHASE_3_GAMES_PLAN.md §1/§3b) render every hand from.

   THE `.rank-top` CONTRACT — the highest-risk detail in this file.
   Grepped `.rank-top` across every card-reading adapter in
   `js/agent/agent-ui.js`:
     - blackjack (`cardRank`, line ~405): reads `.rank-top`'s textContent
       and STRIPS suit glyphs/whitespace with a regex — works whether
       `.rank-top` holds "10" alone or "10♠" together.
     - videopoker (`readHand`, ~471), hilo (`readCard`, ~796), three card
       poker (`tcpPlayer .card .rank-top`, ~1142): all read `.rank-top`'s
       textContent WHOLE and then slice the suit off the END themselves
       (`txt.slice(-1)` for suit, `txt.slice(0, -1)` for rank) — these
       REQUIRE rank and suit concatenated in that one node, no separator.
   The legacy DOM (js/games/blackjack.js `cardHTML`, and identically in
   videopoker.js/baccarat.js/threecard.js/casinowar.js/reddog.js/hilo.js)
   already renders exactly that: `<div class="rank-top">{rank}<br>{suit}</div>`
   — a `<br>` contributes no text node, so `textContent` comes out as
   `"10♠"`/`"A♥"` etc. This component reproduces that shape verbatim
   (rank then suit, no separator) so every one of those six adapters reads
   the same `.rank-top` node correctly, not just blackjack's more lenient
   regex path.
   Face-down: legacy's own `cardHTML(card, true)` renders NO rank-top at
   all for a hidden card (just a `.card.back` div with a decorative
   glyph) — reproduced here as an EMPTY `.rank-top` while `faceDown`, never
   the real rank/suit text. In practice this is belt-and-braces: every
   adapter above that must skip a hidden card already filters it out via
   `:not(.back)` before ever touching `.rank-top` (see blackjack's
   `#dealerCards .card:not(.back)`), but a component that renders the
   true rank into the DOM regardless of `faceDown` is still one stray
   selector change away from leaking it, so this never does that.

   THE 3D FLIP — HANDOFF §6.7 / `platform/motion/presets.ts`'s `flipFace`
   doc comment, never used anywhere else in the codebase before this file
   (grepped `preserve-3d`/`flipFace` repo-wide — zero hits outside
   `presets.ts` itself). Structure per that doc, the standard two-face CSS
   flip-card technique: a non-rotating OUTER wrapper (`.card`, carries the
   box-shadow and — HANDOFF §6.7's own words — never the rotating face)
   contains one rotating `preserve-3d` CHILD (the only thing Framer
   animates `rotateY` on), which in turn contains BOTH faces stacked via
   `position: absolute; inset: 0`, each `backface-visibility: hidden`, the
   back face pre-rotated 180deg. Rotating the single child between the
   `front`/`back` keyframes it defines is what makes exactly one face
   visible at a time without ever touching the wrapper's own shadow.

   A flip is triggered only by a LIVE `faceDown` prop CHANGE on an
   already-mounted `Card` — `initial={false}` means the very first paint
   (a card freshly dealt already face down, e.g. a dealt-but-unrevealed
   hand) snaps straight to its resting rotation with no tween and
   therefore nothing to watchdog. Consumers that only ever mount a card
   already in its final orientation (dealt face-up, never flipped in
   place) get this for free without opting into anything — per the plan's
   own instruction, `Card` supports both modes without assuming every
   caller animates the transition.
   ============================================================ */

export type CardSuit = '♠' | '♥' | '♦' | '♣'

export interface CardProps {
  /** 'A','2'..'10','J','Q','K' — passed straight into `.rank-top`. */
  rank: string
  suit: CardSuit
  faceDown?: boolean
  className?: string
  /** 'md' (default, 56x80 — the original size; still used by Holdem, which
   *  is outside this pass's scope, so left as-is) or 'lg' (96x136 — every
   *  Wave 4 card game (Blackjack/Video Poker/Baccarat/Three Card/Casino
   *  War/Red Dog/Hilo) uses this size so a hand reads as the page's focal
   *  element rather than a small detail sitting in a lot of empty felt.
   *  Bumped from the original 80x112 — user feedback (2026-07-29) flagged
   *  cards as reading too small across the card games. Purely a size swap
   *  on the outer box + inner font sizes; the `.rank-top` contract shape
   *  (rank+suit concatenated, no separator) and the 3D-flip structure are
   *  identical at both sizes. */
  size?: 'md' | 'lg'
}

const SIZE_BOX: Record<'md' | 'lg', string> = { md: 'w-14 h-20', lg: 'w-24 h-[136px]' }
const SIZE_RANK: Record<'md' | 'lg', string> = { md: 'text-lg', lg: 'text-2xl' }
const SIZE_SUIT: Record<'md' | 'lg', string> = { md: 'text-2xl', lg: 'text-4xl' }

const RED_SUITS = new Set<CardSuit>(['♥', '♦'])

/** Face-up content: the `.rank-top` node (rank+suit concatenated, no
 *  separator — see the contract note above) plus a large centered suit
 *  glyph. Suit characters are the ONE non-Lucide/non-`rc:` mark this app
 *  allows (DEVELOPMENT_GUIDE.md §2 / HANDOFF §6.9) — rendered as literal
 *  text here, never through the icon registry.
 *
 *  `faceDown` is threaded in here too (not just used to pick which face to
 *  mount) because the animated path keeps BOTH faces in the DOM at once
 *  for the 3D flip — this face doesn't stop existing while rotated away.
 *  `.rank-top` must still go empty the instant `faceDown` flips true, not
 *  just once the rotation finishes settling on the back. */
function FrontFace({
  rank,
  suit,
  red,
  faceDown,
  size,
}: {
  rank: string
  suit: CardSuit
  red: boolean
  faceDown: boolean
  size: 'md' | 'lg'
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[10px] border p-2"
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        borderColor: 'var(--glass-line)',
        background: 'var(--color-panel-2)',
        color: red ? 'var(--color-red)' : 'var(--color-text)',
        boxShadow: 'var(--lift-1)',
      }}
    >
      <b className={cn('rank-top num leading-none', SIZE_RANK[size])}>
        {!faceDown && (
          <>
            {rank}
            <br />
            {suit}
          </>
        )}
      </b>
      {!faceDown && <span className={cn('leading-none opacity-70', SIZE_SUIT[size])}>{suit}</span>}
    </div>
  )
}

/** Face-down content: no `.rank-top` at all (matches legacy's own
 *  `cardHTML(card, true)`), a plain patterned back. */
function BackFace() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-[10px] border"
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: 'rotateY(180deg)',
        borderColor: 'var(--glass-line)',
        background:
          'repeating-linear-gradient(45deg, var(--color-panel-2) 0, var(--color-panel-2) 6px, var(--color-bg-1) 6px, var(--color-bg-1) 12px)',
        boxShadow: 'var(--lift-1)',
      }}
    >
      <span className="text-2xl opacity-30" style={{ color: 'var(--color-gold)' }}>
        ♠
      </span>
    </div>
  )
}

export function Card({ rank, suit, faceDown = false, className, size = 'md' }: CardProps): JSX.Element {
  const red = RED_SUITS.has(suit)

  /* LATCHED AT MOUNT, same reasoning as Reveal.tsx/Stagger.tsx: the
     animated and instant paths render different tree shapes (a rotating
     preserve-3d child with two stacked faces vs a single flat face), so
     re-deriving the policy mid-life on a `visibilitychange` could
     restructure/remount a card out from under a live round. One read, one
     tree shape, for this instance's lifetime. */
  const [policy] = useState(motionPolicy)

  const innerRef = useRef<HTMLDivElement | null>(null)
  const setInnerNode = useCallback((node: HTMLDivElement | null) => {
    innerRef.current = node
  }, [])

  // Skip watchdogging the very first render: `initial={false}` sets the
  // resting rotation directly with no tween, so there is nothing running
  // to time out. Only a LATER `faceDown` change is a real flip that could
  // stall (rAF suspended in a backgrounded tab) and needs the safety net.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (policy !== 'full') return // instant path never leaves an inline rotateY behind to strip.
    const node = innerRef.current
    if (!node) return
    // Bidirectional flip — never use the generic strip-to-'' force (see
    // watchdog.ts's doc comment). Force the CURRENT `faceDown` value's
    // correct resting rotation instead, so a stalled/backgrounded-tab flip
    // settles on the right face rather than always resolving to front.
    return armWatchdog(node, MS.panel, () => {
      if (node instanceof HTMLElement) node.style.transform = `rotateY(${faceDown ? 180 : 0}deg)`
    })
  }, [faceDown, policy])

  const rootClassName = cn('card', faceDown && 'back', className)

  if (policy !== 'full') {
    // Fewer moving parts (Reveal/Stagger's own instant-policy doctrine):
    // one flat face, no rotation, no stacked back face sitting unseen in
    // the DOM. Whichever face is logically current renders directly.
    return (
      <div className={cn(rootClassName, 'relative', SIZE_BOX[size])}>
        {faceDown ? <BackFace /> : <FrontFace rank={rank} suit={suit} red={red} faceDown={false} size={size} />}
      </div>
    )
  }

  return (
    <div
      className={cn(rootClassName, 'relative', SIZE_BOX[size])}
      style={{ perspective: 800 }}
    >
      <motion.div
        ref={setInnerNode}
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        variants={flipFace({ dur: DUR.panel })}
        initial={false}
        animate={faceDown ? 'back' : 'front'}
      >
        <FrontFace rank={rank} suit={suit} red={red} faceDown={faceDown} size={size} />
        <BackFace />
      </motion.div>
    </div>
  )
}
