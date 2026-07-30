/* ============================================================
   Royal Casino — App router, sidebar & lobby
   ------------------------------------------------------------
   IMPORTANT (AI Lab contract): the sidebar renders a [data-nav]
   button for EVERY game and stays in the DOM at all times, even
   when collapsed. agent-ui.js navigates the agent between tables
   by clicking those links (switchToGame → querySelector
   `[data-nav="<id>"]`.click()). Never remove them, never render
   them conditionally. See DEVELOPMENT_GUIDE.md.
   ============================================================ */
(() => {
  const view = document.getElementById("view");

  const GAMES = [
    { id: "slots",     emoji: "🎰", icon: "cherry", name: "Lucky Sevens", desc: "Spin the reels for triple-symbol jackpots.", tag: "Up to 60×",     accent: "#e6c15a", provider: "Royal Slots",     render: (v) => SlotsGame.render(v) },
    { id: "gems",      emoji: "💎", icon: "gem", name: "Cosmic Gems",  desc: "3×3 grid, 5 paylines — multi-line gem wins.", tag: "Up to 240×",    accent: "#9d6bff", provider: "Royal Slots",     render: (v) => GemsGame.render(v) },
    { id: "blackjack", emoji: "🃏", icon: "spade", name: "Blackjack",    desc: "Hit 21 and beat the dealer.",                tag: "Pays 3:2",      accent: "#3ecf8e", provider: "Royal Live",      render: (v) => BlackjackGame.render(v) },
    { id: "videopoker", emoji: "🎴", icon: "club", name: "Video Poker",  desc: "Hold, draw, and hit Jacks or Better.",       tag: "Up to 800×",    accent: "#f0883e", provider: "Royal Live",      render: (v) => VideoPokerGame.render(v) },
    { id: "roulette",  emoji: "🎡", icon: "disc-3", name: "Roulette",     desc: "European wheel, real-table betting board.",  tag: "35:1 straight", accent: "#ef4d6a", provider: "Royal Live",      render: (v) => RouletteGame.render(v) },
    { id: "dice",      emoji: "🎲", icon: "dices", name: "Dice",         desc: "Roll under or over — you set the odds.",     tag: "Your odds",     accent: "#4d8cff", provider: "Royal Originals", render: (v) => DiceGame.render(v) },
    { id: "mines",     emoji: "💣", icon: "bomb", name: "Mines",        desc: "Find gems, dodge mines, cash out big.",      tag: "Cash out anytime", accent: "#9d6bff", provider: "Royal Originals", render: (v) => MinesGame.render(v) },
    { id: "crash",     emoji: "🚀", icon: "rocket", name: "Crash",        desc: "Cash out before the multiplier crashes.",    tag: "You call it",   accent: "#22d3ee", provider: "Royal Originals", render: (v) => CrashGame.render(v) },
    { id: "limbo",     emoji: "🛸", icon: "trending-up", name: "Limbo",        desc: "Beat your target multiplier in one shot.",   tag: "Up to 1M×",     accent: "#c77dff", provider: "Royal Originals", render: (v) => LimboGame.render(v) },
    { id: "plinko",    emoji: "🟡", icon: "git-fork", name: "Plinko",       desc: "Drop the ball and bounce into a payout.",    tag: "Up to 1000×",   accent: "#f6d97a", provider: "Royal Originals", render: (v) => PlinkoGame.render(v) },
    { id: "hilo",      emoji: "🔼", icon: "arrow-up-down", name: "Hilo",         desc: "Call higher or lower, chain the streak.",    tag: "Cash out anytime", accent: "#5eead4", provider: "Royal Live",      render: (v) => HiloGame.render(v) },
    { id: "tower",     emoji: "🗼", icon: "layers", name: "Tower",        desc: "Climb row by row, dodge the mines.",         tag: "Cash out anytime", accent: "#a3e635", provider: "Royal Originals", render: (v) => TowerGame.render(v) },
    { id: "wheel",     emoji: "🎯", icon: "target", name: "Wheel",        desc: "Compound each spin or cash out — 4 risk levels.", tag: "Keep spinning", accent: "#a982ff", provider: "Royal Originals", render: (v) => WheelGame.render(v) },
    { id: "chicken",   emoji: "🐔", icon: "bird", name: "Chicken Road", desc: "Cross lane by lane; cash out before a car hits.", tag: "Cash out anytime", accent: "#facc15", provider: "Royal Originals", render: (v) => ChickenGame.render(v) },
    { id: "holdem",    emoji: "🃏", icon: "diamond", name: "Texas Hold'em", desc: "No-limit poker vs. betting bots. Blinds, all-ins, showdowns.", tag: "vs. bots", accent: "#34d399", provider: "Royal Live", render: (v) => HoldemGame.render(v) },
    { id: "baccarat",  emoji: "🀄", icon: "heart", name: "Baccarat",      desc: "Back Player, Banker or Tie — closest to 9 wins.", tag: "Banker ~99%", accent: "#e6c15a", provider: "Royal Live", render: (v) => BaccaratGame.render(v) },
    { id: "threecard", emoji: "🂡", icon: "layers-2", name: "Three Card Poker", desc: "Three cards vs. the dealer — play or fold.", tag: "Ante + bonus", accent: "#5eead4", provider: "Royal Live", render: (v) => ThreeCardGame.render(v) },
    { id: "casinowar", emoji: "⚔️", icon: "swords", name: "Casino War",    desc: "Highest card wins. Go to war on a tie.", tag: "1:1", accent: "#ef4d6a", provider: "Royal Live", render: (v) => CasinoWarGame.render(v) },
    { id: "reddog",    emoji: "🔴", icon: "circle-dot", name: "Red Dog",       desc: "Will the third card land between? Bet the spread.", tag: "Up to 11:1", accent: "#fb7185", provider: "Royal Live", render: (v) => RedDogGame.render(v) },
    { id: "battleship",emoji: "🚢", icon: "ship", name: "Battleship",      desc: "Buy shots at a hidden fleet — hit pieces, sink ships for big multipliers.", tag: "Up to 100×", accent: "#4d8cff", provider: "Royal Originals", render: (v) => BattleshipGame.render(v) },
    { id: "moles",     emoji: "🐹", icon: "hammer", name: "Moles",           desc: "Whack holes to find the moles — each one grows your multiplier.", tag: "Up to 122×", accent: "#e6c15a", provider: "Royal Originals", render: (v) => MolesGame.render(v) },
    { id: "snakes",    emoji: "🐍", icon: "rc:snake", name: "Snakes",          desc: "Roll around a 12-tile loop; dodge snakes, compound safe tiles.", tag: "Up to 1720×", accent: "#3ecf8e", provider: "Royal Originals", render: (v) => SnakesGame.render(v) },
    { id: "coinflip",  emoji: "🪙", icon: "circle-dollar-sign", name: "Coinflip",        desc: "Call heads or tails and compound 1.96× per flip.", tag: "Streak", accent: "#4d8cff", provider: "Royal Originals", render: (v) => CoinflipGame.render(v) },
    { id: "rps",       emoji: "✊", icon: "rc:rock", name: "Rock Paper Scissors", desc: "Beat the house to build a 1.96×-per-win streak.", tag: "Streak", accent: "#9d6bff", provider: "Royal Originals", render: (v) => RPSGame.render(v) },
    { id: "keno",      emoji: "🔢", icon: "hash", name: "Keno",            desc: "Pick numbers, draw 10 of 40, chase up to 10,000×.", tag: "Up to 10000×", accent: "#fb7185", provider: "Royal Originals", render: (v) => KenoGame.render(v) },
  ];

  const CATEGORIES = [
    { key: "live",      label: "Live Table Action",   icon: "spade", ids: ["blackjack", "holdem", "baccarat", "threecard", "casinowar", "reddog", "videopoker", "hilo", "roulette"] },
    { key: "originals", label: "Stake-Style Originals", icon: "zap", ids: ["dice", "mines", "crash", "limbo", "plinko", "tower", "wheel", "chicken", "battleship", "moles", "snakes", "coinflip", "rps", "keno"] },
    { key: "slots",     label: "Slots",               icon: "cherry", ids: ["slots", "gems"] },
  ];

  const byId = (id) => GAMES.find((g) => g.id === id);
  const gamesOf = (cat) => cat.ids.map(byId).filter(Boolean);

  /* Pages that aren't games. `nav` is what setActiveNav highlights. */
  const PAGES = {
    lobby:     { title: "Lobby",        crumb: "Casino <b>Lobby</b>" },
    originals: { title: "Originals",    crumb: "Casino · <b>Originals</b>" },
    vip:       { title: "VIP Club",     crumb: "<b>VIP Club</b>" },
    support:   { title: "Live Support", crumb: "<b>Live Support</b>" },
    aiguide:   { title: "AI Guide",     crumb: "<b>AI Guide</b>" },
  };

  /* ============================================================
     Sidebar
     ============================================================ */
  const sbNav = document.getElementById("sbNav");

  function sbItem(g) {
    return `
      <button class="sb-item" data-nav="${g.id}" style="--accent:${g.accent}" title="${g.name}">
        <span class="sb-ico">${Casino.icon(g.icon)}</span>
        <span class="sb-txt">${g.name}</span>
      </button>`;
  }

  function buildSidebar() {
    if (!sbNav) return;
    sbNav.innerHTML = `
      <div class="sb-group">
        <button class="sb-item sb-primary" data-nav="lobby" style="--accent:var(--gold)" title="Casino lobby">
          <span class="sb-ico">${Casino.icon("dices")}</span><span class="sb-txt">Casino</span>
        </button>
        <button class="sb-item sb-primary" data-nav="originals" style="--accent:#22d3ee" title="Stake-style originals">
          <span class="sb-ico">${Casino.icon("zap")}</span><span class="sb-txt">Originals</span>
        </button>
        <button class="sb-item sb-primary" id="sbAiLab" style="--accent:var(--purple)" title="Open the AI Lab control deck">
          <span class="sb-ico">${Casino.icon("bot")}</span><span class="sb-txt">AI Lab</span><span class="sb-tag new">LIVE</span>
        </button>
        <button class="sb-item sb-primary" data-nav="vip" style="--accent:var(--gold)" title="VIP club">
          <span class="sb-ico">${Casino.icon("crown")}</span><span class="sb-txt">VIP</span>
        </button>
        <button class="sb-item sb-primary" data-nav="support" style="--accent:#4d8cff" title="Live support">
          <span class="sb-ico">${Casino.icon("message-circle")}</span><span class="sb-txt">Live Support</span>
        </button>
      </div>
      <div class="sb-sep"></div>
      ${CATEGORIES.map((cat) => `
        <div class="sb-group">
          <div class="sb-label">${Casino.icon(cat.icon)} ${cat.label}</div>
          ${gamesOf(cat).map(sbItem).join("")}
        </div>`).join("")}
      <div class="sb-sep"></div>
      <div class="sb-group">
        <button class="sb-item" data-nav="aiguide" style="--accent:var(--purple)" title="How the AI agent works">
          <span class="sb-ico">${Casino.icon("book-open")}</span><span class="sb-txt">AI Guide</span>
        </button>
      </div>`;
  }

  function setActiveNav(id) {
    document.querySelectorAll(".sb-item[data-nav]").forEach((n) => {
      n.classList.toggle("active", n.dataset.nav === id);
    });
    const crumb = document.getElementById("tbCrumb");
    if (crumb) {
      const g = byId(id);
      crumb.innerHTML = g
        ? `${g.provider} · <b>${g.name}</b>`
        : (PAGES[id] || PAGES.lobby).crumb;
    }
    document.title = (byId(id)?.name || (PAGES[id] || PAGES.lobby).title) + " · Royal Casino";
  }

  /* ============================================================
     SIDEBAR — one state, one writer, one listener
     ------------------------------------------------------------
     Exactly two booleans exist, and each is owned by one function:

       collapsed  desktop icon-rail   -> body.sb-collapsed  (persisted)
       open       mobile drawer       -> body.sb-open       (never persisted)

     Every mutation goes through setSidebar(). Nothing else in the app
     touches these classes, so the two states can never desync — which is
     what made the old buttons freeze after a handful of clicks.

     All visual movement is CSS (grid-template-columns / transform). JS only
     ever flips a class; it never animates, measures or writes inline styles.

     The listener is registered once, on document, and matches by closest()
     — so it survives any innerHTML rewrite of the header or rail and can
     never be double-bound by a re-render.
     ============================================================ */
  const SB_KEY = "royal_casino_sidebar_collapsed_v1";
  const mqDrawer = window.matchMedia("(max-width: 900px)");

  const sidebarState = {
    collapsed: localStorage.getItem(SB_KEY) === "1",
    open: false,
  };

  /** The single writer. Pass only the keys you intend to change. */
  function setSidebar(patch) {
    Object.assign(sidebarState, patch);
    // Drawer state is meaningless on desktop; force it off so a stale `open`
    // can never leave the scrim mounted after a resize.
    if (!mqDrawer.matches) sidebarState.open = false;

    const b = document.body;
    b.classList.toggle("sb-collapsed", sidebarState.collapsed);
    b.classList.toggle("sb-open", sidebarState.open);

    if ("collapsed" in patch) {
      localStorage.setItem(SB_KEY, sidebarState.collapsed ? "1" : "0");
    }
  }

  const closeSidebar = () => setSidebar({ open: false });

  document.addEventListener("click", (e) => {
    // Desktop rail chevron
    if (e.target.closest("#sbCollapse")) {
      e.stopPropagation();
      setSidebar({ collapsed: !sidebarState.collapsed });
      return;
    }
    // Mobile hamburger
    if (e.target.closest("#sbToggle")) {
      e.stopPropagation();
      setSidebar({ open: !sidebarState.open });
      return;
    }
    if (e.target.closest("#sbScrim")) closeSidebar();
  });

  // Crossing the breakpoint re-normalises both flags in one place.
  mqDrawer.addEventListener("change", () => setSidebar({}));
  // Escape always closes the drawer.
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });

  setSidebar({});   // paint the persisted state on load

  /* ============================================================
     Lobby
     ============================================================ */
  function cardHTML(g) {
    return `
      <div class="game-card" data-nav="${g.id}" data-anim style="--accent:${g.accent}">
        <div class="glow"></div>
        <div class="game-card-top">
          <div class="game-emoji">${Casino.icon(g.icon)}</div>
          <span class="game-provider">${g.provider}</span>
        </div>
        <div class="game-card-body">
          <h3>${g.name}</h3>
          <p>${g.desc}</p>
        </div>
        <div class="game-card-foot">
          <span class="game-tag">${g.tag}</span>
          <span class="play-tag">PLAY ${Casino.icon("arrow-right")}</span>
        </div>
      </div>`;
  }

  // `only` = a category key, or null for the full floor.
  let lobbyFilter = null;

  function lobbySections() {
    const cats = lobbyFilter ? CATEGORIES.filter((c) => c.key === lobbyFilter) : CATEGORIES;
    return cats.map((cat) => {
      const games = gamesOf(cat);
      return `
        <section class="lobby-section">
          <div class="lobby-head">
            <h2>${Casino.icon(cat.icon)} ${cat.label}</h2>
            <span class="lobby-rule"></span>
            <span class="lobby-sub">${games.length} game${games.length > 1 ? "s" : ""}</span>
          </div>
          <div class="game-grid">${games.map(cardHTML).join("")}</div>
        </section>`;
    }).join("");
  }

  function renderLobby() {
    view.innerHTML = `
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-badge">${Casino.icon("bot")} AI-powered · watch it play itself</div>
          <h1>Royal <span class="g">Casino</span></h1>
          <p>A full casino floor with simulated dollars — and a local AI that can play,
             narrate its reasoning, and report on its own sessions.</p>
          <div class="hero-stats">
            <span class="hero-stat">${Casino.icon("gamepad-2")} <b>${GAMES.length}</b> games</span>
            <span class="hero-stat">${Casino.icon("trending-up")} <b>~99%</b> RTP</span>
            <span class="hero-stat">${Casino.icon("cpu")} <b>AI</b> Lab built in</span>
          </div>
          <div class="hero-actions">
            <button class="btn" id="howBtn">${Casino.icon("info")} How it works</button>
            <button class="btn btn-ghost" id="heroAdd">+ Cash</button>
          </div>
        </div>
      </section>

      <div class="cat-chips" id="catChips">
        <button class="cat-chip ${lobbyFilter ? "" : "on"}" data-cat="">All games</button>
        ${CATEGORIES.map((c) => `<button class="cat-chip ${lobbyFilter === c.key ? "on" : ""}" data-cat="${c.key}">${Casino.icon(c.icon)} ${c.label}</button>`).join("")}
      </div>

      <div id="lobbyBody">${lobbySections()}</div>`;

    view.querySelector("#heroAdd").addEventListener("click", () => Casino.addFunds(500));
    view.querySelector("#howBtn").addEventListener("click", openInfo);

    view.querySelector("#catChips").addEventListener("click", (e) => {
      const chip = e.target.closest(".cat-chip");
      if (!chip) return;
      lobbyFilter = chip.dataset.cat || null;
      view.querySelectorAll(".cat-chip").forEach((c) => c.classList.toggle("on", c === chip));
      const body = view.querySelector("#lobbyBody");
      body.innerHTML = lobbySections();
      Casino.fx.reveal(body.querySelectorAll(".game-card"), { y: 22, stagger: 0.05, ease: "power3.out" });
      setActiveNav(lobbyFilter === "originals" ? "originals" : "lobby");
    });

    Casino.fx.reveal(view.querySelectorAll(".game-card"), { y: 24, stagger: 0.05, delay: 0.05, ease: "power3.out" });
  }

  /* ============================================================
     VIP Club (cosmetic / simulated — no real payments)
     ============================================================ */
  const VIP_TIERS = [
    { k: "Bronze",   ico: "award", c: "#c98a4b", at: 0,      perk: "Daily play-money top-up and access to the full floor." },
    { k: "Silver",   ico: "medal", c: "#c9d3e4", at: 2500,   perk: "Bigger top-ups, plus early access to new originals." },
    { k: "Gold",     ico: "trophy", c: "#f0c24f", at: 10000,  perk: "Priority support queue and a custom AI Lab preset." },
    { k: "Platinum", ico: "hexagon", c: "#7dd3fc", at: 50000,  perk: "Host-level perks — every table, every limit." },
    { k: "Diamond",  ico: "gem", c: "#a97bff", at: 250000, perk: "The whole vault. Bragging rights included." },
  ];

  function renderVip() {
    const bal = Casino.getBalance();
    let idx = 0;
    VIP_TIERS.forEach((t, i) => { if (bal >= t.at) idx = i; });
    const cur = VIP_TIERS[idx];
    const next = VIP_TIERS[idx + 1];
    const pct = next
      ? Math.max(0, Math.min(100, ((bal - cur.at) / (next.at - cur.at)) * 100))
      : 100;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("crown", "ico-title")} VIP Club</h2>
        <p class="page-sub">Cosmetic loyalty tiers driven by your simulated balance. Nothing here costs
        anything — Royal Casino is a play-money demo with no payments of any kind.</p>
      </div>

      <section class="vip-hero" data-anim>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <span class="vip-crest" style="color:${cur.c}">${Casino.icon(cur.ico)}</span>
          <div>
            <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:var(--faint);font-weight:800;">Current tier</div>
            <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:${cur.c};">${cur.k}</div>
          </div>
        </div>
        <div class="vip-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);">
          <span>${Casino.money(bal)} balance</span>
          <span>${next ? `${Casino.money(next.at)} to reach <b style="color:${next.c}">${next.k}</b>` : "Top tier reached"}</span>
        </div>
      </section>

      <div class="lobby-head">
        <h2>${Casino.icon("trophy")} All tiers</h2><span class="lobby-rule"></span>
        <span class="lobby-sub">${VIP_TIERS.length} tiers</span>
      </div>
      <div class="vip-tiers">
        ${VIP_TIERS.map((t, i) => `
          <div class="vip-tier ${i === idx ? "current" : ""}" data-anim style="--c:${t.c}">
            <div class="vt-ico">${Casino.icon(t.ico)}</div>
            <h4>${t.k}</h4>
            <p>${t.perk}</p>
            <div style="margin-top:10px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--faint);">
              ${t.at === 0 ? "Starting tier" : Casino.money(t.at) + " balance"}
            </div>
          </div>`).join("")}
      </div>`;

    Casino.fx.reveal(view.querySelectorAll("[data-anim]"), { y: 16, stagger: 0.05 });
  }

  /* ============================================================
     Live Support (simulated chat — nothing leaves the browser)
     ============================================================ */
  const SUPPORT_REPLIES = [
    "Happy to help! Remember this is a play-money demo — you can reset your balance from the header or the profile menu.",
    "You can add simulated cash any time with <b>+ Cash</b> in the top bar. No payment is ever involved.",
    "Every game has a <b>How to play</b> button explaining its odds and payouts.",
    "The <b>AI Lab</b> at the bottom of the screen hands the controls to a local Ollama model — press Start and watch it play.",
    "The <b>Rigged odds</b> toggle in the header tips the odds in your favour. It's a sandbox switch, off by default.",
    "Great question — the full agent documentation lives on the <b>AI Guide</b> page in the sidebar.",
  ];

  function renderSupport() {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("message-circle", "ico-title")} Live Support</h2>
        <p class="page-sub">A simulated support desk. Messages stay in this browser tab — nothing is sent
        anywhere, and no account or payment data exists to discuss.</p>
      </div>

      <div class="chat-wrap">
        <div class="panel">
          <div class="chat-log" id="chatLog">
            <div class="chat-msg">
              <div class="chat-av">${Casino.icon("headset")}</div>
              <div class="chat-bubble">Hey there — Ruby from Royal Casino support. What can I help you with?
                <span class="chat-time">just now</span></div>
            </div>
          </div>
          <div class="chat-input-row">
            <input class="input" id="chatInput" placeholder="Type a message…" autocomplete="off" />
            <button class="btn" id="chatSend">Send</button>
          </div>
        </div>

        <div class="panel">
          <div class="controls-title">Support status</div>
          <div class="stat-grid" style="grid-template-columns:1fr;">
            <div class="stat"><div class="k">Agent</div><div class="v" style="font-size:15px">${Casino.icon("headset")} Ruby · online</div></div>
            <div class="stat"><div class="k">Avg. response</div><div class="v">~30s</div></div>
            <div class="stat"><div class="k">Queue</div><div class="v">0 waiting</div></div>
          </div>
          <div class="divider"></div>
          <div class="controls-title">Quick answers</div>
          <div class="bet-row" style="flex-direction:column;">
            <button class="btn btn-ghost btn-sm" data-nav="aiguide">${Casino.icon("book-open")} How does the AI work?</button>
            <button class="btn btn-ghost btn-sm" data-nav="vip">${Casino.icon("crown")} What are VIP tiers?</button>
            <button class="btn btn-ghost btn-sm" id="supportReset">${Casino.icon("rotate-ccw")} Reset my balance</button>
          </div>
          <div class="hint" style="margin-top:14px;">Royal Casino is a play-money demo. There are no
          deposits, withdrawals, accounts or real funds anywhere in this app.</div>
        </div>
      </div>`;

    const log = view.querySelector("#chatLog");
    const input = view.querySelector("#chatInput");
    let replyIdx = 0;

    function push(html, mine) {
      const row = Casino.el("div", "chat-msg" + (mine ? " me" : ""));
      row.innerHTML = `<div class="chat-av">${Casino.icon(mine ? "user" : "headset")}</div>
        <div class="chat-bubble">${html}<span class="chat-time">just now</span></div>`;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
      return row;
    }

    function send() {
      const text = input.value.trim();
      if (!text) return;
      push(text.replace(/[<>]/g, ""), true);
      input.value = "";
      const typing = push(`<span class="chat-typing"><i></i><i></i><i></i></span>`, false);
      setTimeout(() => {
        typing.querySelector(".chat-bubble").innerHTML =
          SUPPORT_REPLIES[replyIdx++ % SUPPORT_REPLIES.length] + `<span class="chat-time">just now</span>`;
        log.scrollTop = log.scrollHeight;
      }, 900);
    }

    view.querySelector("#chatSend").addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    view.querySelector("#supportReset").addEventListener("click", () => {
      if (confirm("Reset your balance to $1,000?")) Casino.reset();
    });
  }

  /* ---------- AI Guide — full documentation page ---------- */
  function renderAiGuide() {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("bot", "ico-title")} AI Guide</h2>
        <p class="page-sub">Exactly how the Royal Casino agent works — the decision pipeline, its two-layer mind,
        tilt, brainpower, every Lab control, and what each stat means.</p>
      </div>

      <div class="guide-grid">
        <div class="panel guide-sec" data-anim>
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

        <div class="panel guide-sec" data-anim>
          <h3>2 · The two-layer mind</h3>
          <p>The persona is deliberately split in two:</p>
          <ul>
            <li><b>SKILL — never compromised.</b> It always knows the correct play: blackjack basic strategy, which video-poker cards to hold, when a cash-out locks profit. <i>How</i> it plays a hand is competent, always.</li>
            <li><b>TEMPERAMENT — pure degenerate.</b> <i>How much</i> it bets and <i>how hard</i> it chases runs on emotion. Its current emotional state colors bet sizing, target-picking, and every logged reason.</li>
          </ul>
          <p>Result: a sharp regular who plays hands correctly and sizes bets like a maniac when tilted.</p>
        </div>

        <div class="panel guide-sec" data-anim>
          <h3>3 · The tilt meter</h3>
          <p>A 0–100 score tracks its emotional state, updated every round and fed into every decision as
          <code>emotional_state</code>:</p>
          <ul>
            <li>Each loss: <b>+9</b>, plus up to <b>+10</b> for loss streaks, plus <b>+14</b> if the hit was ≥15% of the starting bankroll.</li>
            <li>Each win: <b>−14</b>, and an extra <b>−16</b> for a big score.</li>
          </ul>
          <table class="guide-table">
            <tr><td><b>Ice cold</b> (0–19)</td><td>calm, sharp, sizes near the stake hint</td></tr>
            <tr><td><b>Steady</b> (20–44)</td><td>feels the swings, keeps it together</td></tr>
            <tr><td><b>Tilted</b> (45–69)</td><td>pressing bets, itching to win it back</td></tr>
            <tr><td><b>Full tilt</b> (70+)</td><td>betting angry, chasing everything</td></tr>
          </table>
          <p>Flip <b>Emotions</b> off in the Lab to disable tilt entirely — it plays <b>cold-blooded</b>,
          steady bet-sizing with no chasing (but it still runs its mouth in the reasoning).</p>
        </div>

        <div class="panel guide-sec" data-anim>
          <h3>4 · Brainpower dial</h3>
          <p>One slider controls how long the model may think per decision — its token budget — and its
          sampling temperature together:</p>
          <table class="guide-table">
            <tr><td><b>Instinct</b> (left)</td><td>~64 tokens, hot sampling (0.8) — fast gut calls, terse reasons</td></tr>
            <tr><td><b>Sharp</b> (middle)</td><td>~224 tokens, balanced (0.5) — the default</td></tr>
            <tr><td><b>Deep</b> (right)</td><td>~768 tokens, cool sampling (0.35) — slow, deliberate, fuller reasoning</td></tr>
          </table>
          <p>The scale is exponential between 64 and 768. Trade-off: low budgets are fast but can occasionally
          truncate a tool call (the fallback catches it — watch <b>Tool reliab.</b>); high budgets think harder
          and raise latency.</p>
        </div>

        <div class="panel guide-sec" data-anim>
          <h3>5 · Behavior controls</h3>
          <ul>
            <li><b>Aggression</b> — sets the <code>suggested_stake_hint</code> (aggression × bankroll). It's guidance, not a rule — temperament can defy it.</li>
            <li><b>Move speed</b> — the pause between actions, purely cosmetic pacing.</li>
            <li><b>Model</b> — any Ollama tag (default <code>qwen2.5:7b</code>).</li>
            <li><b>Compute</b> — GPU (Metal, default & fast) or CPU-only (<code>num_gpu:0</code>). CPU is slower/hotter but lets you watch the cores light up in the System monitor. Switching reloads the model.</li>
            <li><b>Agentic</b> — the AI free-roams the floor. Table choice is deliberately unbiased: options are shuffled, no game is favored, and the fallback pick is uniform-random.</li>
            <li><b>New game</b> — while roaming, forces it to a <i>different</i> table on the next round.</li>
          </ul>
        </div>

        <div class="panel guide-sec" data-anim>
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

        <div class="panel guide-sec" data-anim>
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

        <div class="panel guide-sec" data-anim>
          <h3>8 · The Rig toggle &amp; setup</h3>
          <p>The rig biases outcomes in the player's favor (~62% forced-favorable by default). The agent isn't
          told — it simply experiences an incredible heater, and its tilt cools accordingly. Forced wins on ten
          games; Blackjack &amp; Video Poker get "lucky refunds" instead.</p>
          <p><b>Requirements:</b> install Ollama, <code>ollama pull qwen2.5:7b</code>, and allow this origin via
          <code>OLLAMA_ORIGINS</code>. Without it every game still plays manually.</p>
        </div>
      </div>`;

    Casino.fx.reveal(view.querySelectorAll(".guide-sec"), { y: 18, stagger: 0.04 });
  }

  /* ---------- "How it works" explainer modal ---------- */
  const infoOverlay = document.createElement("div");
  infoOverlay.className = "report-overlay";
  infoOverlay.id = "infoOverlay";
  infoOverlay.innerHTML = `
    <div class="report-card">
      <div class="report-head">
        <h2 class="report-title">${Casino.icon("info", "ico-title")} How Royal Casino works</h2>
        <button class="btn btn-ghost btn-sm" id="infoClose">${Casino.icon("x")}</button>
      </div>
      <div class="report-section">
        <h4>The games (${GAMES.length})</h4>
        <div class="info-body">Table games — Blackjack, <b>Texas Hold'em</b> (vs. betting bots), Video Poker,
        Hilo and Roulette. Originals — Dice, Mines, Crash, Limbo, Plinko, Tower, Wheel and <b>Chicken Road</b>.
        Slots — Lucky Sevens and <b>Cosmic Gems</b>. All play with simulated dollars stored in your browser;
        nothing uses real money. Find them in the lobby, grouped by type, or in the <b>sidebar</b> on the left.
        Every game has sound (toggle with the sound button); each has a built-in explainer
        of its odds.</div>
      </div>
      <div class="report-section">
        <h4>Rigged odds</h4>
        <div class="info-body">The <b>Rig</b> button in the top bar flips the odds into <b>your</b> favor so
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
        <div class="info-body">Open the <b>AI Lab</b> (sidebar, or the dock at the bottom of any game) and the app
        can hand the controls to a local LLM (via Ollama) that plays autonomously — sizing bets to its bankroll,
        picking moves, and <b>logging its reasoning</b> for every decision. It plays like a gambler:
        risk-hungry but self-preserving, with real emotion behind its calls.</div>
      </div>
      <div class="report-section">
        <h4>What it can do</h4>
        <div class="info-body">
          <ul class="info-list">
            <li><b>Agentic mode</b> — the AI free-roams between games, choosing where to play next.</li>
            <li><b>Aggression &amp; speed</b> sliders shape how it bets and how fast it moves.</li>
            <li><b>Brainpower</b> — pick how many tokens it may think with per decision (Instinct / Sharp / Deep).</li>
            <li><b>Tilt meter</b> — losses build real tilt that bleeds into its bet sizing and trash talk; wins cool it off. Toggle Emotions off for cold, steady play.</li>
            <li><b>Poker</b> — it can sit at Texas Hold'em too; it's fed its live win-odds &amp; pot odds to bet, fold and bluff.</li>
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
        <button class="btn btn-ghost" id="infoGuide" data-nav="aiguide">${Casino.icon("book-open")} Full AI guide</button>
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

  /* ============================================================
     Router
     ============================================================ */
  let currentRoute = null;

  function renderRoute(id) {
    // #view is a permanent mount — clear any animation state left on it by the
    // previous route before rendering, or a stalled tween can leave the whole
    // app invisible. Cheap, and makes every render start from a known state.
    Casino.fx.resetMount(view);

    if (id === "lobby")     { lobbyFilter = null;        renderLobby();   return; }
    if (id === "originals") { lobbyFilter = "originals"; renderLobby();   return; }
    if (id === "vip")       { renderVip();      return; }
    if (id === "support")   { renderSupport();  return; }
    if (id === "aiguide")   { renderAiGuide();  return; }
    const game = byId(id);
    if (!game) { lobbyFilter = null; renderLobby(); return; }
    game.render(view);
    Casino.fx.enter(view, { y: 12 });
  }

  function navigate(id) {
    if (!byId(id) && !PAGES[id]) id = "lobby";
    currentRoute = id;
    setActiveNav(id);
    closeSidebar();
    // .app-main is the scroll pane now, not the window.
    const pane = document.querySelector(".app-main");
    (pane || window).scrollTo({ top: 0, behavior: Casino.fx.reduced() ? "auto" : "smooth" });
    // Keep the hash authoritative — agent-ui's currentGameId() reads it.
    const hash = id === "lobby" ? "" : id;
    if (location.hash.replace("#", "") !== hash) location.hash = hash;
    renderRoute(id);
  }

  // The agent's switchToGame() falls back to setting location.hash directly when
  // no [data-nav] link exists. Honour that (guarded so our own writes don't loop).
  window.addEventListener("hashchange", () => {
    const id = location.hash.replace("#", "") || "lobby";
    if (id === currentRoute) return;
    navigate(id);
  });

  // Event delegation for anything with a data-nav attribute.
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-nav]");
    closeProfile();
    if (target) navigate(target.dataset.nav);
  });

  // Global UI "click" blip for game controls — one place covers every game
  // (action buttons, quick-bet chips, tiles, hold slots, the roulette felt).
  // Capture phase so it fires regardless of per-game handlers.
  const CLICKABLE =
    "button, [data-bet], .tile, .vp-slot, .rt-num, .rt-out, .rt-doz, .rt-col, .rt-zero, .rt-chip-btn";
  document.addEventListener("click", (e) => {
    const hit = e.target.closest(CLICKABLE);
    if (!hit) return;
    Casino.sound.play("click");
    // Tactile press on the real controls — every game's action buttons, the
    // AI Lab's Start, quick-bet chips and reveal tiles, from one place.
    if (hit.matches(".btn, .cat-chip, .icon-btn, .chip-btn, .rt-chip-btn, .tile, .brain-stage, .pm-item")) {
      Casino.fx.press(hit);
    }
  }, true);

  /* ============================================================
     Header controls
     ============================================================ */
  // Profile dropdown
  const profileBtn = document.getElementById("profileBtn");
  const profileMenu = document.getElementById("profileMenu");
  function closeProfile() {
    if (!profileMenu) return;
    profileMenu.classList.remove("open");
    profileBtn.setAttribute("aria-expanded", "false");
  }
  if (profileBtn) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = profileMenu.classList.toggle("open");
      profileBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    profileMenu.addEventListener("click", (e) => { if (!e.target.closest("[data-nav]")) e.stopPropagation(); });
  }
  document.addEventListener("click", closeProfile);

  // AI Lab sidebar entry — opens the Lab dock (agent-lab.js owns it).
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#sbAiLab")) return;
    closeSidebar();
    if (window.RoyalLab && window.RoyalLab.open) window.RoyalLab.open();
    else Casino.toast("The AI Lab isn't loaded in this build.", "info");
  });

  // Sound mute toggle (persists across sessions).
  const muteBtn = document.getElementById("muteBtn");
  const pmMute = document.getElementById("pmMute");
  function syncMuteBtn() {
    const muted = Casino.sound.isMuted();
    muteBtn.innerHTML = Casino.icon(muted ? "volume-x" : "volume-2");
    muteBtn.title = muted ? "Sound off — click to unmute" : "Sound on — click to mute";
    if (pmMute) {
      pmMute.innerHTML = `${Casino.icon(muted ? "volume-x" : "volume-2")} Sound · ${muted ? "off" : "on"}`;
      pmMute.classList.toggle("on", !muted);
    }
  }
  function toggleMute() {
    const muted = Casino.sound.toggleMute();
    if (!muted) Casino.sound.play("click"); // give immediate feedback when turning on
    syncMuteBtn();
  }
  muteBtn.addEventListener("click", toggleMute);
  if (pmMute) pmMute.addEventListener("click", toggleMute);
  syncMuteBtn();

  // Rigged-odds toggle (persists). When on, games force favorable outcomes.
  const cheatBtn = document.getElementById("cheatBtn");
  const pmCheat = document.getElementById("pmCheat");
  function syncCheatBtn() {
    const on = Casino.cheat.isOn();
    cheatBtn.classList.toggle("cheat-on", on);
    cheatBtn.title = on
      ? `Odds rigged in your favor (~${Math.round(Casino.cheat.getStrength() * 100)}%). Click to disable.`
      : "Rig the odds in your favor";
    if (pmCheat) {
      pmCheat.innerHTML = `${Casino.icon("wand-2")} Rigged odds · ${on ? "on" : "off"}`;
      pmCheat.classList.toggle("on", on);
    }
  }
  function toggleCheat() {
    const on = Casino.cheat.toggle();
    syncCheatBtn();
    Casino.toast(on ? "Odds now rigged in your favor." : "Odds back to normal (house edge restored).", on ? "win" : "info");
  }
  cheatBtn.addEventListener("click", toggleCheat);
  if (pmCheat) pmCheat.addEventListener("click", toggleCheat);
  syncCheatBtn();

  document.getElementById("addFundsBtn").addEventListener("click", () => Casino.addFunds(500));
  function doReset() { if (confirm("Reset your balance to $1,000?")) Casino.reset(); }
  document.getElementById("resetBtn").addEventListener("click", doReset);
  const pmReset = document.getElementById("pmReset");
  if (pmReset) pmReset.addEventListener("click", doReset);

  // Boot
  buildSidebar();
  Casino.renderBalance();
  const start = location.hash.replace("#", "");
  navigate(start && (PAGES[start] || byId(start)) ? start : "lobby");
})();
