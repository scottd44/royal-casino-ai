/* ============================================================
   Royal Casino — App router & lobby
   ============================================================ */
(() => {
  const view = document.getElementById("view");

  const GAMES = [
    { id: "slots",     emoji: "🎰", name: "Lucky Sevens", desc: "Spin the reels for triple-symbol jackpots.", tag: "Up to 60×",     accent: "#e6c15a", render: (v) => SlotsGame.render(v) },
    { id: "gems",      emoji: "💎", name: "Cosmic Gems",  desc: "3×3 grid, 5 paylines — multi-line gem wins.", tag: "Up to 240×",    accent: "#9d6bff", render: (v) => GemsGame.render(v) },
    { id: "blackjack", emoji: "🃏", name: "Blackjack",    desc: "Hit 21 and beat the dealer.",                tag: "Pays 3:2",      accent: "#3ecf8e", render: (v) => BlackjackGame.render(v) },
    { id: "videopoker", emoji: "🎴", name: "Video Poker",  desc: "Hold, draw, and hit Jacks or Better.",       tag: "Up to 800×",    accent: "#f0883e", render: (v) => VideoPokerGame.render(v) },
    { id: "roulette",  emoji: "🎡", name: "Roulette",     desc: "European wheel, real-table betting board.",  tag: "35:1 straight", accent: "#ef4d6a", render: (v) => RouletteGame.render(v) },
    { id: "dice",      emoji: "🎲", name: "Dice",         desc: "Roll under or over — you set the odds.",     tag: "Your odds",     accent: "#4d8cff", render: (v) => DiceGame.render(v) },
    { id: "mines",     emoji: "💣", name: "Mines",        desc: "Find gems, dodge mines, cash out big.",      tag: "Cash out anytime", accent: "#9d6bff", render: (v) => MinesGame.render(v) },
    { id: "crash",     emoji: "🚀", name: "Crash",        desc: "Cash out before the multiplier crashes.",    tag: "You call it",   accent: "#22d3ee", render: (v) => CrashGame.render(v) },
    { id: "limbo",     emoji: "🛸", name: "Limbo",        desc: "Beat your target multiplier in one shot.",   tag: "Up to 1M×",     accent: "#c77dff", render: (v) => LimboGame.render(v) },
    { id: "plinko",    emoji: "🟡", name: "Plinko",       desc: "Drop the ball and bounce into a payout.",    tag: "Up to 1000×",   accent: "#f6d97a", render: (v) => PlinkoGame.render(v) },
    { id: "hilo",      emoji: "🔼", name: "Hilo",         desc: "Call higher or lower, chain the streak.",    tag: "Cash out anytime", accent: "#5eead4", render: (v) => HiloGame.render(v) },
    { id: "tower",     emoji: "🗼", name: "Tower",        desc: "Climb row by row, dodge the mines.",         tag: "Cash out anytime", accent: "#a3e635", render: (v) => TowerGame.render(v) },
    { id: "wheel",     emoji: "🎯", name: "Wheel",        desc: "Compound each spin or cash out — 4 risk levels.", tag: "Keep spinning", accent: "#a982ff", render: (v) => WheelGame.render(v) },
    { id: "chicken",   emoji: "🐔", name: "Chicken Road", desc: "Cross lane by lane; cash out before a car hits.", tag: "Cash out anytime", accent: "#facc15", render: (v) => ChickenGame.render(v) },
  ];

  const CATEGORIES = [
    { label: "🃏 Table Games", ids: ["blackjack", "videopoker", "hilo", "roulette"] },
    { label: "⚡ Originals",   ids: ["dice", "mines", "crash", "limbo", "plinko", "tower", "wheel", "chicken"] },
    { label: "🎰 Slots",       ids: ["slots", "gems"] },
  ];

  function cardHTML(g) {
    return `
      <div class="game-card" data-nav="${g.id}" style="--accent:${g.accent}">
        <div class="glow"></div>
        <div class="game-emoji">${g.emoji}</div>
        <div class="game-card-body">
          <h3>${g.name}</h3>
          <p>${g.desc}</p>
        </div>
        <div class="game-card-foot">
          <span class="game-tag">${g.tag}</span>
          <span class="play-tag">PLAY →</span>
        </div>
      </div>`;
  }

  function renderLobby() {
    view.innerHTML = `
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-badge">🤖 AI-powered · watch it play itself</div>
          <h1>Royal <span class="g">Casino</span></h1>
          <p>A full casino floor with simulated dollars — and a local AI that can play,
             narrate its reasoning, and report on its own sessions.</p>
          <div class="hero-stats">
            <span class="hero-stat">🎮 <b>${GAMES.length}</b> games</span>
            <span class="hero-stat">📈 <b>~99%</b> RTP</span>
            <span class="hero-stat">🤖 <b>AI</b> Lab built in</span>
          </div>
          <div class="hero-actions">
            <button class="btn" id="howBtn">ℹ️ How it works</button>
            <button class="btn btn-ghost" id="heroAdd">+ Cash</button>
          </div>
        </div>
      </section>

      ${CATEGORIES.map((cat) => {
        const games = cat.ids.map((id) => GAMES.find((g) => g.id === id)).filter(Boolean);
        return `
          <section class="lobby-section">
            <div class="lobby-head">
              <h2>${cat.label}</h2>
              <span class="lobby-rule"></span>
              <span class="lobby-sub">${games.length} game${games.length > 1 ? "s" : ""}</span>
            </div>
            <div class="game-grid">${games.map(cardHTML).join("")}</div>
          </section>`;
      }).join("")}`;

    view.querySelector("#heroAdd").addEventListener("click", () => Casino.addFunds(500));
    view.querySelector("#howBtn").addEventListener("click", openInfo);
  }

  /* ---------- AI Guide — full documentation page ---------- */
  function renderAiGuide() {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🤖 AI Guide</h2>
        <p class="page-sub">Exactly how the Royal Casino agent works — the decision pipeline, its two-layer mind,
        tilt, brainpower, every Lab control, and what each stat means.</p>
      </div>

      <div class="guide-grid">
        <div class="panel guide-sec">
          <h3>1 · How a decision happens</h3>
          <p>The agent never sees the game code — it plays the same UI you do. Each round runs this pipeline:</p>
          <ol>
            <li><b>Read the table</b> — the game's adapter reads the live DOM (your hand, the multiplier, the tiles) into a small JSON <code>gameState</code> plus a list of <code>legal moves</code>.</li>
            <li><b>Build the prompt</b> — persona + session context (bankroll, streak, tilt) + game-specific rules are sent to your local Ollama model.</li>
            <li><b>Structured decision</b> — the model must answer with a <code>make_move</code> tool call: one legal move, optional args (bet, target, tile…), and a one-line <code>reason</code> in character.</li>
            <li><b>Validate & act</b> — the harness verifies the move is legal, clamps bets to your balance, then physically clicks the real buttons.</li>
            <li><b>Fallback</b> — if the model answers with something unusable, it's re-prompted once; if it still fails, a built-in heuristic makes a sensible move instead (logged as <i>fallback</i>). If Ollama is unreachable, the run stops.</li>
            <li><b>Telemetry</b> — every decision records latency, the move, the reason, and the round result.</li>
          </ol>
        </div>

        <div class="panel guide-sec">
          <h3>2 · The two-layer mind</h3>
          <p>The persona is deliberately split in two:</p>
          <ul>
            <li><b>SKILL — never compromised.</b> It always knows the correct play: blackjack basic strategy, which video-poker cards to hold, when a cash-out locks profit. <i>How</i> it plays a hand is competent, always.</li>
            <li><b>TEMPERAMENT — pure degenerate.</b> <i>How much</i> it bets and <i>how hard</i> it chases runs on emotion. Its current emotional state colors bet sizing, target-picking, and every logged reason.</li>
          </ul>
          <p>Result: a sharp regular who plays hands correctly and sizes bets like a maniac when tilted.</p>
        </div>

        <div class="panel guide-sec">
          <h3>3 · The tilt meter</h3>
          <p>A 0–100 score tracks its emotional state, updated every round and fed into every decision as
          <code>emotional_state</code>:</p>
          <ul>
            <li>Each loss: <b>+9</b>, plus up to <b>+10</b> for loss streaks, plus <b>+14</b> if the hit was ≥15% of the starting bankroll.</li>
            <li>Each win: <b>−14</b>, and an extra <b>−16</b> for a big score.</li>
          </ul>
          <table class="guide-table">
            <tr><td>😎 <b>Ice cold</b> (0–19)</td><td>calm, sharp, sizes near the stake hint</td></tr>
            <tr><td>🙂 <b>Steady</b> (20–44)</td><td>feels the swings, keeps it together</td></tr>
            <tr><td>😤 <b>Tilted</b> (45–69)</td><td>pressing bets, itching to win it back</td></tr>
            <tr><td>🤬 <b>Full tilt</b> (70+)</td><td>betting angry, chasing everything</td></tr>
          </table>
        </div>

        <div class="panel guide-sec">
          <h3>4 · Brainpower dial</h3>
          <p>One slider controls how long the model may think per decision — its token budget — and its
          sampling temperature together:</p>
          <table class="guide-table">
            <tr><td>🦎 <b>Instinct</b> (left)</td><td>~64 tokens, hot sampling (0.8) — fast gut calls, terse reasons</td></tr>
            <tr><td>🃏 <b>Sharp</b> (middle)</td><td>~224 tokens, balanced (0.5) — the default</td></tr>
            <tr><td>🧠 <b>Deep</b> (right)</td><td>~768 tokens, cool sampling (0.35) — slow, deliberate, fuller reasoning</td></tr>
          </table>
          <p>The scale is exponential between 64 and 768. Trade-off: low budgets are fast but can occasionally
          truncate a tool call (the fallback catches it — watch <b>Tool reliab.</b>); high budgets think harder
          and raise latency.</p>
        </div>

        <div class="panel guide-sec">
          <h3>5 · Behavior controls</h3>
          <ul>
            <li><b>Aggression</b> — sets the <code>suggested_stake_hint</code> (aggression × bankroll). It's guidance, not a rule — temperament can defy it.</li>
            <li><b>Move speed</b> — the pause between actions, purely cosmetic pacing.</li>
            <li><b>Model</b> — any Ollama tag (default <code>qwen2.5:7b</code>).</li>
            <li><b>Compute</b> — GPU (Metal, default & fast) or CPU-only (<code>num_gpu:0</code>). CPU is slower/hotter but lets you watch the cores light up in the System monitor. Switching reloads the model.</li>
            <li><b>Agentic</b> — the AI free-roams the floor. Table choice is deliberately unbiased: options are shuffled, no game is favored, and the fallback pick is uniform-random.</li>
            <li><b>🔀 New game</b> — while roaming, forces it to a <i>different</i> table on the next round.</li>
          </ul>
        </div>

        <div class="panel guide-sec">
          <h3>6 · Session controls & stops</h3>
          <ul>
            <li><b>Run N</b> — stop after N rounds (0 = unlimited).</li>
            <li><b>Profit target / Stop-loss %</b> — auto-stop when net hits ±X% of the starting bankroll.</li>
            <li><b>Session timer</b> — wall-clock limit; auto-stops and writes the report.</li>
            <li><b>Breaks</b> — pauses all inference every N minutes for M minutes.</li>
          </ul>
          <p><b>Going broke:</b> it never walks away. At $0 it takes escalating "desperate financing" —
          credit cards, a second mortgage, the kids' college fund, eventually a loan shark — up to 12 loans.
          Borrowed money is tracked separately so the report shows the <i>real</i> damage, not just the wallet.</p>
        </div>

        <div class="panel guide-sec">
          <h3>7 · Telemetry glossary</h3>
          <table class="guide-table">
            <tr><td><b>Net / ROI</b></td><td>profit vs. session start · net ÷ total wagered</td></tr>
            <tr><td><b>Win rate</b></td><td>wins ÷ decided rounds (pushes excluded)</td></tr>
            <tr><td><b>Peak / Streaks</b></td><td>best balance touched · longest win/loss runs</td></tr>
            <tr><td><b>Avg latency</b></td><td>model thinking time per decision</td></tr>
            <tr><td><b>Tool reliab.</b></td><td>% of decisions that produced a valid tool call (rest used the fallback)</td></tr>
            <tr><td><b>Tilt</b></td><td>current emotional state (see §3)</td></tr>
            <tr><td><b>Per-game strip</b></td><td>W/L and net for every table visited this session</td></tr>
          </table>
          <p><b>Stop &amp; Report</b> builds a full session report — P&L chart, swings, per-game results, any
          desperate loans — with an AI-written recap. <b>JSON/CSV</b> export everything (including the brain
          config) for benchmarking models against each other.</p>
        </div>

        <div class="panel guide-sec">
          <h3>8 · The 😈 Rig toggle & setup</h3>
          <p>The rig biases outcomes in the player's favor (~62% forced-favorable by default). The agent isn't
          told — it simply experiences an incredible heater, and its tilt cools accordingly. Forced wins on ten
          games; Blackjack &amp; Video Poker get "lucky refunds" instead.</p>
          <p><b>Requirements:</b> install Ollama, <code>ollama pull qwen2.5:7b</code>, and allow this origin via
          <code>OLLAMA_ORIGINS</code>. Without it every game still plays manually.</p>
        </div>
      </div>`;
  }

  /* ---------- "How it works" explainer modal ---------- */
  const infoOverlay = document.createElement("div");
  infoOverlay.className = "report-overlay";
  infoOverlay.id = "infoOverlay";
  infoOverlay.innerHTML = `
    <div class="report-card">
      <div class="report-head">
        <h2 class="report-title">ℹ️ How Royal Casino works</h2>
        <button class="btn btn-ghost btn-sm" id="infoClose">✕</button>
      </div>
      <div class="report-section">
        <h4>The games</h4>
        <div class="info-body">Thirteen games — Slots, Cosmic Gems, Blackjack, Video Poker, Roulette, Dice, Mines,
        Crash, Limbo, Plinko, Hilo, Tower and Wheel — all played with simulated dollars stored in your browser.
        Nothing here uses real money. Every game has sound (clicks, ticks, win/lose chimes); toggle it with
        the <b>🔊</b> button in the top bar.</div>
      </div>
      <div class="report-section">
        <h4>😈 Rigged odds</h4>
        <div class="info-body">The <b>😈 Rig</b> button in the top bar flips the odds into <b>your</b> favor so
        the bankroll — and the AI — climbs. It's a play-money sandbox, off by default. It affects
        <b>every game</b>, in one of two ways:
          <ul class="info-list">
            <li><b>Forced wins</b> (you watch the win happen) — Slots, Dice, Limbo, Crash, Roulette, Wheel,
            Mines, Tower, Hilo and Plinko.</li>
            <li><b>Lucky refunds</b> (a losing round returns your stake instead) — Blackjack and Video Poker,
            since rigging the actual cards would look fake.</li>
          </ul>
          Strength defaults to ~62% (roughly a +50% edge); tune it in the console with
          <code>Casino.cheat.setStrength(0–1)</code>.</div>
      </div>
      <div class="report-section">
        <h4>The AI agent</h4>
        <div class="info-body">Open the <b>AI Lab</b> (bottom of any game) and the app can hand the
        controls to a local LLM (via Ollama) that plays autonomously — sizing bets to its bankroll,
        picking moves, and <b>logging its reasoning</b> for every decision. It plays like a gambler:
        risk-hungry but self-preserving, with real emotion behind its calls.</div>
      </div>
      <div class="report-section">
        <h4>What it can do</h4>
        <div class="info-body">
          <ul class="info-list">
            <li><b>Agentic mode</b> — the AI free-roams between games, choosing where to play next.</li>
            <li><b>Aggression &amp; speed</b> sliders shape how it bets and how fast it moves.</li>
            <li><b>Brainpower</b> — pick how many tokens it may think with per decision (🦎 Instinct / 🃏 Sharp / 🧠 Deep).</li>
            <li><b>Tilt meter</b> — losses build real tilt that bleeds into its bet sizing and reasoning; wins cool it off.</li>
            <li><b>Session timer</b> — auto-stops and reports after a set duration.</li>
            <li><b>Break scheduler</b> — pauses inference on a cycle so the machine isn't overworked.</li>
            <li><b>Multi-bet roulette</b> — spreads chips across the table in a single spin.</li>
            <li><b>Stop &amp; Report</b> — a PNL chart, win/loss stats, notable swings, and an AI-written recap.</li>
            <li><b>Live stats + move history</b>, plus JSON/CSV export for benchmarking models.</li>
          </ul>
        </div>
      </div>
      <div class="report-section">
        <h4>Running the AI locally</h4>
        <div class="info-body">Install <b>Ollama</b>, run <code>ollama pull qwen2.5:7b</code>, and allow the
        app's origin with <code>OLLAMA_ORIGINS</code>. Without it, the games still play manually.</div>
      </div>
      <div class="report-actions">
        <button class="btn btn-ghost" id="infoGuide" data-nav="aiguide">📖 Full AI guide</button>
        <button class="btn" id="infoClose2">Got it</button>
      </div>
    </div>`;
  document.body.appendChild(infoOverlay);
  function openInfo() { infoOverlay.classList.add("show"); }
  function closeInfo() { infoOverlay.classList.remove("show"); }
  infoOverlay.addEventListener("click", (e) => { if (e.target === infoOverlay) closeInfo(); });
  infoOverlay.querySelector("#infoClose").addEventListener("click", closeInfo);
  infoOverlay.querySelector("#infoClose2").addEventListener("click", closeInfo);
  infoOverlay.querySelector("#infoGuide").addEventListener("click", closeInfo); // data-nav handles the navigation

  // Build the Games dropdown menu from the categories.
  function buildGamesMenu() {
    const menu = document.getElementById("gamesMenu");
    if (!menu) return;
    menu.innerHTML = CATEGORIES.map((cat) => `
      <div class="nav-menu-cat">${cat.label}</div>
      ${cat.ids.map((id) => {
        const g = GAMES.find((x) => x.id === id);
        return g ? `
          <button class="nav-menu-item" data-nav="${g.id}">
            <span class="nmi-emoji">${g.emoji}</span>
            <span class="nmi-name">${g.name}</span>
            <span class="nmi-tag">${g.tag}</span>
          </button>` : "";
      }).join("")}
    `).join("");
  }

  function setActiveNav(id) {
    const isGame = GAMES.some((g) => g.id === id);
    document.querySelectorAll(".topnav .nav-link").forEach((n) => {
      const on = n.id === "gamesMenuBtn" ? isGame : n.dataset.nav === id;
      n.classList.toggle("active", !!on);
    });
  }

  function navigate(id) {
    setActiveNav(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (id === "lobby") { renderLobby(); location.hash = ""; return; }
    if (id === "aiguide") { renderAiGuide(); location.hash = "aiguide"; return; }
    const game = GAMES.find((g) => g.id === id);
    if (!game) { renderLobby(); return; }
    location.hash = id;
    game.render(view);
  }

  // Games dropdown open/close.
  const gamesMenuBtn = document.getElementById("gamesMenuBtn");
  const gamesMenu = document.getElementById("gamesMenu");
  function closeGamesMenu() { gamesMenu.classList.remove("open"); gamesMenuBtn.classList.remove("menu-open"); }
  gamesMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = gamesMenu.classList.toggle("open");
    gamesMenuBtn.classList.toggle("menu-open", open);
  });

  // Event delegation for anything with a data-nav attribute.
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-nav]");
    if (target) { closeGamesMenu(); navigate(target.dataset.nav); }
    else closeGamesMenu(); // click outside closes the menu
  });

  // Global UI "click" blip for game controls — one place covers every game
  // (action buttons, quick-bet chips, tiles, hold slots, the roulette felt).
  // Capture phase so it fires regardless of per-game handlers.
  document.addEventListener("click", (e) => {
    if (e.target.closest(
      "button, [data-bet], .tile, .vp-slot, .rt-num, .rt-out, .rt-doz, .rt-col, .rt-zero, .rt-chip-btn"
    )) {
      Casino.sound.play("click");
    }
  }, true);

  // Sound mute toggle (persists across sessions).
  const muteBtn = document.getElementById("muteBtn");
  function syncMuteBtn() {
    const muted = Casino.sound.isMuted();
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.title = muted ? "Sound off — click to unmute" : "Sound on — click to mute";
  }
  muteBtn.addEventListener("click", () => {
    const muted = Casino.sound.toggleMute();
    if (!muted) Casino.sound.play("click"); // give immediate feedback when turning on
    syncMuteBtn();
  });
  syncMuteBtn();

  // Rigged-odds toggle (persists). When on, games force favorable outcomes.
  const cheatBtn = document.getElementById("cheatBtn");
  function syncCheatBtn() {
    const on = Casino.cheat.isOn();
    cheatBtn.classList.toggle("cheat-on", on);
    cheatBtn.title = on
      ? `Odds rigged in your favor (~${Math.round(Casino.cheat.getStrength() * 100)}%). Click to disable.`
      : "Rig the odds in your favor";
  }
  cheatBtn.addEventListener("click", () => {
    const on = Casino.cheat.toggle();
    syncCheatBtn();
    Casino.toast(on ? "😈 Odds now rigged in your favor." : "Odds back to normal (house edge restored).", on ? "win" : "info");
  });
  syncCheatBtn();

  document.getElementById("addFundsBtn").addEventListener("click", () => Casino.addFunds(500));
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (confirm("Reset your balance to $1,000?")) Casino.reset();
  });

  // Boot
  Casino.renderBalance();
  buildGamesMenu();
  const start = location.hash.replace("#", "");
  if (start && (start === "aiguide" || GAMES.some((g) => g.id === start))) navigate(start);
  else renderLobby();
})();
