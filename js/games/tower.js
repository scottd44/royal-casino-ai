/* ============================================================
   Tower — climb 8 rows, pick one safe tile per row, cash out
   ------------------------------------------------------------
   Each row has `tiles` cells, `safe` of them safe. Pick one to
   climb. Multiplier after L cleared rows = 0.99 * (tiles/safe)^L
   (house edge applied once, like Mines). Hit a mine and you lose.
   ============================================================ */
const TowerGame = (() => {
  const HOUSE_EDGE = 0.99;
  const ROWS = 8;
  const DIFFS = {
    easy:   { tiles: 4, safe: 3, label: "Easy" },
    medium: { tiles: 3, safe: 2, label: "Medium" },
    hard:   { tiles: 2, safe: 1, label: "Hard" },
    expert: { tiles: 3, safe: 1, label: "Expert" },
    master: { tiles: 4, safe: 1, label: "Master" },
  };

  let diff = "easy";
  let board = [];       // board[row] = array of "safe" | "mine"
  let cleared = 0;      // number of rows completed
  let bet = 0;
  let active = false;

  // Cumulative multiplier after `L` cleared rows for the given difficulty.
  function multiplierAfter(L, d) {
    if (L <= 0) return 0;
    return HOUSE_EDGE * Math.pow(d.tiles / d.safe, L);
  }

  function buildBoard(d) {
    const b = [];
    for (let r = 0; r < ROWS; r++) {
      const row = new Array(d.tiles).fill("safe");
      const mines = d.tiles - d.safe;
      const idxs = [...Array(d.tiles).keys()];
      for (let m = 0; m < mines; m++) {
        const pick = idxs.splice(Casino.randInt(0, idxs.length - 1), 1)[0];
        row[pick] = "mine";
      }
      b.push(row);
    }
    return b;
  }

  function render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🗼 Tower</h2>
        <p class="page-sub">Climb from the bottom. Pick a safe tile on each row to rise and grow your multiplier — one mine ends the run. Cash out any time.</p>
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="tower-grid" id="towerGrid"></div>
          <div class="win-banner" id="towerMsg" style="margin-top:18px;">Choose difficulty and press Start.</div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="field">
            <label>Difficulty</label>
            <select class="input" id="diffSelect">
              ${Object.entries(DIFFS).map(([k, d]) =>
                `<option value="${k}" ${k === "easy" ? "selected" : ""}>${d.label} — ${d.safe}/${d.tiles} safe</option>`).join("")}
            </select>
          </div>

          <div class="stat-grid">
            <div class="stat"><div class="k">Rows climbed</div><div class="v" id="rowsClimbed">0</div></div>
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="curMult">1.00×</span></div></div>
            <div class="stat"><div class="k">Next row</div><div class="v"><span class="multiplier-tag" id="nextMult">—</span></div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="cashVal">—</div></div>
          </div>

          <button class="btn btn-block btn-green" id="towerStart" style="margin-top:16px;font-size:16px;padding:14px;">Start Game</button>
          <button class="btn btn-block" id="cashBtn" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cash Out</button>
        </div>
      </div>`;

    const grid = view.querySelector("#towerGrid");
    const betInput = view.querySelector("#betInput");
    const diffSelect = view.querySelector("#diffSelect");
    const startBtn = view.querySelector("#towerStart");
    const cashBtn = view.querySelector("#cashBtn");
    const msg = view.querySelector("#towerMsg");

    Casino.wireBet(view);

    // Build the tower with the TOP row first so row 0 sits at the bottom.
    function buildGrid() {
      const d = DIFFS[diff];
      grid.innerHTML = "";
      for (let r = ROWS - 1; r >= 0; r--) {
        const rowEl = Casino.el("div", "tower-row");
        rowEl.dataset.row = r;
        for (let c = 0; c < d.tiles; c++) {
          const t = Casino.el("div", "tile tower-tile", "");
          t.dataset.row = r; t.dataset.col = c;
          t.addEventListener("click", () => onTile(r, c, t));
          rowEl.appendChild(t);
        }
        grid.appendChild(rowEl);
      }
      markActiveRow();
    }

    function markActiveRow() {
      grid.querySelectorAll(".tower-row").forEach((rowEl) => {
        const r = Number(rowEl.dataset.row);
        rowEl.classList.toggle("active", active && r === cleared);
        rowEl.classList.toggle("locked", active && r > cleared);
      });
    }

    function updateStats() {
      const d = DIFFS[diff];
      const cur = multiplierAfter(cleared, d);
      const next = multiplierAfter(cleared + 1, d);
      view.querySelector("#rowsClimbed").textContent = cleared;
      view.querySelector("#curMult").textContent = (cleared === 0 ? 1 : cur).toFixed(2) + "×";
      view.querySelector("#nextMult").textContent = active ? next.toFixed(2) + "×" : "—";
      view.querySelector("#cashVal").textContent = active && cleared > 0 ? Casino.fmt(Math.floor(bet * cur)) : "—";
    }

    function setControls(playing) {
      startBtn.disabled = playing;
      betInput.disabled = playing;
      diffSelect.disabled = playing;
      cashBtn.disabled = !(playing && cleared > 0);
    }

    function start() {
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      diff = diffSelect.value;
      board = buildBoard(DIFFS[diff]);
      cleared = 0;
      active = true;
      buildGrid();
      updateStats();
      setControls(true);
      msg.textContent = "Pick a tile on the bottom row…";
      msg.style.color = "var(--gold-2)";
    }

    function revealRow(r, hitCol) {
      const rowEl = grid.querySelector(`.tower-row[data-row="${r}"]`);
      if (!rowEl) return;
      rowEl.querySelectorAll(".tile").forEach((t) => {
        const c = Number(t.dataset.col);
        t.classList.add("revealed");
        if (board[r][c] === "mine") {
          t.classList.add("mine"); t.textContent = "💣";
          if (c !== hitCol) t.classList.add("dim");
        } else {
          t.classList.add("gem"); t.textContent = "💎";
          if (hitCol !== undefined && c !== hitCol) t.classList.add("dim");
        }
      });
    }

    function endLoss(r, hitCol) {
      active = false;
      for (let i = r; i < ROWS; i++) revealRow(i, i === r ? hitCol : undefined);
      Casino.sound.play("lose");
      msg.textContent = `💥 Mine on row ${r + 1}! Lost ${Casino.money(bet)}.`;
      msg.style.color = "var(--red)";
      markActiveRow();
      setControls(false);
      updateStats();
    }

    function finishWin() {
      const d = DIFFS[diff];
      const mult = multiplierAfter(ROWS, d);
      const winnings = Math.floor(bet * mult);
      Casino.payout(winnings);
      active = false;
      Casino.sound.play("bigwin");
      msg.textContent = `🏆 Reached the top! ${mult.toFixed(2)}× — +${Casino.fmt(winnings - bet)}!`;
      msg.style.color = "var(--green)";
      markActiveRow();
      setControls(false);
    }

    function onTile(r, c, t) {
      if (!active || r !== cleared || t.classList.contains("revealed")) return;
      // Rigged odds: if this tile is a mine, swap it with a safe tile in the row.
      if (board[r][c] === "mine" && Casino.cheat.win()) {
        const safeCols = [];
        for (let k = 0; k < board[r].length; k++) if (board[r][k] === "safe") safeCols.push(k);
        if (safeCols.length) { board[r][c] = "safe"; board[r][Casino.pick(safeCols)] = "mine"; }
      }
      if (board[r][c] === "mine") {
        t.classList.add("revealed", "mine");
        t.textContent = "💣";
        endLoss(r, c);
        return;
      }
      // Safe — reveal this row, climb.
      revealRow(r, c);
      Casino.sound.play("tick");
      cleared++;
      updateStats();
      if (cleared === ROWS) { finishWin(); return; }
      markActiveRow();
      setControls(true);
      msg.textContent = `Row ${cleared} cleared — keep climbing or cash out.`;
      msg.style.color = "var(--gold-2)";
    }

    function cashOut() {
      if (!active || cleared === 0) {
        Casino.toast("Clear at least one row before cashing out.", "info");
        return;
      }
      const mult = multiplierAfter(cleared, DIFFS[diff]);
      const winnings = Math.floor(bet * mult);
      Casino.payout(winnings);
      active = false;
      Casino.sound.play(mult >= 5 ? "bigwin" : "cashout");
      // reveal remaining rows for closure
      for (let i = cleared; i < ROWS; i++) revealRow(i, undefined);
      msg.textContent = `Cashed out ${mult.toFixed(2)}× — +${Casino.fmt(winnings - bet)} profit!`;
      msg.style.color = "var(--green)";
      markActiveRow();
      setControls(false);
      view.querySelector("#cashVal").textContent = "—";
    }

    diffSelect.addEventListener("change", () => { diff = diffSelect.value; if (!active) buildGrid(); });
    startBtn.addEventListener("click", start);
    cashBtn.addEventListener("click", cashOut);

    buildGrid();
    updateStats();
  }

  return { render };
})();
