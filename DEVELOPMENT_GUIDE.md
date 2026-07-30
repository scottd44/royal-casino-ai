# Royal Casino — Development Guide

Everything you need to build on this app without breaking it. Read **§1 (architecture)** and
**§5 (the AI Lab DOM contract)** before you touch anything.

---

## 1. Architecture — zero-build, static, vanilla

There is **no framework, no npm, no bundler, no JSX, no routing library, no component system.**
This is plain HTML + one CSS file + vanilla-JS IIFE modules served as static files.

```
index.html          the shell: sidebar, top header, #view mount, all <script> tags
css/styles.css      the ENTIRE stylesheet (one file, token-driven)
js/core.js          Casino API — wallet, bet/payout, sound, rig, fx, shared UI factories
js/app.js           router + sidebar + lobby + VIP + Live Support + AI Guide pages
js/games/*.js       one IIFE module per game (25 of them)
js/agent/           the AI Lab: harness.js, agent-ui.js, agent-report.js, agent-lab.js
js/vendor/          vendored UMD libraries (GSAP, CountUp.js, canvas-confetti)
```

### Running it

```bash
python3 serve.py          # preferred — also serves /api/sysmon for the System monitor
# or
./START-HERE.command
# or
python3 -m http.server 8000
```

Then open `http://localhost:PORT`. **Do not add a server or a build pipeline.**

### The rules this imposes

| Rule | Why |
|---|---|
| No React / Vue / Svelte / Framer Motion / anything needing `npm install` | Nothing compiles these — they cannot run here |
| Libraries must load from a plain `<script>` (UMD) or `<script type="module">` (ESM) | There is no bundler to resolve `import` from `node_modules` |
| Prefer **vendoring** the single minified file into `js/vendor/` over a CDN link | The app is designed to run locally and offline |
| No `import` / `export` in app code | Every file is a classic script sharing one global scope |
| Every asset in `index.html` carries `?v=N` | **Bump it on every release** or browsers serve stale files. Currently **`v=66`** |

### Module pattern

Each game is an IIFE assigned to a `const`, exposing a `render(view)`:

```js
const DiceGame = (() => {
  function render(view) {
    view.innerHTML = `…`;   // inject markup + element IDs
    // wire listeners against view.querySelector(...)
  }
  return { render };
})();
```

`js/app.js` holds the `GAMES` array and swaps a game's `render(view)` into `#view`.

> **Gotcha:** `const Casino = …` at the top level of a classic script lives in the *script lexical
> scope*, **not** on `window`. Other scripts on the page see it fine; `iframe.contentWindow.Casino`
> is `undefined`. Use `window.<Name>API` if something outside the page must reach in (that is exactly
> why the games expose `window.HoldemAPI`, `window.MolesAPI`, etc.).

---

## 2. Vendored dependencies

All three are UMD, non-React, and load from a plain `<script>` tag. They are vendored so the app
works with no network.

| Library | Version | File | Global | Used for |
|---|---|---|---|---|
| [GSAP](https://gsap.com/docs/v3/) | 3.12.5 | `js/vendor/gsap.min.js` | `window.gsap` | Route transitions, staggered lobby/card reveals, micro-interactions |
| [CountUp.js](https://github.com/inorganik/countUp.js) | 2.8.0 | `js/vendor/countUp.umd.js` | `window.countUp.CountUp` | Wallet ticker, AI Lab telemetry counters |
| [canvas-confetti](https://github.com/catdad/canvas-confetti) | 1.9.2 | `js/vendor/confetti.browser.min.js` | `window.confetti` | Cash-out / jackpot bursts |
| [Lucide](https://lucide.dev/icons/) | 0.469.0 | `js/vendor/lucide.min.js` | `window.lucide` | Every icon in the UI |

They are loaded **before** `core.js` in `index.html`, each with the `?v=` cache-buster.

**Deliberately not used:** Chart.js and tsParticles. The AI Lab P&L chart is a hand-rolled,
DPI-crisp `<canvas>` renderer (`renderChart()` in `agent-lab.js`) with grid lines, a gold baseline,
a gradient area fill and a hover crosshair — Chart.js would add ~200 KB and lose the crosshair
readout for no gain. If you swap it in later, vendor the UMD build the same way and keep the
`#aiChart` canvas id.

### Icons — no emoji in the chrome

**Never use an emoji as an icon.** Emoji are OS-supplied bitmaps: they ignore `color`, ignore
stroke weight, can't take a gradient or a glow, and render as a different picture on macOS,
Windows, Android and Linux. Lucide ships stroke SVGs that inherit `currentColor`, so an icon
behaves like text as far as the design system is concerned.

```js
Casino.icon("wallet")            // -> '<i data-lucide="wallet" class="ico"></i>'
Casino.icon("crown", "ico-title") // extra class for larger, gold page-title icons
Casino.icons()                    // force a re-scan (rarely needed — see below)
```

Lucide replaces `<i data-lucide="…">` with an `<svg>`. Because the app rewrites `#view` with
`innerHTML` on every route change, `core.js` runs a `MutationObserver` that re-paints icons for
markup injected after load — **you do not need to call `Casino.icons()` yourself.** The observer
is re-entrancy guarded (`createIcons()` mutates the DOM) and schedules with `setTimeout`, not
`requestAnimationFrame`, so a backgrounded tab can't leave placeholders unrendered.

Sizing is per-context in the `ICONS` section of `styles.css` (`.btn .ico`, `.sb-ico .ico`,
`.ico-title`, …). Icons on lobby cards and sidebar rows inherit the game's `--accent`.

**Where emoji are still allowed:** card suits (`♠♥♦♣`) and dice pips (`⚀`–`⚅`) only. Everything
else — including slot reel symbols, gem faces, Mines/Tower tiles, the mole, the snake and the RPS
throws — is a drawn shape. The audit that keeps it that way:

```bash
# renders every game and fails on any emoji left in #view
for g in slots gems dice mines crash ... ; do
  chrome --headless=new --dump-dom "http://localhost:8000/index.html#$g"
done
```

**When no icon set has the mark you need, draw it — never guess a near-miss name.** Lucide has no
snake and no rock; `waves` renders a swimmer and a rounded-blob path reads as a coffee mug. Both
shipped. Raw inline SVGs live in the `RAW_SVG` registry in `core.js` under an `rc:` namespace
(`rc:snake`, `rc:rock`, `rc:paper`, `rc:scissors`) and flow through the same `Casino.icon()` call
sites, so the sidebar, page title, lobby card and in-game marks all draw from one definition and
cannot drift apart.

> The `GAMES` array in `js/app.js` still carries its original `emoji` property. It is **data, not
> presentation** — nothing renders it. Each entry also has an `icon` property (a Lucide name) and
> that is what the sidebar and lobby cards draw. Don't delete `emoji`; don't render it either.

### Adding another library

1. Confirm it is **not** React-based and ships a UMD or ESM browser build.
2. `curl -o js/vendor/<lib>.min.js <cdn-url>` — vendor it, don't hotlink.
3. Add `<script src="js/vendor/<lib>.min.js?v=N"></script>` to `index.html` **above** `js/core.js`.
4. Bump every `?v=` in `index.html`.
5. Wrap it defensively (see §3) so removing the tag degrades gracefully instead of throwing.

---

## 3. `Casino.fx` — the animation layer

`js/core.js` exposes `Casino.fx`, thin defensive wrappers over the vendored libraries. **Every
helper is a no-op / instant fallback when its library is missing or the user prefers reduced
motion.** Use these instead of calling `gsap` / `confetti` / `CountUp` directly.

```js
Casino.fx.reduced()                        // true if prefers-reduced-motion: reduce
Casino.fx.countTo(el, from, to, formatFn)  // tick a number (CountUp), or set it instantly
Casino.fx.burst("cashout" | "big" | "jackpot")   // confetti
Casino.fx.reveal(nodes, { y, stagger, delay })   // staggered entrance (GSAP)
Casino.fx.enter(el, { y })                       // fade/slide a container in (route change)
Casino.fx.press(el)                              // tactile click-down (returns the GSAP timeline)
```

`press()` is wired globally in `app.js` from the same capture-phase click handler that plays the
click sound, so every `.btn`, chip, tile and Lab control gets it — including "Start Agent" and every
game's bet button — without a single per-game listener. It is a two-stage timeline (0.09s bite to
0.95, then a sprung `back.out` release); a single `fromTo` is back at ~0.999 within 60ms and the eye
never catches it. `clearProps` hands the transform back to CSS so `:hover` keeps working.

Where each library is wired:

| Library | Wired in | What it drives |
|---|---|---|
| GSAP | `js/app.js` | Staggered lobby-card reveals, VIP/guide card cascades, game-view mount transitions |
| CountUp.js | `js/core.js` | Wallet balance ticks on every bet/payout |
| CountUp.js | `js/agent/agent-lab.js` | Live telemetry deck tiles |
| CountUp.js | `js/agent/agent-report.js` | Session-report figures count up from zero when the modal opens |
| canvas-confetti | `js/core.js` — `payout()` | Bursts scaled to the win: ≥15% of bankroll → cash-out, ≥40% → big, ≥150% → jackpot |
| canvas-confetti | `js/core.js` — `sound.play()` | A second trigger on `bigwin` / `cashout` so a small stake on a huge multiplier still celebrates |

Because both confetti triggers live in `core.js`, **all 25 games celebrate without a single game
module being edited.** `fx.burst()` throttles the two paths together (one burst per 700 ms).

### Three failure-mode rules learned the hard way

1. **Never animate a persistent mount point.** `#view` is never replaced, so a tween that stalls or
   is interrupted leaves inline `opacity`/`transform` on it — and the *entire app* renders blank.
   `fx.enter()` animates the container's **children** (destroyed on the next render, therefore
   self-healing) and `fx.resetMount()` is called before every route render. This exact bug shipped
   once; don't reintroduce it.
2. **Every hide-then-reveal arms a watchdog.** An entrance animation hides its targets first, so
   `fx.reveal()` / `fx.enter()` `setTimeout` a cleanup that strips the inline styles once the tween
   should be done. A no-op normally; a safety net when rAF is throttled (backgrounded tab, headless
   browser) or GSAP is missing. Staggers are capped at 0.6 s total so a 25-card grid can never keep
   content hidden for long.
3. **3D transforms: rotate a dedicated `preserve-3d` child, never the styled box.** The coin flip
   originally rotated a single face that also carried the box-shadow; at ~90° it went edge-on and
   the shadow read as a hard slice through the coin. The correct structure is
   `perspective` on the container → an untransformed scale target → a `preserve-3d` rotator →
   two absolutely-positioned faces with `backface-visibility: hidden`, the back pre-rotated 180°.
   Keep glows on the wrapper: a shadow on a rotating face will always clip when it turns edge-on.
4. **A stalled counter shows a *wrong number*, not just a missing animation.** `fx.countTo()` snaps
   to the true value after the expected duration, guarded by a per-element token so a stale
   watchdog can't overwrite a newer count. Never start counters inside `requestAnimationFrame` —
   rAF can be suspended indefinitely and the figures would stay at zero.

Motion is globally dialled down by a `@media (prefers-reduced-motion: reduce)` block at the bottom
of `styles.css`. Respect it — don't animate with `setInterval` to sidestep it.

---

## 3b. The application shell

The page **does not scroll**. `.app-shell` is a full-height CSS grid; `.app-main` is the only
scrolling region.

```
body                     height:100%; overflow:hidden
└ .app-shell             grid-template-columns: var(--sbw) 1fr; height:100dvh
  ├ .sidebar             grid cell, height:100%  (.sb-nav scrolls inside it)
  └ .app-main            height:100%; overflow-y:auto   ← the scroller
```

**Never make the sidebar `position: sticky`.** Sticky anchors to the nearest scroll container, and
*any* `overflow` on `html`/`body` silently promotes body to that role — at which point the sidebar
scrolls away with the document and its `100vh` background ends mid-page. That bug shipped three
times. A grid cell has no scroll to fall out of. For the same reason, horizontal overflow is
contained by `.app-main { overflow-x: hidden }`, **never** by `html, body`.

Consequences to remember:
- Scroll the pane, not the window: `document.querySelector(".app-main").scrollTo(...)`.
- Bottom clearance for the AI Lab dock lives on `.app-main`'s `padding-bottom` (agent-lab.js).
- The rail's width is animated by `grid-template-columns` on `.app-shell` — one transition on one
  property. Don't reintroduce `width`/`flex-basis` transitions on `.sidebar`; they race.

### Sidebar state

Two booleans, one writer:

| state | class | scope | persisted |
|---|---|---|---|
| `collapsed` | `body.sb-collapsed` | desktop icon rail | yes |
| `open` | `body.sb-open` | mobile drawer | no |

Everything goes through `setSidebar(patch)` in `app.js`. Nothing else may touch those classes — two
writers is what made the old buttons desync and freeze. JS only flips a class; **all** movement is
CSS. The click listener is registered once on `document` and matches with `closest()`, so it
survives any `innerHTML` rewrite and can't be double-bound.

One control per breakpoint, never both: `#sbCollapse` (chevron, in the rail) above 900px,
`#sbToggle` (hamburger, in the header) below. Their `display` rules are scoped
(`.topbar .sb-toggle`, `.sb-head .sb-collapse`) so they outrank `.icon-btn { display: inline-flex }`,
which sits later in the file and otherwise wins on source order.

---

## 4. The design system

Everything is driven from CSS custom properties in `:root` at the top of `css/styles.css`.
**Re-theming = evolving those tokens.** Restyling a shared component class updates all 25 games at
once — that is the whole efficiency story of this codebase.

### Tokens

```css
/* surfaces — midnight charcoal/slate, one step apart each */
--bg-0 #05070c   --bg-1 #090d14   --bg-2 #0e131d
--panel #121824  --panel-2 #182031
--line #232d40   --line-soft #19212f

/* text */
--text #eaf0fa   --muted #8792a8   --faint #58627a

/* accents — gold is THE brand accent; the rest are semantic only */
--gold #f0c24f   --gold-2 #ffdc86  --gold-deep #ab7f16
--green #22e59a  --red #ff4d6d     --blue #4d8cff   --purple #a97bff

/* neon halos — for glow/shadow only, never for text */
--glow-gold  --glow-green  --glow-purple  --glow-red

/* glassmorphism */
--glass  --glass-2  --glass-line  --glass-blur  --glass-panel

/* elevation */
--shadow-1 / -2 / -3   --ring   --radius / -sm / -lg

/* shell metrics */
--sbw (sidebar width)  --sbw-min  --topbar-h  --ease
```

### Design principles

1. **Never hard-code a hex** in new CSS. Use a token, or `color-mix(in srgb, var(--accent) 20%, transparent)`
   for accent-derived tints. Per-card accents come from the `--accent` custom property set inline
   from the `GAMES` array.
2. **Glass for anything that floats** — modals, the profile menu, toasts, the sidebar, the AI Lab
   dock, the agent HUD. The recipe is `background: var(--glass-panel)` +
   `backdrop-filter: var(--glass-blur)` + `border: 1px solid var(--glass-line)` + `--shadow-3`.
   Always ship the `-webkit-` prefix alongside `backdrop-filter`.
3. **Neon is glow, not fill.** Accent colour lives in `box-shadow` / `filter: drop-shadow`, hairlines,
   and 8–16% tinted backgrounds. Large saturated fills read cheap.
4. **Numbers use tabular figures.** Any money, multiplier or telemetry value gets
   `font-variant-numeric: tabular-nums` and slightly negative `letter-spacing`. There is a `.num`
   utility class for one-offs.
5. **Type — two faces, one rule.** `--font-ui` (Inter) for everything that reads as language;
   `--font-mono` (JetBrains Mono) for everything that reads as a *number*: balances, multipliers,
   bet fields, odds, telemetry, P&L. Fixed-advance digits stop values jittering as they tick, which
   is most of what makes a trading UI feel engineered rather than webby. Numeric readouts also carry
   a faint `text-shadow` bloom of their own colour so they look backlit.
   Cinzel is brand identity only — the wordmark and the hero `<h1>`. **Never put mono on prose**
   (that's why `.game-tag`, `.chat-time` and the guide tables are explicitly excluded).
6. **Depth is three layers, not one shadow.** `--lift-1/2/3` each combine a tight contact shadow,
   a wide ambient shadow and an inset top highlight. Glass panes use a translucent fill + a lit top
   rim (`.panel::before`) + `backdrop-filter`.
7. **Glass needs something behind it.** `backdrop-filter` over a near-black page blurs nothing and
   reads as a flat rectangle. Two fixed layers behind all content do that work: `body::before` is a
   slow-drifting aurora, `body::after` is fine SVG grain that kills gradient banding. Both are
   `position: fixed`, so they never reflow or repaint on scroll.
   **Blur is reserved for the few large panes** (`.panel`, modals, sidebar, dock). Game cards get the
   translucent fill but *no* `backdrop-filter` — 25 blurred layers is a real scroll cost for
   near-zero gain when the thing behind them is already low-frequency.
6. **Motion:** `--ease` = `cubic-bezier(0.22, 0.8, 0.28, 1)`. Hover lifts are `translateY(-4px…-6px)`
   over ~0.28s. Never animate `width`/`height`/`top`/`left` — use `transform` and `opacity`.

### Shared component classes

Style these, not individual games:

`.page-head` `.page-title` `.page-sub` · `.panel` · `.game-layout` · `.felt` ·
`.btn` + `.btn-green` `.btn-blue` `.btn-purple` `.btn-red` `.btn-gold` `.btn-ghost` `.btn-sm` `.btn-block` ·
`.stat-grid` `.stat` · `.field` `.input` `.bet-row` · `.bet-group` `.bet-input` `.bet-seg` (from `betFieldHTML()`) ·
`.switch` (slider toggle) · `.multiplier-tag` `.win-banner` `.history` `.pill` `.divider` `.hint` ·
`.report-overlay` `.report-card` `.howto-body` (modals) · `.toast` · `.game-card` `.cat-chip` (lobby)

---

## 5. 🔒 The AI Lab DOM contract — read this before restyling anything

The agent in `js/agent/agent-ui.js` **never sees game code**. It plays the same UI you do: it reads
the live DOM through per-game *adapters* and clicks real buttons. Those selectors **are** the API.

### The five hard rules

1. **Never rename, remove, or restructure an element `id`.** Adapters are ~95% id-based.
2. **Never remove a `data-*` attribute** an adapter reads: `[data-side]` (Baccarat), `[data-risk]`
   (Keno/Wheel), `[data-rows]` (Plinko), `[data-idx]` (Video Poker hold slots), `[data-bet]`
   (the ½/2×/Max segment), `[data-nav]` (navigation), `[data-compute]` (GPU/CPU).
3. **Never rename or delete a `window.*API` object:** `HoldemAPI`, `BattleshipAPI`, `MolesAPI`,
   `SnakesAPI`, `CoinflipAPI`, `RPSAPI`, `KenoAPI`, `RouletteAPI`.
4. **A `[data-nav="<gameId>"]` element for every game must exist in the DOM at all times.**
   `switchToGame()` navigates the agent by `document.querySelector('[data-nav="dice"]').click()`.
   The sidebar carries these — collapsing it only *visually* narrows the rail; the buttons stay
   mounted and clickable. Never render the game list conditionally, never unmount it on mobile
   (it is translated off-canvas, not removed).
5. **Keep the two-`.panel` game layout.** `agent-lab.js` injects the "🤖 Let AI play" button into
   `view.querySelectorAll(".panel")[1]` — the controls panel. The lobby hero must keep
   `.hero-actions` for the same reason.

### Before you restyle a game, do this

```bash
# find that game's adapter and note every selector it touches
grep -n "gameId: {" -A 60 js/agent/agent-ui.js
grep -oE '\$\("#[a-zA-Z0-9_-]+"\)|querySelector\([^)]*\)|window\.[A-Za-z]+API' js/agent/agent-ui.js | sort -u
```

Every `$("#…")`, `querySelector(...)`, `[data-…]`, `.click()` target and `window.*API` call in that
game's `detect()` and `play()` must survive. Restyle **classes and wrappers only**.

### Current adapter `detect()` hooks (the minimum that must exist on render)

| Game | Hooks | Game | Hooks |
|---|---|---|---|
| slots | `#spinBtn` `#reels` | baccarat | `#bacDeal` `[data-side]` |
| gems | `#gemSpinBtn` `#gemGrid` | threecard | `#tcpDeal` `#tcpPlayer` |
| blackjack | `#dealBtn` | casinowar | `#warDeal` `#warP` |
| videopoker | `#vpCards` `#drawBtn` | reddog | `#rdDeal` `#rdCards` |
| roulette | `#board` + `RouletteAPI` | battleship | `#bsDeal` `#bsGrid` |
| dice | `#rollBtn` `#slider` | moles | `#molGrid` + `MolesAPI` |
| mines | `#startBtn` `#grid` | coinflip | `#cfCoins` + `CoinflipAPI` |
| crash | `#placeBetBtn` `#crashStage` | rps | `#rpsTrack` + `RPSAPI` |
| limbo | `#limboBtn` `#targetInput` | snakes | `#snBoard` + `SnakesAPI` |
| hilo | `#higherBtn` `#hiloCard` | keno | `#knBoard` + `KenoAPI` |
| tower | `#towerGrid` `#towerStart` | plinko | `#dropBtn` `#plinkoStage` |
| wheel | `#wheelBtn` `#wheelStage` | holdem | `#hcControls` + `HoldemAPI` |
| chicken | `#chkCross` `#chkStage` | | |

> **Fixed in this release:** the `chicken` adapter's `detect()` required `#chkRoad`, which does
> not exist anywhere in the repo — `js/games/chicken.js` renders `#chkStage` / `#chkTrack`. It
> always returned `false`, so the agent could never play Chicken Road. Corrected to `#chkStage`.

### The Lab's own contract

`js/agent/agent-lab.js` is presentation and may be restyled — but **every control must keep its id
and keep writing to the same `RoyalAgent` setting**:

| Element id | Writes to |
|---|---|
| `#aggr` | `R.settings.aggression` |
| `#speed` | `R.settings.delayMs` |
| `#brainSlider` (+ `#brainStages [data-brain]`) | `R.setBrain(tokens, temp, label)` → `brainTokens` / `brainTemp` / `brain` |
| `#computeSeg [data-compute]` | `R.setCompute("gpu"\|"cpu")` |
| `#emotions` | `R.setEmotions(bool)` |
| `#modelSelect` | `R.setModel(tag)` |
| `#runN` `#profit` `#loss` `#sessionMin` `#breakEvery` `#breakFor` `#agentic` | the matching `R.settings.*` |
| `#labRun` `#labReport` `#labNewGame` `#labReset` `#labClear` `#labJSON` `#labCSV` | `R.play/stop`, `R.stopAndReport`, `R.forceNewGame`, `R.resetStats`, `R.clearSessionLog`, `R.exportJSON/CSV` |

Telemetry nodes that `agent-report.js` / `render()` update — `#labStats`, `#labGames`, `#aiChart`,
`#labLog`, `#labSys`, `#labPnl`, `#aiLabLive` — must keep their ids. **`#aiStatus` is written
directly by `agent-ui.js`'s `setStatus()`; never remove it or hide it from the DOM.**

The **3-stage Brainpower dial** is a presentation layer over the same continuous `#brainSlider`:
the stage buttons set the slider to `0` / `50` / `100` and call the same `applyBrain()` the slider
does. The dial maps `0–100 → 64–768` tokens exponentially with a paired temperature
(`0.8 → 0.35`); Instinct = 64, Sharp = 224, Deep = 768.

The **Live Agent HUD** (`#agentHud`) is purely additive. It renders existing `RoyalAgent` state
(`getLog()`, `getStats()`, `settings`) and its Quick Actions call the **same** `toggleRun()` /
`newGame()` / `openDrawer()` functions the drawer buttons do — one code path, no duplicated logic.
It adds no decision-making and touches nothing the adapters read.

---

## 6. Building a new game

1. **Create `js/games/<id>.js`** using the IIFE pattern, and add the `<script>` tag to `index.html`.
2. **Use the shared markup skeleton** so it inherits the theme for free:

```js
view.innerHTML = `
  <div class="page-head">
    <h2 class="page-title">🎲 My Game</h2>
    <p class="page-sub">One-line explanation of the game.</p>
    ${Casino.helpBtnHTML("myGameHelp")}
  </div>
  <div class="game-layout">
    <div class="panel"><!-- the board / felt / stage --></div>
    <div class="panel">
      ${Casino.betFieldHTML(20)}          <!-- gives you #betInput + [data-bet] -->
      <div class="stat-grid">…</div>
      <button class="btn btn-block" id="myGoBtn">PLAY</button>
    </div>
  </div>`;
Casino.wireBet(view, onBetChange);
```

   The **second `.panel` must be the controls panel** — that is where the AI-play button is injected.

3. **Register it in `js/app.js`** by adding an entry to `GAMES` (`id`, `emoji`, `name`, `desc`,
   `tag`, `accent`, `provider`, `render`) and putting its `id` in the right `CATEGORIES` group.
   The sidebar link, the lobby card, and its `[data-nav]` hook are generated from that.
4. **Use the Casino API** for money — never mutate a balance yourself:
   `Casino.bet(n)` / `Casino.payout(n)` / `Casino.getBalance()` / `Casino.fmt` / `Casino.money`.
5. **Honour the rig.** Call `if (Casino.cheat.win()) { …force a favourable outcome… }` at the point
   the result is decided, so the 😈 toggle works everywhere.
6. **Play the standard sounds** — `click`, `tick`, `win`, `bigwin`, `cashout`, `lose`. `bigwin` and
   `cashout` also trigger confetti automatically.
7. **Bump every `?v=` in `index.html`.**

### Making it AI-playable (optional)

Add an adapter to `js/agent/agent-ui.js` with `detect()`, `play(ctx)`, and a fallback heuristic —
and then **treat every selector you used there as frozen.** For games whose state is hard to read
from the DOM, expose a small read-only `window.<Name>API` (as Holdem, Moles, Snakes, Coinflip, RPS,
Keno and Battleship do) rather than scraping fragile markup.

---

## 7. Release checklist

```bash
node --check js/core.js js/app.js            # syntax-check anything you edited
for f in js/*.js js/agent/*.js js/games/*.js; do node --check "$f" || echo "FAIL $f"; done
```

- [ ] Bump **every** `?v=` in `index.html` (CSS, all game scripts, agent scripts, vendor scripts).
- [ ] Load the lobby; open at least one game from each of the three categories and play a round.
- [ ] Toggle 😈 and confirm outcomes swing in the player's favour.
- [ ] Open the AI Lab → **Start** → confirm it detects the live game, the telemetry counters tick,
      the P&L chart draws, the move history fills, and the HUD appears.
- [ ] Change model / brainpower stage / GPU–CPU and confirm they still land in `RoyalAgent.settings`.
- [ ] **Stop** and **🔀 New game** still work; **Stop & Report** renders the session report.
- [ ] Collapse the sidebar and confirm `document.querySelector('[data-nav="dice"]')` still resolves.
- [ ] Check `prefers-reduced-motion` (macOS: System Settings → Accessibility → Display → Reduce motion).

### Design/FX regression test — `tools/fx-test.html`

13 assertions covering the presentation layer specifically: mono face on numeric readouts, Inter on
body copy, numeric glow, translucent card fill, multi-layer shadows, the aurora and grain layers,
`fx.press` reaching exactly 0.95 and cleanly restoring, and the lobby cascade (not all cards visible
at 120 ms, all settled after). Runs in ~10 s with no Ollama needed.

> Note: it drives the press timeline with `tl.pause(); tl.seek(0.09)` rather than sleeping. Under
> Chrome's virtual time an awaited sleep can skip straight past a 90 ms down-stroke.

### Headless smoke test — `tools/smoke-test.html`

There is no test runner, but `tools/smoke-test.html` drives a full end-to-end pass: it loads
`index.html` in a same-origin iframe and asserts against `contentWindow.RoyalAgent` and
`eval("Casino")`. **65 assertions** covering control wiring, the brainpower stages, routing (both
`[data-nav]` clicks and the hash fallback), the 😈 rig, a live Ollama run, telemetry, the HUD, and
agentic free-roam across multiple tables. It is not referenced by `index.html`, so it ships inert.

Open it in a browser at `http://localhost:PORT/tools/smoke-test.html`, or run it headless:

```bash
python3 -m http.server 8765 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --virtual-time-budget=600000 --dump-dom "http://localhost:8765/tools/smoke-test.html" \
  | grep -oE '(OK|FAIL) .*'
```

Requires Ollama running with `qwen2.5:7b` for the agent section. Two gotchas when extending it:

- Under Chrome's virtual time, `await sleep(…)` can fast-forward past an entire agent session —
  assert on synchronous state **immediately** after an action, not after a sleep.
- Leave `profitTargetPct` / `stopLossPct` at `0` before a run, or an auto-stop will end the
  session after one round and every downstream assertion will look like a bug.
