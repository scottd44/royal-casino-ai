# Phase 3 — Games

## STATUS (paused here — read this first)

Development paused after Wave 3 by explicit request, to move on to the next phase. **17 of 22
games are not yet ported and their agent adapters (already written, in `js/agent/agent-ui.js`)
have no live DOM to act on yet** — this is the concrete "AI work still needed" list. Nothing is
broken; these adapters simply have nothing to click until each game gets a React port.

**Done** (Waves 1-2, fully verified): Limbo, Coinflip, RPS, plus the `TileGrid`/`Card`/`Felt`
shared primitives.

**Wave 3 (grid games), in progress**: Tower ✅ landed and verified. Keno, Battleship, Moles,
Snakes were dispatched — check `web/src/modules/casino/games/` for what landed before resuming;
finish reviewing/verifying whichever of these four are still outstanding before starting Wave 4.

**NOT STARTED — remaining games needing a React port + live-DOM adapter verification:**

| Wave | Games | Adapter location (`agent-ui.js`) | Shared primitive |
|---|---|---|---|
| 3 (finish) | Keno, Battleship, Moles, Snakes | grep `  keno:`/`  battleship:`/`  moles:`/`  snakes:` | `TileGrid` (built, ready) |
| 4 | Blackjack, Video Poker, Baccarat, Three Card, Casino War, Red Dog, Hilo | grep each game's own block | `Card`/`Felt` (built, ready) |
| 5 | Plinko, Crash, Wheel, Chicken | grep each game's own block | none — own canvas/`useEffect`+`useRef` renderer per game |
| 6 | Slots, Gems, Roulette | grep each game's own block | none — Roulette has `window.RouletteAPI` already |

Every one of these adapters already exists and is already correct (it drives the *vanilla* DOM
today) — porting each game to React and wiring its DOM contract is what makes the agent able to
reach it. Until then, `royalAgent.hasAdapter(id)` returns true for all 25 game ids but `detect()`
only ever resolves true for the 8 games actually rendered in React (Dice, Mines, Hold'em, Limbo,
Coinflip, RPS, Tower, + whichever of Keno/Battleship/Moles/Snakes landed).

When resuming: pick up at §1's wave table below, follow §4's verification protocol per game
exactly as Waves 1-3 did, and update this STATUS block as each wave lands.

---

Follows `PHASE_2_AGENT_PLAN.md`. Implements HANDOFF §4 Phase 3: port the remaining 22 games,
grouped by shape so siblings share a primitive instead of each reinventing cards/tiles/canvas
plumbing. ~5,350 lines of legacy JS across 22 files (`js/games/*.js`, dice/mines/holdem excluded
— already ported).

This is a multi-wave effort, not a single dispatch. This document covers: the grouping, the two
new shared primitives every card/grid game depends on, wave sequencing, and the per-game
verification protocol. Per-game DOM-contract detail is intentionally NOT exhaustively
pre-documented here for all 22 — DEVELOPMENT_GUIDE §5's own instruction stands: **before porting
a game, grep its adapter in `agent-ui.js` and note every selector it touches.** That's cheaper and
more reliable than a wiki maintained by hand across 22 entries.

---

## 0. The rule that doesn't change

Same law as Phase 1/2: **motion never sits on the critical path of state.** Every game ported here
inherits the two-track discipline already built — `platform/motion`'s watchdog/reduced-motion/
`AnimatedNumber` guard against `NUMERIC_CONTRACT_IDS`, `platform/agent/contractIds.ts` is the
enforced list. Nothing new to invent; just keep using what Phase 1/2 built.

**Before porting ANY game, grep its adapter section in `js/agent/agent-ui.js`** (`grep -n
"  <gameid>: {" -A 60`) and cross-reference every `$("#...")`/`.classList` it touches against
`platform/agent/contractIds.ts`. If a selector the adapter needs is missing from `CONTRACT_IDS`,
add it there first — don't let a game ship with a live gap in the enforced list.

---

## 1. Grouping (22 games, 7 buckets)

| Bucket | Games | Legacy LOC | Shared primitive |
|---|---|---|---|
| Simple originals | Limbo, Coinflip, RPS | 589 | none — same shape as Dice (Panel/Stat/Button) |
| Grid games | Tower, Keno, Battleship, Moles, Snakes | 1259 | `TileGrid` (generalizes Mines) |
| Card games | Blackjack, Video Poker, Baccarat, Three Card, Casino War, Red Dog, Hilo | 1535 | `Card` / `Felt` |
| Canvas games | Plinko, Crash, Wheel, Chicken | 1291 | none shared — each owns its canvas/DOM renderer in `useEffect`+`useRef`, per HANDOFF §4 |
| Reel games | Slots, Gems | 362 | own small reel-strip pattern, not shared with TileGrid (spin physics, not per-tile reveal) |
| Table | Roulette | 314 | own betting-board layout, has `RouletteAPI` |

Wave order, easiest/lowest-risk first:

1. **Wave 1 — simple originals** (Limbo, Coinflip, RPS). No new primitive. Ships fastest, proves
   nothing regressed in the established Button/Panel/Stat/motion/icon pattern before touching
   anything bigger.
2. **Wave 2 — shared primitives** (`Card`/`Felt`, `TileGrid`). Built once, reviewed hard — every
   later wave depends on these being right. Small in line count, large in blast radius.
3. **Wave 3 — grid games** (Tower, Keno, Battleship, Moles, Snakes). First real exercise of
   `TileGrid`.
4. **Wave 4 — card games** (7 games). First real exercise of `Card`/`Felt`.
5. **Wave 5 — canvas games** (Plinko, Crash, Wheel, Chicken). Highest individual complexity
   (physics/animation timing) — done last, once the team (agents + reviewer) has a full phase of
   established conventions behind it.
6. **Wave 6 — reel games + Roulette**. Lowest urgency, most bespoke.

This document only fully specs Wave 1 and Wave 2. Waves 3-6 get their own pass once the earlier
waves land and prove the pattern — writing exhaustive specs for games nobody has touched yet is
exactly the premature-detail trap DEVELOPMENT_GUIDE §5 warns against ("grep the adapter, don't
guess").

---

## 2. Wave 1 — simple originals (Limbo, Coinflip, RPS)

All three follow Dice's exact shape: `Panel` + `Stat` + `Button`, a `royalAgent`-readable bet
input, one primary action button, a result message. No new primitive needed — this wave is
proof-of-pattern, not primitive-building.

### Limbo — `js/games/limbo.js` (165 lines)
Adapter (`agent-ui.js`, grep `limbo:`): `detect()` needs `#limboBtn`. `play()` sets `#targetInput`
(**uncontrolled — raw `.value` write + `input` event, same pattern as `#betInput`/Dice's
`#slider`**, see `BetField.tsx`/HANDOFF §2a), clicks `#limboBtn`, waits up to 4s for it to
re-enable, reads `#limboMsg` for the result text. Single-shot: pick a target multiplier, fire, done.

### Coinflip — `js/games/coinflip.js` (231 lines)
Adapter needs `window.CoinflipAPI` (`inRound(): boolean`, `streak(): number`, `mult(): number`,
`setCoins(n: 1|2|3): void`, `call(pick: 0|1): void`, `cashOut(): void`) plus `#cfMsg` for status
text. **Streak-compounding**: the adapter calls `API.call(side)`, then loops calling again while
`API.inRound() && API.streak() < target`, then `cashOut()`. So the React port's `CoinflipAPI` must
be attached to `window` (`useEffect` on mount, matching Holdem's `window.HoldemAPI` pattern
exactly — see `HoldemGame.tsx`) and **removed on unmount** (HANDOFF §2b: a stale API makes
`detect()` return true on the wrong route).

### RPS — `js/games/rps.js` (193 lines)
Same shape as Coinflip: `window.RPSAPI` (`inRound()`, `streak()`, `mult()`, `throw(m: 0|1|2)`,
`cashOut()`), `#rpsTrack` (adapter's `detect()` needs this) and `#rpsMsg`. Uses the raw `rc:rock`/
`rc:paper`/`rc:scissors` icons already in the registry (`platform/icons/raw/` — built in Phase 1,
never used yet; this is their first real call site).

**Wave 1 verification**: `detect()` for each game must return true only on its own route (check
via the existing `dom-contract.spec.ts` pattern — add a describe block per game mirroring the
Dice/Mines ones already there), `window.CoinflipAPI`/`window.RPSAPI` must be removed on unmount
(mirror the Holdem `HoldemAPI`-removal test), and `npm test` must stay green.

---

## 3. Wave 2 — shared primitives

### 3a. `platform/ui/TileGrid.tsx` (or `modules/casino/components/` — group-shared, not truly
cross-project like `platform/`; put it in `modules/casino/components/` alongside `AgentMount.tsx`
and `BetField.tsx`, since only casino grid games use it)

Generalizes the pattern already proven in `MinesGame.tsx` (read it before writing this —
`data-idx` indices in DOM order, `.tile`/`.revealed`/state-specific classes read by adapters
document-wide via `document.querySelectorAll`, `Reveal` wraps only the per-tile ICON — the tile
button itself never unmounts, only its revealed content mounts/unmounts fresh).

```tsx
export interface TileGridProps<T> {
  id: string                    // container id, e.g. "grid" (mines), "towerGrid", "molGrid", "bsGrid", "snBoard", "knBoard"
  tiles: T[]                    // one entry per tile, in DOM order — order IS the contract (agent-ui.js clicks tiles[idx] by array position)
  cols: number
  renderTile: (tile: T, index: number) => ReactNode   // icon/content only — TileGrid owns the <button>
  tileClassName?: (tile: T, index: number) => string  // per-tile state classes (.revealed, .gem, .mine, .hit, .miss, etc — GAME-SPECIFIC, TileGrid doesn't know the vocabulary)
  onTileClick?: (index: number) => void
  disabled?: (tile: T, index: number) => boolean
}
```

Rules, non-negotiable, inherited from Mines' own working pattern:
- **Order is the contract.** `tiles[i]` must render as the `i`-th DOM child, always — several
  adapters (Mines already; Tower/Battleship/Moles/Snakes/Keno will too) click by array index.
- **The `<button>` itself never unmounts** across state changes within a round (hidden → revealed
  → hidden-again-on-reset is fine, unmount/remount is not — that's a fresh `key`, which breaks
  click targeting mid-transition). Only wrap `renderTile`'s returned icon/content in `Reveal`, per
  tile, exactly like Mines does — never the tile button.
- Every game using this owns its OWN state-class vocabulary (`.tile.gem` for Mines is unrelated to
  whatever Battleship's `.tile.hit` needs) — `TileGridProps.tileClassName` is the escape hatch,
  `TileGrid` itself only renders the shared skeleton (grid layout, button semantics, `data-idx`).

### 3b. `modules/casino/components/Card.tsx` + `Felt.tsx`

`Card`: a single playing card, `rank`/`suit`/`faceDown` props. Suit glyphs (`♠♥♦♣`) are the ONE
allowed non-Lucide, non-`rc:` mark per HANDOFF §6.9 — render them as literal characters, colored
red/black by suit, never as an icon-registry entry. Grep `agent-ui.js`'s card-reading adapters
(blackjack/videopoker/baccarat/threecard/casinowar/reddog — search `.rank-top`) for the exact
class the agent reads rank from (**`.rank-top` must survive** — HANDOFF §2b's compound-selector
list: `#playerCards .card`, `#dealerCards .card:not(.back)`, `.rank-top`) — this is the single
highest-risk detail in the whole card-game bucket, since `.rank-top`'s *text content* is what the
agent parses as the card's rank. Reuse Holdem's card rendering as a starting reference (it already
solved the flip/face-down 3D-transform rule from HANDOFF §6.7 — dedicated `preserve-3d` child,
glow on the wrapper, never the rotating face — don't re-derive that, copy the working pattern).

`Felt`: the green-table background wrapper card games sit on (a styling shell, not logic).

**Wave 2 verification**: no game consumes these yet — verification is that `TileGrid`/`Card`
compile clean, and a throwaway smoke render (Storybook-less: just temporarily render one inside
the existing dev sandbox `web/src/dev/ShimTestPage.tsx`, or skip if that's disproportionate) shows
correct DOM order and class application. Real verification happens in Wave 3/4 when a real game
consumes them against its adapter.

---

## 4. Per-game verification protocol (every wave)

Matches DEVELOPMENT_GUIDE §7 / HANDOFF §4's "after each game, run its adapter's `detect()` and one
real agent round":

1. `npx tsc -b --noEmit` clean.
2. Extend `dom-contract.spec.ts` with a describe block for the new game: every selector its
   adapter touches must be present + usable (reuse the existing `expectUsable` helper), and any
   `window.<Name>API` must be removed on route-unmount (copy the Holdem pattern).
3. `npm test` (the 43-test deterministic suite) stays green — no regressions in games ported
   earlier in the phase.
4. Where a `window.*API` is involved, or the game has genuine multi-step round state (Coinflip,
   RPS, and everything in Waves 3-5), a live-Ollama smoke round (`npm run test:live`-style, one
   round, not the full suite) is the real proof — expensive, so batch it: run once per WAVE across
   all that wave's games in one Ollama session, not once per game.

## 5. Out of scope for this document

Waves 3-6's per-game DOM-contract detail (grep each adapter when that wave starts, per §0). Sound
design, lobby redesign, `layoutId` transitions — still Phase 4, unchanged from Phase 1/2's own
out-of-scope notes.
