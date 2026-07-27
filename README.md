# 🎰 Royal Casino

A professional-looking **simulated-money** casino web app that runs entirely on `localhost`
in your browser. No real money, no accounts, no server-side code, no data leaves your machine.
Everything is play credits stored in your browser's `localStorage`.

> ⚠️ **For entertainment and learning only.** There is no real currency, no purchases,
> and no payouts of any kind.

## Games

| Game | Description |
|------|-------------|
| 🎰 **Lucky Sevens Slots** | 3-reel slot with weighted symbols and a paytable (up to 60×). |
| 💎 **Cosmic Gems** | 3×3 grid video slot with 5 paylines (rows + diagonals); multiple lines can hit at once. |
| 🃏 **Blackjack** | Classic 21 vs. the dealer. Hit / Stand / Double. Blackjack pays 3:2, dealer stands on 17. |
| 🎴 **Video Poker** | Jacks or Better (9/6 full-pay). Deal five, hold, and draw. Royal flush pays 800×. |
| 🎡 **Roulette** | European single-zero wheel. Even-money, dozens, and straight-up (35:1) bets. |
| 🎲 **Dice** | Roll under/over an adjustable target — you choose the odds and multiplier. |
| 💣 **Mines** | Reveal gems, avoid mines, and cash out at a rising multiplier. |
| 🚀 **Crash** | Ride a climbing multiplier and cash out before it crashes. |
| 🛸 **Limbo** | Pick a target multiplier; win instantly if the random result meets or beats it. Up to 1,000,000×. |
| 🔼 **Hilo** | Call the next card higher or lower (Ace low, ties win); chain correct calls for a compounding multiplier. |
| 🗼 **Tower** | Climb 8 rows picking a safe tile each; five difficulties. Cash out before a mine. |
| 🎯 **Wheel** | Compounding risk wheel — each winning spin multiplies your multiplier; keep spinning or cash out. Low/Medium/High/Risky. |
| 🟡 **Plinko** | Drop a ball down a peg pyramid into a multiplier slot — Low/Med/High risk, 8/12/16 rows, up to 1000×. |

## Features

- Shared credit wallet with balance saved between sessions (localStorage).
- Start with **1,000 credits**; add more or reset any time.
- Provably-*style* fair math with a small (1%) simulated house edge on Dice & Mines.
- Responsive, dark/gold "casino floor" UI with animations, toasts, and synthesized
  sound effects (clicks, ticks, win/lose chimes) with a persistent mute toggle in the top bar.
- **😈 Rig toggle** (top bar): flips every game's odds into the *player's* favor so the
  bankroll — and the AI — climbs. Strength defaults to ~62% (≈+50% edge); adjust in the
  console via `Casino.cheat.setStrength(0.0–1.0)`. Off by default; it's a play-money sandbox.

## Easiest start (macOS) — one file

Double-click **`START-HERE.command`** in Finder. It installs Ollama if needed,
allows your browser to reach it, downloads the AI model, then serves the casino
and opens it. Keep the window it opens running while you play (Ctrl+C to stop).

> First launch: macOS may warn about an unidentified developer. Right-click the
> file → **Open** → **Open** to approve it once.

## Watch your machine work (embedded)

Launch via **`START-HERE.command`** (which runs `serve.py`) and the **AI Lab shows a
live system monitor** — CPU %, GPU %, package/GPU power, RAM and temperature — right
under the P&L chart, so you can see your Mac work as the AI plays. It's powered by
[`macmon`](https://github.com/vladkens/macmon) (Apple Silicon, no password); if macmon
isn't installed the panel just says so and everything else works normally.

> Prefer a full-screen terminal view? `WATCH-SYSTEM.command` still opens macmon/asitop directly.

## Run it (manual)

You only need a static file server. Pick whichever you have:

```bash
# From inside the royal-casino folder:

# Python 3 (built into macOS)
python3 -m http.server 8000

# …or Node
npx serve -l 8000

# …or PHP
php -S localhost:8000
```

Then open <http://localhost:8000> in your browser.

> You can also just double-click `index.html` to open it directly (file://),
> but running a local server is recommended so everything behaves consistently.

## Project structure

```
royal-casino/
├── index.html          # Shell: top bar, wallet, nav, script includes
├── css/styles.css      # Full theme & component styles
└── js/
    ├── core.js         # Wallet, bets/payouts, toasts, helpers
    ├── app.js          # Router + lobby
    └── games/
        ├── slots.js
        ├── blackjack.js
        ├── videopoker.js
        ├── roulette.js
        ├── dice.js
        ├── mines.js
        ├── crash.js
        ├── limbo.js
        ├── plinko.js
        ├── hilo.js
        ├── tower.js
        └── wheel.js
```

## Resetting

Use the **Reset** button in the top-right, or clear the
`royal_casino_balance_v1` key from your browser's localStorage.
