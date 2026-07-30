# Phase 4 — UI Remake (Lobby)

Follows `PHASE_3_GAMES_PLAN.md` (paused mid-Wave-4 by request — see its own STATUS block). Starts
HANDOFF §4 Phase 4 ("Polish & the billion-dollar pass") at its most concrete, well-defined piece:
the lobby, which is still the literal Phase 0 spike version (`Lobby.tsx`'s own subtitle still
reads "Phase 0 spike — three tables, one very opinionated robot").

---

## 0. Scope decision — shared-element transitions, NOT attempted this pass

HANDOFF §7 calls out `layoutId` lobby→game shared-element transitions as a big "reads as
expensive" win. **This pass does not attempt true Framer Motion `layoutId` magic-move
transitions between the lobby card and the game page**, and here's the reasoning, so nobody
re-discovers this mid-build and makes an ad-hoc call:

A `layoutId` shared-element transition fundamentally requires `AnimatePresence` to keep the
OUTGOING element (the lobby) mounted long enough for Framer to interpolate its position/size into
the INCOMING element (the game). But `routes.tsx`'s `<Screen key={route} route={route} />` is
deliberately keyed for **synchronous, immediate unmount** — its own comment says so: *"this is
what guarantees `window.HoldemAPI` is torn down when you leave Hold'em."* Every `window.*API`
attach/detach pattern built across Phase 3 (`HoldemAPI`, `CoinflipAPI`, `RPSAPI`, `KenoAPI`,
`MolesAPI`, `SnakesAPI`, `BattleshipAPI`) depends on that immediacy — HANDOFF §2b's own rule: *"a
stale API makes `detect()` return true on the wrong route."* Wrapping the route switch in
`AnimatePresence` to enable a shared-element transition would delay every one of those teardowns
by the animation's duration, reopening exactly the failure class the whole agent-contract testing
effort exists to prevent, for a purely cosmetic gain.

**What this pass does instead**: consistent iconography/color continuity (the same icon+accent
color appears on the lobby card and the game's `PageHead`, so the eye tracks a clear visual
throughline even without literal geometric interpolation) plus a quick, independent entrance on
each side (`Reveal`/`Stagger`, already built, contract-safe). If a future pass wants true
shared-element transitions, it needs a routing redesign that decouples API teardown (synchronous,
in a `useEffect` cleanup that fires the instant a component starts unmounting) from visual unmount
timing (deferred by `AnimatePresence`) — that's real, separate design work, not a Lobby.tsx detail.

---

## 1. `GameMeta` — extend with `tag` and `provider`

Legacy `js/app.js`'s `GAMES` array carries two fields the current `GameMeta` type
(`modules/casino/games/registry.ts`) doesn't yet have:

- **`tag`**: a short payout/hook string shown on the card (e.g. `"Up to 1000×"`, `"Cash out
  anytime"`, `"Streak"`). Pull verbatim from `js/app.js`'s `GAMES` array per game.
- **`provider`**: which of three groups a game belongs to — `"Royal Live"`, `"Royal Originals"`,
  `"Royal Slots"`. Also pull verbatim.

Add both as required fields on `GameMeta`, populate for all currently-ported games (Dice, Mines,
Hold'em, Limbo, RPS, Coinflip, Tower, Keno, Battleship, Moles, Snakes — 11 total; check
`registry.ts` for the exact current list, more may have landed).

## 2. Categories — verbatim from `js/app.js:42-46`

```js
const CATEGORIES = [
  { key: "live",      label: "Live Table Action",    icon: "spade",  ids: [...] },
  { key: "originals", label: "Stake-Style Originals", icon: "zap",   ids: [...] },
  { key: "slots",     label: "Slots",                 icon: "cherry",ids: [...] },
];
```

Reproduce this structure (a `CATEGORIES` const, colocated with `GAMES` in `registry.ts` or in
`Lobby.tsx` itself — pick whichever reads cleaner). **Only render a category section if it has at
least one game that's actually built** (`GAMES.some(g => category.ids.includes(g.id))`) — most
category members don't exist as React routes yet (Phase 3 Waves 4-6 are the rest), and an empty
"Slots" section with zero cards would look broken, not aspirational. A one-line code comment
explaining why empty categories are hidden (Phase 3 still in progress) is enough; don't build a
"coming soon" placeholder system for this pass, that's scope creep.

## 3. Lobby.tsx redesign

- Page head: keep it simple, drop the "Phase 0 spike" subtitle for something real (e.g. balance
  summary, or just a clean title — this isn't the interesting part).
- One section per non-empty category: label + icon (from `CATEGORIES`), a card grid beneath.
- **Card redesign** (currently a bare bordered box with name+desc): icon badge (accent-colored,
  using `Icon` from the registry — never guess a name, use `GameMeta.icon`), the `tag` as a small
  pill/badge, name, desc, accent-colored glow/border on hover. Build on the existing `.glass`
  tokens and elevation system (`--lift-1`/`--lift-2`), don't invent a new visual language.
- Entrance: wrap the card grid in `Stagger` (built in Phase 1, this is close to its first real
  application at scale) — capped stagger per `MAX_STAGGER_TOTAL`, already enforced by the
  primitive itself, nothing to configure here beyond using it.
- Keep `data-nav={g.id}` and the `navigate(g.id)` click handler exactly as-is — HANDOFF §2b rule 4
  contract, `dom-contract.spec.ts`'s navigation tests depend on it.

## 4. Verification

- `npx tsc -b --noEmit` clean.
- `npm test` — the existing navigation-contract tests in `dom-contract.spec.ts` (`a [data-nav]
  element exists for every game, on every route`, `[data-nav] survives sidebar collapse`) must
  keep passing unchanged — the redesign must not touch `data-nav`/`navigate()` semantics.
- Manually check (dev server) that hidden empty categories actually stay hidden and non-empty ones
  render every currently-built game exactly once (no game missing, no duplicate).

## 5. Out of scope for this pass

True `layoutId` shared-element transitions (§0). Search/filter UI (legacy's `lobbyFilter` exists
but is a bigger feature — separate pass if wanted). Sidebar redesign (already reasonably polished
from Phase 1, not broken, not part of "the lobby"). Sound design. The remaining Phase 3 game
waves (tracked in `PHASE_3_GAMES_PLAN.md`'s STATUS block, untouched by this work).
