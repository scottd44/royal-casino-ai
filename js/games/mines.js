/* ============================================================
   Mines — reveal gems, avoid mines, cash out
   ============================================================ */
const MinesGame = (() => {
  const SIZE = 25; // 5x5
  const HOUSE_EDGE = 0.99;

  let mineCount = 3;
  let mines = new Set();
  let revealed = new Set();
  let bet = 0;
  let active = false;

  // Fair multiplier after `picks` successful reveals with `m` mines on a 25-tile board.
  function multiplierAfter(picks, m) {
    let mult = 1;
    for (let i = 0; i < picks; i++) {
      mult *= (SIZE - i) / (SIZE - m - i);
    }
    return mult * HOUSE_EDGE;
  }

  function render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">💣 Mines</h2>
        <p class="page-sub">Uncover gems to grow your multiplier. Hit a mine and you lose the bet. Cash out any time.</p>
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="mines-grid" id="grid"></div>
          <div class="win-banner" id="minesMsg" style="margin-top:18px;">Set your bet and press Start.</div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="field">
            <label>Number of mines</label>
            <select class="input" id="mineSelect">
              ${[1,2,3,4,5,6,8,10,12,15,20,24].map((n) => `<option value="${n}" ${n===3?"selected":""}>${n} mines</option>`).join("")}
            </select>
          </div>

          <div class="stat-grid">
            <div class="stat"><div class="k">Gems found</div><div class="v" id="gemsFound">0</div></div>
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="curMult">1.00×</span></div></div>
            <div class="stat"><div class="k">Next tile</div><div class="v"><span class="multiplier-tag" id="nextMult">—</span></div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="cashVal">—</div></div>
          </div>

          <button class="btn btn-block btn-green" id="startBtn" style="margin-top:16px;font-size:16px;padding:14px;">Start Game</button>
          <button class="btn btn-block" id="cashBtn" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cash Out</button>
        </div>
      </div>`;

    const grid = view.querySelector("#grid");
    const betInput = view.querySelector("#betInput");
    const mineSelect = view.querySelector("#mineSelect");
    const startBtn = view.querySelector("#startBtn");
    const cashBtn = view.querySelector("#cashBtn");
    const msg = view.querySelector("#minesMsg");

    Casino.wireBet(view);

    function buildGrid() {
      grid.innerHTML = "";
      for (let i = 0; i < SIZE; i++) {
        const t = Casino.el("div", "tile", "");
        t.dataset.idx = i;
        t.addEventListener("click", () => onTile(i, t));
        grid.appendChild(t);
      }
    }

    function updateStats() {
      const picks = revealed.size;
      const cur = picks === 0 ? 1 : multiplierAfter(picks, mineCount);
      const next = multiplierAfter(picks + 1, mineCount);
      view.querySelector("#gemsFound").textContent = picks;
      view.querySelector("#curMult").textContent = cur.toFixed(2) + "×";
      view.querySelector("#nextMult").textContent = active ? next.toFixed(2) + "×" : "—";
      view.querySelector("#cashVal").textContent = active ? Casino.fmt(Math.floor(bet * cur)) : "—";
    }

    function start() {
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      mineCount = Number(mineSelect.value);
      mines = new Set();
      revealed = new Set();
      while (mines.size < mineCount) mines.add(Casino.randInt(0, SIZE - 1));
      active = true;
      buildGrid();
      msg.textContent = "Pick a tile…";
      msg.style.color = "var(--gold-2)";
      startBtn.disabled = true;
      cashBtn.disabled = false;
      betInput.disabled = true;
      mineSelect.disabled = true;
      updateStats();
    }

    function revealAll(hitIdx) {
      grid.querySelectorAll(".tile").forEach((t) => {
        const i = Number(t.dataset.idx);
        t.classList.add("revealed");
        if (mines.has(i)) {
          t.classList.add("mine");
          t.textContent = "💣";
          if (i !== hitIdx) t.classList.add("dim");
        } else if (!revealed.has(i)) {
          t.textContent = "💎";
          t.classList.add("dim");
        }
      });
    }

    function endLoss(hitIdx) {
      active = false;
      revealAll(hitIdx);
      msg.textContent = `💥 Boom! You hit a mine and lost ${Casino.money(bet)}.`;
      msg.style.color = "var(--red)";
      Casino.sound.play("lose");
      Casino.toast(`Hit a mine — lost ${Casino.money(bet)}.`, "lose");
      resetButtons();
    }

    function cashOut() {
      if (!active || revealed.size === 0) {
        Casino.toast("Reveal at least one gem before cashing out.", "info");
        return;
      }
      const mult = multiplierAfter(revealed.size, mineCount);
      const winnings = Math.floor(bet * mult);
      Casino.payout(winnings);
      active = false;
      revealAll(-1);
      msg.textContent = `Cashed out ${mult.toFixed(2)}× — +${Casino.fmt(winnings - bet)} profit!`;
      msg.style.color = "var(--green)";
      Casino.sound.play(mult >= 3 ? "bigwin" : "cashout");
      Casino.toast(`Cashed out ${Casino.money(winnings)} (${mult.toFixed(2)}×)!`, "win");
      resetButtons();
    }

    function resetButtons() {
      startBtn.disabled = false;
      cashBtn.disabled = true;
      betInput.disabled = false;
      mineSelect.disabled = false;
      view.querySelector("#nextMult").textContent = "—";
      view.querySelector("#cashVal").textContent = "—";
    }

    function onTile(i, t) {
      if (!active || revealed.has(i)) return;
      // Rigged odds: if this tile is a mine, quietly move it to a safe spot.
      if (mines.has(i) && Casino.cheat.win()) {
        const safe = [];
        for (let k = 0; k < SIZE; k++) if (!mines.has(k) && !revealed.has(k) && k !== i) safe.push(k);
        if (safe.length) { mines.delete(i); mines.add(Casino.pick(safe)); }
      }
      if (mines.has(i)) {
        t.classList.add("revealed", "mine");
        t.textContent = "💣";
        endLoss(i);
        return;
      }
      revealed.add(i);
      t.classList.add("revealed", "gem");
      t.textContent = "💎";
      updateStats();

      // Auto-win if every safe tile is revealed.
      if (revealed.size === SIZE - mineCount) {
        Casino.toast("Cleared the board!", "win");
        cashOut();
      }
    }

    startBtn.addEventListener("click", start);
    cashBtn.addEventListener("click", cashOut);
    buildGrid();
    updateStats();
  }

  return { render };
})();
