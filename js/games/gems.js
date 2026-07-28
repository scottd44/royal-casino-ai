/* ============================================================
   Cosmic Gems — 3×3 video slot, 5 paylines
   ------------------------------------------------------------
   Nine independently-drawn cells. Five lines pay on 3-of-a-kind
   (3 rows + 2 diagonals); each line stakes 1/5 of the bet. Weights
   and pays are tuned to ~99.2% RTP (verified by simulation).
   Deliberately different from Lucky Sevens: a grid, many lines,
   simultaneous wins, and a cool gem theme.
   ============================================================ */
const GemsGame = (() => {
  // pay is per line, on the total bet split across 5 lines.
  const SYMBOLS = [
    { s: "💎", name: "Diamond",  w: 2,  pay: 240 },
    { s: "⭐", name: "Star",     w: 3,  pay: 117 },
    { s: "🔮", name: "Orb",      w: 4,  pay: 62 },
    { s: "🟣", name: "Amethyst", w: 6,  pay: 30 },
    { s: "🔷", name: "Sapphire", w: 8,  pay: 18 },
    { s: "🟢", name: "Emerald",  w: 11, pay: 10.7 },
  ];
  const LINES = [
    { idx: [0, 1, 2], name: "Top row" },
    { idx: [3, 4, 5], name: "Middle row" },
    { idx: [6, 7, 8], name: "Bottom row" },
    { idx: [0, 4, 8], name: "Diagonal ↘" },
    { idx: [2, 4, 6], name: "Diagonal ↙" },
  ];

  const pool = [];
  SYMBOLS.forEach((sym, i) => { for (let k = 0; k < sym.w; k++) pool.push(i); });
  const drawIdx = () => pool[Math.floor(Math.random() * pool.length)];
  const paySym = (i) => SYMBOLS[i];

  let spinning = false;
  let history = [];

  function render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("gem", "ico-title")} Cosmic Gems</h2>
        <p class="page-sub">A 3×3 gem slot with 5 paylines — three rows and both diagonals. Match three gems on any line; several lines can hit at once.</p>
        ${Casino.helpBtnHTML("gemsHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="gem-machine">
            <div class="gem-grid" id="gemGrid"></div>
            <div class="win-banner" id="gemBanner"></div>
            <div class="payline-note">5 paylines · bet splits across all lines</div>
          </div>
          <div class="divider"></div>
          <div class="paytable">
            <table>
              ${SYMBOLS.map((s) => `<tr><td>${s.s} ${s.s} ${s.s} <span style="color:var(--muted)">${s.name}</span></td><td>${s.pay}×</td></tr>`).join("")}
            </table>
          </div>
        </div>

        <div class="panel">
          <p class="controls-title">Place your bet</p>
          ${Casino.betFieldHTML(20)}
          <button class="btn btn-block btn-purple" id="gemSpinBtn" style="font-size:17px;padding:15px;">SPIN</button>
          <div class="stat-grid" style="margin-top:16px;">
            <div class="stat"><div class="k">Lines hit</div><div class="v" id="linesHit">—</div></div>
            <div class="stat"><div class="k">Last win</div><div class="v" id="lastWin">—</div></div>
            <div class="stat"><div class="k">Best win</div><div class="v" id="bestWin">0</div></div>
          </div>
          <div class="history">
            <h4>Recent spins</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>
      </div>`;

    const grid = view.querySelector("#gemGrid");
    const spinBtn = view.querySelector("#gemSpinBtn");
    const banner = view.querySelector("#gemBanner");
    const betInput = view.querySelector("#betInput");
    let bestWin = 0;

    Casino.wireBet(view);
    view.querySelector("#gemsHelp").addEventListener("click", () => Casino.openHowTo("How to play — Cosmic Gems", `
      <h4>Goal</h4>
      <p>Spin a <b>3×3</b> grid of gems. There are <b>5 paylines</b>: the three horizontal rows plus both diagonals. Land <b>three matching gems</b> on any line to win that line.</p>
      <h4>Multiple wins at once</h4>
      <p>Because lines overlap, a single spin can hit <b>several paylines</b> together — the <b>Lines hit</b> stat shows how many landed. Your bet is split across all five lines, and every winning line pays per the table.</p>
      <h4>Payouts</h4>
      <p>Rarer gems pay more (three of the top gem is the jackpot). The full payout table is shown beside the grid.</p>`));

    // Build 9 cells.
    let cells = [];
    for (let i = 0; i < 9; i++) {
      const c = Casino.el("div", "gem-cell", "💠");
      c.dataset.idx = i;
      grid.appendChild(c);
      cells.push(c);
    }

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-8).reverse()
        .map((w) => `<span class="pill ${w > 0 ? "win" : "lose"}">${w > 0 ? "+" + Casino.fmt(w) : "—"}</span>`).join("");
    }

    function evaluate(g, betAmount) {
      const lineStake = betAmount / 5;
      let win = 0, hit = [], winCells = new Set();
      for (const L of LINES) {
        const [a, b, c] = L.idx;
        if (g[a] === g[b] && g[b] === g[c]) {
          win += paySym(g[a]).pay * lineStake;
          hit.push(L.name);
          L.idx.forEach((i) => winCells.add(i));
        }
      }
      return { win: Math.floor(win), hit, winCells };
    }

    function doSpin() {
      if (spinning) return;
      const betAmount = Math.floor(Number(betInput.value));
      if (!Casino.bet(betAmount)) return;

      spinning = true;
      spinBtn.disabled = true;
      banner.textContent = "";
      cells.forEach((c) => c.classList.remove("win"));

      // Final grid (independent draws), with an optional rigged winning line.
      const g = Array.from({ length: 9 }, drawIdx);
      if (Casino.cheat.win()) {
        const L = Casino.pick(LINES);
        const sym = drawIdx();
        L.idx.forEach((i) => (g[i] = sym));
      }

      const locked = new Set();
      const anim = setInterval(() => {
        cells.forEach((c, i) => { if (!locked.has(i)) c.textContent = SYMBOLS[drawIdx()].s; });
      }, 60);

      // Reveal column by column (cells c, c+3, c+6).
      [0, 1, 2].forEach((col) => {
        setTimeout(() => {
          [col, col + 3, col + 6].forEach((i) => { locked.add(i); cells[i].textContent = SYMBOLS[g[i]].s; });
          Casino.sound.play("tick");
          if (col === 2) { clearInterval(anim); finish(g, betAmount); }
        }, 520 + col * 340);
      });
    }

    function finish(g, betAmount) {
      const r = evaluate(g, betAmount);
      view.querySelector("#linesHit").textContent = r.hit.length || "0";
      if (r.win > 0) {
        Casino.payout(r.win);
        r.winCells.forEach((i) => cells[i].classList.add("win"));
        const big = r.win >= betAmount * 15;
        Casino.sound.play(big ? "bigwin" : "win");
        banner.textContent = `${r.hit.length} line${r.hit.length > 1 ? "s" : ""} · +${Casino.fmt(r.win)}`;
        Casino.toast(`${r.hit.length} line win — +${Casino.fmt(r.win)}!`, "win");
        view.querySelector("#lastWin").textContent = "+" + Casino.fmt(r.win);
        if (r.win > bestWin) { bestWin = r.win; view.querySelector("#bestWin").textContent = Casino.fmt(bestWin); }
      } else {
        Casino.sound.play("lose");
        banner.textContent = "No lines — spin again!";
        view.querySelector("#lastWin").textContent = "0";
      }
      history.push(r.win);
      updateHistory();
      spinning = false;
      spinBtn.disabled = false;
    }

    spinBtn.addEventListener("click", doSpin);
    updateHistory();
  }

  return { render };
})();
