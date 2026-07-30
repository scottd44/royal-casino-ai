# Game Port + UI Tracker

Living document. Update the two status columns as work lands — this is the "so we can continue
later" record the user asked for. Two dimensions per game, tracked separately because they're not
always the same event:

- **Port**: does a React version exist, wired into `registry.ts`/`routes.tsx`, with its agent
  adapter's DOM contract verified (`dom-contract.spec.ts` describe block, `npm test` green)?
- **UI**: does it consume the platform primitives properly — `platform/ui` (Button/Panel/Stat),
  `platform/motion` (AnimatedNumber/Reveal/Stagger where it fits), `platform/icons` (no guessed
  names), and for card/grid games specifically, `Card`/`Felt`/`TileGrid`?

For every game ported from Wave 1 onward, **Port and UI landed together** — every dispatch brief
since Phase 2's game-refactor pass has required full platform-primitive consumption as a condition
of "done," not a follow-up pass. So for those games UI is not a separate backlog item; it's already
built in. The one exception is the original Phase 0 spike trio (Dice/Mines/Hold'em), which got its
dedicated motion+icons UI pass in Phase 2 — also already done. **Practically: "Port" and "UI" will
read identically for every row below unless something specific is flagged in Notes.**

---

## Done (25/25 ported, UI included — all games complete as of Batch E, 2026-07-29)

First 11 landed pre-Phase-4; Batches A-E (14 more, tracked further down) finished the rest.

| Game | Port | UI | Notes |
|---|---|---|---|
| Dice | ✅ | ✅ | Phase 0 spike + Phase 2 motion/icons pass |
| Mines | ✅ | ✅ | Phase 0 spike + Phase 2 motion/icons pass; `TileGrid`'s reference pattern |
| Hold'em | ✅ | ✅ | Phase 0 spike + Phase 2 motion/icons pass |
| Limbo | ✅ | ✅ | Wave 1 |
| Coinflip | ✅ | ✅ | Wave 1 — `window.CoinflipAPI` |
| RPS | ✅ | ✅ | Wave 1 — first real use of hand-drawn `rc:rock/paper/scissors` icons |
| Tower | ✅ | ✅ | Wave 3 — row-grouped, deliberately skips `TileGrid` (see its own file comment) |
| Keno | ✅ | ✅ | Wave 3 — first real `TileGrid` consumer, 40-tile board |
| Battleship | ✅ | ✅ | Wave 3 — real board is 5×5 (legacy engine), not 6×6 as the original brief guessed |
| Moles | ✅ | ✅ | Wave 3 — `.mol-hole`/`.done` class vocabulary via `TileGrid`'s `tileClassName` |
| Snakes | ✅ | ✅ | Wave 3 — 12-tile ring, deliberately skips `TileGrid` (no index-click contract) |

Shared primitives built and ready: `TileGrid`, `Card`, `Felt` (`modules/casino/components/`).

## Lobby (Phase 4) — ✅ done

Category-sectioned redesign (Live Table Action / Stake-Style Originals / Slots, verbatim from
`js/app.js`'s `CATEGORIES`), richer cards, `Stagger` entrance. `GameMeta` extended with
`tag`/`provider`, both verified against `js/app.js:14-40` line by line. True `layoutId`
shared-element transitions deliberately NOT attempted — see `PHASE_4_UI_REMAKE_PLAN.md` §0 for why
(conflicts with the synchronous-unmount contract every `window.*API` game depends on).
Verified: `tsc` clean, `npm test` 86/86 (including both navigation-contract tests unchanged).
Today's render: `live` section shows 1 card (Hold'em only), `originals` shows 10, `slots` hidden
(no slot game ported yet) — will fill in as later batches land.

Note for future UI work: `.glass` in `index.css` is declared OUTSIDE any `@layer` block, so under
CSS cascade-layer rules it unconditionally beats any Tailwind `hover:` utility (those live in
`@layer utilities`), regardless of specificity or source order. Don't reach for `:hover` to
override a `.glass`-based background/border/shadow — drive the state from JS (`useState` +
inline style + a plain CSS `transition`) instead, as `Lobby.tsx`'s `GameCard` now does.

## Batches A-E (14 games) — all done, see final status below

Pace: **3 at a time**, in the batches below. Update this table's Port/UI columns as each batch
lands; don't reorder rows, just flip status so the history stays legible.

| Batch | Game | Port | UI | Shared primitive | Adapter (`agent-ui.js`) |
|---|---|---|---|---|---|
| A | Blackjack | ✅ | ✅ | `Card`/`Felt` | Wave 4 — first real `Card`/`Felt` consumer; refs-based round state (deal/hit/stand/double all read-then-write the same hand synchronously, Holdem/Mines pattern); beginner-mode strategy hint (bjHint/bjBeginner) skipped, not in the DOM contract |
| A | Video Poker | ✅ | ✅ | `Card`/`Felt` | agent-ui.js:464 — its window global is `window.VideoPokerGame` (`{ evaluate }`), NOT `window.VideoPokerAPI` like every other card game's sibling global; this is a pre-existing type contract already compiled into `agentUi.ts` (`VideoPokerGameType`, `declare global`), not a naming choice made during this port. `evaluate(cards: {rank,suit:{s}}[])` is assigned to `window.VideoPokerGame` as a PLAIN assignment (no `as unknown as` cast, unlike every other `window.*API` in this codebase) specifically so `tsc -b` checks it for real against agentUi.ts's declaration — confirmed clean. Round state (hand/held/phase/deck) lives in refs, same discipline as Blackjack; each card slot's `Reveal` is keyed by a per-slot monotonic generation counter (not array index, contrast Blackjack) so both a fresh deal AND a draw-replacement genuinely remount that slot's card, while a held card doesn't |
| A | Hilo | ✅ | ✅ | `Card`/`Felt` | agent-ui.js:793 — ace is LOW (`rankOf`), odds `chHigher=(14-r)/13`/`chLower=r/13` ported verbatim; `lowerBtn` was genuinely missing from `contractIds.ts` (only `higherBtn`/`hiloCard`/`hiloMsg` were transcribed) — added it, since the adapter does click `#lowerBtn` (agent-ui.js:848) |
**Batch A fully verified together (independent re-run after all three landed)**: `tsc -b --noEmit`
clean, `npm test` **106/106** — no regressions across any earlier game.

| B | Baccarat | ✅ | ✅ | `Card`/`Felt` | agent-ui.js:1102 — `detect()`'s second half is `document.querySelector("[data-side]")`, a data-attribute selector (not an id, not in `contractIds.ts`); three `Button`s carry `data-side="player"/"banker"/"tie"` and are clicked BEFORE `applyBet()`/`#bacDeal`. Third-card table (baccarat.js:30-38/44-48) ported verbatim, incl. the banker-depends-on-player's-3rd-card-VALUE branch. Round state is plain `useState` (not refs like Blackjack/Mines) since a coup is one atomic pure function, never a read-then-write mid-click sequence; only the 340ms card-by-card reveal timer needs a ref for unmount cleanup. |
| B | Three Card | ✅ | ✅ | `Card`/`Felt` | agent-ui.js:1126 — `rank3`/`cmp3`/`resolve`/`qualifies` (threecard.js:28-48) ported verbatim, incl. straight-beats-flush category order and the A-2-3 wheel straight; dealer qualifies on Queen-high (`score[0]>0 \|\| score[1]>=12`). `window.ThreeCardGame._t = { rank3, cmp3 }` — nested `_t`, a pre-existing type contract in `agentUi.ts` (`ThreeCardGameType`), plain (uncast) assignment so `tsc` really checks it. `#tcpFold` was missing from `contractIds.ts`, added. **Agent for this game hit a session-limit interruption mid-run (account-level, not a code defect) — file was already complete on disk when that happened; verified independently by direct source diff against `threecard.js` rather than trusting a completion report.** |
| B | Casino War | ✅ | ✅ | `Card`/`Felt` | agent-ui.js:1177 — real bug found in independent verification: legacy's `#warP`/`#warD` (casinowar.js:60/62) are permanent card-container ids required by `detect()`, but the port's `Seat` component never threaded an `id` prop onto them — `detect()` would have silently failed for every real agent run. Fixed by adding `id="warP"`/`id="warD"` to the two main-hand `Seat` instances (CasinoWarGame.tsx). `#warWarRow`'s inline-style-only contract (`style={{display:'flex'}}`, never a class) was already correctly implemented and documented. **Agent for this game also hit a session-limit interruption mid-run — file was complete on disk; the `#warP` bug was caught by this session's own independent `npm test` run, not by the agent.** Also fixed 2 test-only bugs in `dom-contract.spec.ts`'s Casino War describe block: tight synchronous `.click()` loops hunting for a probabilistic tie never yielded to the microtask queue, so a real (React-18-deferred) DOM commit could be missed entirely — added `await Promise.resolve()` after each click in the loop. Not a game bug: the real agent only ever does one click then `await waitFor(...)`, which polls with real gaps, so this never affected actual agent play. |
| **Batch B fully verified together**: `tsc -b --noEmit` clean, `npm test` **123/123** — no regressions across any earlier game or batch. |
| C | Red Dog | ✅ | ✅ | `Card`/`Felt` | agent-ui.js:1201 — verbatim port of the deck/spread/raise logic; same `#rdActRow` inline-style-only landmine as Casino War's `#warWarRow`, correctly implemented (`style={acting?{display:'flex'}:undefined}`, never a class). Round state in refs, `repaint()` tick. Reviewed directly, no issues found. |
| C | Plinko | ✅ | ✅ | own canvas renderer (first in the React build) | agent-ui.js:1384 — payout `TABLES` (per rows×risk) ported verbatim. Real Track A/B split: `decideDrop()` resolves the full outcome synchronously up front (peg decisions, slot, multiplier, cheat-rig), `#ballsLive` gets a raw synchronous `textContent` write the instant the click handler returns (agent's first poll has zero `await` before it), then resolution (payout/history) is a plain `setTimeout(LAND_MS)` — never gated on the separate rAF loop that only animates the ball for a watching user. **Real bug found and fixed in review**: `#ballsLive`'s span rendered a literal `{0}` in JSX while `writeBallsLive()` mutated its `textContent` directly — any unrelated re-render (e.g. the bet field's `onChange`) would reconcile it back to the frozen JSX value, silently zeroing the count while a ball was still in flight. Fixed by mirroring the raw write into real state (`ballsLiveView`) so later re-renders stay in sync without touching the synchronous-write guarantee. |
| C | Crash | ✅ | ✅ | own canvas renderer | agent-ui.js:724 — real Track A/B split: `fire()` draws the crash point (`genCrashPoint()`, cheat rig verbatim) then inverts `liveMultiplier` algebraically (`elapsedMsForMultiplier`) to arm plain `setTimeout`s for crash-resolution and auto-cash-out, never gated on rAF; `#crashStage`'s `data-state` moves idle→running→crashed→idle entirely off those timeouts. `#autoInput` correctly uncontrolled (ref + defaultValue) to match the agent's raw `.value=` write with no dispatched event. Reviewed directly: correct. Given a visual-polish pass on top (dynamic stage glow/vignette by round state, glowing multiplier text) since it read as a near-1:1 reskin of legacy's chart otherwise — see note below. |
| **Batch C fully verified together**: `tsc -b --noEmit` clean, `npm test` **137/137** — no regressions across any earlier game or batch. |

**Visual-quality note (user feedback, 2026-07-28/29):** card games (Baccarat/Three Card/Casino War/Red Dog, all built on `Card`/`Felt`) are confirmed good. The canvas games are the category most likely to read as "reskinned legacy" rather than a real UI upgrade — Crash got a direct polish pass in review (state-driven stage glow/vignette, glowing multiplier). Every Batch D brief led with this feedback verbatim plus concrete visual direction, and all three delivered real craft (see notes below) — no reskins this batch. Dice/Mines/Hold'em (Phase 2's lighter "motion + icons only" pass, no real layout rework) are still flagged as the next dedicated redesign target, not started yet.

| D | Wheel | ✅ | ✅ | own canvas renderer (SVG wedge wheel) | agent-ui.js:927 — `RISKS`/`buildSegments` (incl. Fisher-Yates layout shuffle) ported verbatim, real per-spin fairness math preserved. Track A/B split: `settle(idx)` resolves via plain `setTimeout(SPIN_MS+100)`, never gated on the CSS spin transition. Real SVG wheel (30 path wedges), metallic hub, weighted diamond pointer, GSAP-`power4.out`-approximating cubic-bezier spin, thunk/shake settle feedback, tiered risk buttons with real payout coloring. Reviewed directly, no issues found. |
| D | Chicken Road | ✅ | ✅ | own canvas renderer (camera-follow road) | agent-ui.js:986 — `multAfter`/`DIFFS` ported verbatim. `#chkDiff` correctly uncontrolled (ref + defaultValue), read raw at `start()` — matches the agent's event-free `.value=` write. Track A/B split: `crossed++`/stat updates land on plain `setTimeout` (380ms safe / 320ms crash), never on animation completion. Legacy's camera-follow trick (token as scrolling-track child, transform composition) ported faithfully with a real Framer spring; per-lane risk-color ramp, staggered car loops, chicken-as-character hop/splat/cheer reactions. Reviewed directly, no issues found. |
| D | Slots | ✅ | ✅ | own reel-strip pattern (first slot game) | agent-ui.js:360 — 7-symbol weighted table + `evaluate()`'s triple/pair logic ported verbatim (own `Symbols.tsx` module, hand-drawn SVG art per symbol — no emoji/font dependency, legacy's CSS symbol classes aren't available in this build so this had to be built from scratch). Track A/B split: three staggered `setTimeout`s (600/1020/1440ms, verbatim `600+i*420`) are the only thing that resolves the round; CSS reel-scroll transitions ride the same schedule but never gate it. Real machine housing (bezel, marquee, backlit recessed reel bed), overshoot reel-stop bounce, per-reel/payline win glow, real paytable with symbol art. Reviewed directly, no issues found. |
| **Batch D fully verified together**: `tsc -b --noEmit` clean, `npm test` **149/149** — no regressions across any earlier game or batch. |

| E | Gems | ✅ | ✅ | own reel-strip pattern (grid, not reels) | agent-ui.js:380 — `detect()` is `#gemSpinBtn && #gemGrid`; `play()` just clicks spin and polls up to 5s for re-enable, no mid-round numeric contract. `SYMBOLS`/5-line evaluation ported verbatim from gems.js. Track A/B split identical to Slots: `finish()` resolves synchronously off a plain timer, CSS reveal never gates it. Real hand-drawn SVG gem art (`Symbols.tsx`) — six genuinely different cut shapes (round brilliant, star-cut, cabochon, crystal cluster, oval cabochon, step-cut), not six recolors of one polygon, so the grid reads distinct from Slots' reel art per gems.js's own "deliberately different" comment. |
| E | Roulette | ✅ | ✅ | own board + SVG wheel, `window.RouletteAPI` | agent-ui.js:556 — `detect()` is `#board && window.RouletteAPI`; the agent drives the game entirely through `RouletteAPI.{placeBet,clearBets,spin,isSpinning,total}`, never clicks the board directly. `ORDER`/`colorOf`/`payoutFor`/`oddsRatio` ported verbatim from roulette.js. `RouletteAPI` assigned as a plain (uncast) object matching the pre-existing `RouletteAPIType` in `agentUi.ts`. Track A/B split matches Wheel/Crash/Plinko: `spin()` resolves the pocket synchronously, `settle()` fires on a plain `setTimeout(4100ms)`, never gated on the wheel's CSS/SVG transition. Real 3×12 felt board with correct red/black/green coloring and column/dozen/outside zones, SVG wheel (37 wedges, metallic rim/hub, radial dividers) with a real traveling ball via the legacy counter-rotation trick, gold chip-stack badges that layer with stake size. |
| **Batch E fully verified**: `tsc -b --noEmit` clean, `npm test` **159/159** — no regressions across any earlier game or batch. **All 25 games now ported.** |

**Platform redesign batch, 2026-07-29 (later same day):** User filed a 9-item UI/UX punch list.
Hold'em's two bugs (no raise-sizing control, "Your hand" overlapping the seat box) were fixed first,
standalone. The rest was split into 6 disjoint-file groups and dispatched to 6 parallel
`react-component-builder` agents (no file overlap between groups, so no merge risk):

1. **Lobby grid + Tower/Battleship zoom** — lobby tile width/height inconsistency was a real bug:
   `Stagger`'s per-item wrapper `motion.div` is the actual grid item, but `GameCard`'s `<button>`
   had no `w-full`, so Chromium sized it by shrink-to-fit content instead of stretching — fixed with
   `w-full` + `min-h-[176px]` + `truncate`/`whitespace-nowrap` guards. Tower (hand-rolled tiles, not
   `TileGrid`) needed actual tile-size bumps (52px→68px), not just a container cap; Battleship
   (`TileGrid`, percentage columns) just needed its wrapper's `max-w` raised, Mines'-cap-style.
2. **Card games overhaul + blank-card bug (HIGH PRIORITY)** — real root cause, NOT the `Reveal`-key
   pattern the prior audit (below) checked: `GameLayout`'s `1fr` grid track has an implicit
   `minmax(auto, 1fr)` floor, so a wide card row refuses to shrink and pushes the second `Panel` past
   the viewport, silently clipped by `.app-main`'s `overflow-x: hidden` — worse mid-flip since a
   card's rendered width oscillates a few px through the 3D rotation, so a card sitting at the
   boundary can render its back then get clipped exactly as the layout tips over. Confirmed
   pre-existing at 1024px in Baccarat/Three Card even at the OLD card size. Fixed from inside the 7
   card-game files (`min-w-0` on each game's felt `Panel`, since shared `Panel.tsx` was out of this
   agent's scope) rather than the shared layout file. Card `lg` size bumped 80×112→96×136 in
   `Card.tsx` (the `md` size Hold'em uses was left alone), Video Poker switched from `md` to `lg`,
   every card row got `flex-wrap` as a second safety net.
3. **Canvas games polish** — Plinko's "too vertically stretched" was a fixed-`height:460` stage that
   only read as landscape at wide viewports; now `ResizeObserver`-driven (`clamp(260, width/1.45,
   460)`), landscape at every width. Wheel got a real dimensional SVG pointer (was a flat rotated
   square) plus a fixed rim-bulb ring with idle twinkle + spin-chase lighting. Chicken Road's hop was
   ALREADY a genuine animated arc (spring + squash-stretch), not a teleport as the brief assumed —
   polished further with added rotation + a shrink/recover ground shadow.
4. **Limbo overhaul** — added a Dice/Crash-style console housing around the multiplier readout plus
   a target gauge bar whose "cleared" color is an HONEST signal (derived from the already-drawn
   `result` crossing `roundTarget` mid-climb, not a fake tease), a resolution pulse/shake, and reused
   the global `payout()` → `celebrate()` confetti wiring rather than adding a second one. Caught and
   fixed a duplicate-React-`key` warning along the way.
5. **RPS rebuild (Rainbet-style)** — reframed the EXISTING streak-track data (no new game rules) as
   a horizontal opponent board: live opponent as "Now," past opponents trailing with win/loss badges,
   ghost slots hinting more ahead. Player's throw is now the sole centered focal point. Added a real
   wind-up/overshoot/settle throw animation to the existing `rc:rock/paper/scissors` marks — no new
   icon assets needed.
6. **Roulette wheel rework** — the "diamond indicator" was the winning-pocket pointer itself (a
   rotated gold square floating above the rim) — redesigned into a gem+chevron marker seated into the
   bezel that pulses on result, added a 28-bulb rim-lighting ring, brushed-metal depth layering, and
   real two-phase ball physics (fast fling to the rim track, then a decelerating inward spiral into
   the pocket) — previously a fixed-radius orbit the whole spin.

Every group verified independently via `tsc -b --noEmit` + its own Playwright screenshot pass (not
`npm test`, to avoid 6-way port contention on the shared dev server) before reporting back; the full
159-test suite was then re-run once, standalone, after all 6 landed — **159/159, zero regressions.**
No `window.*API` shape, DOM contract id, or click-target structure was touched by any group — every
change was visual/layout/animation only.

**Session-limit recovery, 2026-07-29:** Five dispatched agents (scroll-overflow audit, card-flip
re-check, Moles UI remake, Keno tile clarity, Snakes UI rework) were killed mid-run by a session-limit
API error before any left a completion report. Reviewed each by hand:

1. **Lobby reverted to the Phase 0 spike** (separate, higher-priority bug the user flagged directly,
   not one of the five agents) — `Lobby.tsx` was still the flat single-grid Phase-0 version (literal
   "Phase 0 spike" subtitle) even though `registry.ts` already had the full Phase 4 `CATEGORIES`/
   `tag`/`provider` data sitting unused. Rebuilt `Lobby.tsx` per `PHASE_4_UI_REMAKE_PLAN.md` §1-3:
   category sections, `GameCard` with icon badge + tag pill + hover glow (JS-driven per index.css's
   `.glass`-beats-`:hover` note), `Stagger` entrance. `tsc -b --noEmit` clean, `npm test` 159/159.
2. **Moles UI — real bug found and fixed**: `holeClassName()`/`renderHole()` reference
   `mol-pop`/`mol-hit-shake`/`mol-bust-shake`/`mol-bust-flash`, but none of the four were defined
   anywhere in the build (no scoped `<style>` block like Mines/Wheel have for their equivalent
   classes) — every whack/bust animation was a silent no-op. Added the missing scoped keyframes to
   `MolesGame.tsx`, mirroring `MinesGame.tsx`'s own convention exactly (incl. `prefers-reduced-motion`
   guard). Rest of the file (glow/bevel treatment, bust shake+flash wiring) was already solid.
3. **Keno tile clarity** — already fixed and thorough on inspection: `.hit` gets solid fill + ring +
   glow + a checkmark badge, `.miss` gets the equivalent treatment in the loss register (red fill +
   ring + glow + X badge) so wins/losses read as equally unmistakable. No further work needed.
4. **Snakes UI** — reviewed in full, no defects found (ring board on a `Felt` backdrop, real token,
   dice-pip readout, animated stats). Reads as a complete, polished implementation already.
5. **Card-flip blank bug** — spot-checked the audit note is genuinely in source (not just claimed in
   this tracker), e.g. `BlackjackGame.tsx`'s inline comment on its `Reveal` key. Trustworthy.
6. **Scroll-overflow audit** — ran a real Playwright sweep (all 26 routes × 5 viewport widths,
   1440/1280/1024/820/390) checking `document.scrollWidth`/`.app-main`'s `scrollWidth` vs.
   `clientWidth`. **Zero overflow at 1024px and up** — every game is clean at desktop/laptop/tablet
   widths, which is this app's whole documented target range. **Overflow appears only below ~820px**
   (confirmed broken at 390px, ~282px of content clipped by `.app-main`'s `overflow-x-hidden` on
   nearly every game) — root cause is structural, not a per-game bug: `AppShell.tsx`'s
   `.app-shell` grid always reserves the full `--sbw`/`--sbw-min` sidebar column with no
   viewport-width media query, unlike the legacy vanilla build's documented `body.sb-open` mobile
   drawer (`DEVELOPMENT_GUIDE.md` §3b, "One control per breakpoint... `#sbToggle` below 900px") —
   that responsive behavior was never ported to the React shell. Fixing this is a real
   `AppShell.tsx`/`Sidebar.tsx` feature (a mobile drawer breakpoint), not a per-game visual fix, and
   wasn't attempted this pass — flagged for the user rather than scope-crept into "fix a few px."

**Queued visual-bug fixes — resolved, 2026-07-29:**
1. Keno hit-tile visibility — fixed (glow/ring/scale on `.hit`, confirmed in source).
2. Mines grid zoom — fixed (`maxWidth: 420` cap on the grid, confirmed in source).
3. Crash rocket tilt — fixed (`Math.atan2`-based tilt restored, confirmed in source, no more "trimmed as polish" comment).
4. Card-flip blanking — audited all 6 remaining card games (Blackjack, Baccarat, Three Card, Casino War, Red Dog, Hilo) against the VideoPoker fix pattern (a `Reveal` remount-key bump racing a `faceDown`-only toggle). **None had the bug** — each has a structurally different reason it was already safe (index-stable `Reveal` keys across the toggle, or `faceDown` never actually toggled on a live card, or the generation ref only ever bumps alongside a genuinely new card). Documented with a short comment in each file, no logic changes. `tsc` clean, all 33 affected-game tests re-verified individually passing.

Wave 4 (card games) + Wave 5 (canvas games) + Wave 6 (reel/table games) — all complete. Every game
from `PHASE_3_GAMES_PLAN.md` §1's original 22-game list, plus the Phase 0 trio, is now ported with
DOM-contract verification and full platform-primitive UI.

**Before starting each batch**: grep that batch's adapters fresh (contracts are load-bearing,
don't trust a stale paraphrase — every prior wave found at least one detail worth verifying
against live source, e.g. Battleship's real board size).

**After each batch**: update this table, run `npm test` once all three have landed (checking no
concurrent test run first — shared dev-server port contention has caused false failures in every
wave so far), and note the actual passing count here.
