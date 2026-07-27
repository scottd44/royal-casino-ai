/* ============================================================
   Moles — whack-a-mole push-your-luck (Mines-style math)
   ------------------------------------------------------------
   9 holes hide a chosen number of MOLES (safe) among traps.
   Whack a hole: find a mole → multiplier grows; hit a trap →
   bust and lose the bet. Cash out any time. Fewer moles = rarer
   finds = bigger multiplier steps. RTP is a constant 0.97 at
   every cash-out point (fair-odds pricing minus a 3% edge).
   ============================================================ */
const MolesGame = (() => {
  const HOLES = 9;              // 3×3 board
  const EDGE = 0.03;            // house edge → RTP 0.97
  const DEFAULT_MOLES = 3;

  // Cash-out multiplier after finding k moles, with M moles among HOLES holes.
  // (1-edge) × C(HOLES,k) / C(M,k)  =  (1-edge) × Π (HOLES-i)/(M-i)
  function multiplier(M, k) {
    let m = 1 - EDGE;
    for (let i = 0; i < k; i++) m *= (HOLES - i) / (M - i);
    return m;
  }

  const HOWTO = `
    <h4>Goal</h4>
    <p>Nine holes hide a number of <b>moles</b> (safe) that you choose; the rest are empty traps. <b>Whack a hole</b>
    to hunt for moles — each mole you find grows your multiplier. Cash out any time.</p>
    <h4>Risk = how many moles</h4>
    <p>Set the mole count before you play:</p>
    <ul>
      <li><b>Fewer moles</b> (e.g. 1 of 9) — hard to find, so each hit pays a <b>huge</b> jump.</li>
      <li><b>More moles</b> (e.g. 8 of 9) — easy to find, so the multiplier grows slowly and safely.</li>
    </ul>
    <h4>Bust</h4>
    <p>Whack an empty hole and the round ends — you lose the bet. Find <b>all</b> your moles to auto-collect the top
    multiplier. Every cash-out point carries the same fair <b>97%</b> return.</p>`;

  function render(view) {
    let bet = 0, moles = DEFAULT_MOLES, board = null, revealed = 0, found = 0, phase = "idle"; // idle · playing · over

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🐹 Moles</h2>
        <p class="page-sub">Whack holes to find the hidden moles. Each mole grows your multiplier — but an empty hole busts you. Fewer moles means bigger, riskier payouts.</p>
        ${Casino.helpBtnHTML("molHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="mol-wrap">
            <div class="mol-grid" id="molGrid"></div>
            <div class="win-banner" id="molMsg" style="margin-top:18px;">Set your bet and start whacking.</div>
          </div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="field" style="margin-top:12px;">
            <label>Moles (safe holes)</label>
            <select class="input" id="molSelect">
              ${[1,2,3,4,5,6,7,8].map((n) => `<option value="${n}" ${n===DEFAULT_MOLES?"selected":""}>${n} mole${n>1?"s":""} · ${HOLES-n} trap${HOLES-n>1?"s":""}</option>`).join("")}
            </select>
          </div>
          <div class="stat-grid" style="margin-top:14px;">
            <div class="stat"><div class="k">Moles found</div><div class="v" id="molFound">0</div></div>
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="molMult">1.00×</span></div></div>
            <div class="stat"><div class="k">Next mole</div><div class="v"><span class="multiplier-tag" id="molNext">—</span></div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="molCash">—</div></div>
          </div>
          <button class="btn btn-block btn-green" id="molStart" style="margin-top:16px;font-size:16px;padding:14px;">Start</button>
          <button class="btn btn-block" id="molCashBtn" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cash Out</button>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const grid = view.querySelector("#molGrid");
    const select = view.querySelector("#molSelect");
    const startBtn = view.querySelector("#molStart");
    const cashBtn = view.querySelector("#molCashBtn");
    const msg = view.querySelector("#molMsg");
    Casino.wireBet(view);
    view.querySelector("#molHelp").addEventListener("click", () => Casino.openHowTo("How to play — Moles", HOWTO));

    function buildGrid() {
      grid.innerHTML = Array.from({ length: HOLES }, (_, i) => `<button class="mol-hole" data-i="${i}"></button>`).join("");
      grid.querySelectorAll(".mol-hole").forEach((h) => h.addEventListener("click", () => whack(+h.dataset.i)));
    }
    buildGrid();

    function updateStats() {
      const next = phase === "playing" ? multiplier(moles, found + 1) : multiplier(moles, 1);
      view.querySelector("#molFound").textContent = phase === "playing" ? `${found}/${moles}` : "0";
      view.querySelector("#molMult").textContent = (phase === "playing" ? multiplier(moles, found) : 1).toFixed(2) + "×";
      view.querySelector("#molNext").textContent = (phase === "playing" && found < moles) ? next.toFixed(2) + "×" : "—";
      view.querySelector("#molCash").textContent = phase === "playing" && found > 0 ? Casino.money(Math.round(bet * multiplier(moles, found))) : "—";
    }

    function start() {
      if (phase === "playing") return;
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      moles = Number(select.value);
      // place moles among holes
      const idx = Array.from({ length: HOLES }, (_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      board = new Array(HOLES).fill(false);
      idx.slice(0, moles).forEach((i) => (board[i] = true)); // true = mole
      revealed = 0; found = 0; phase = "playing";
      startBtn.disabled = true; cashBtn.disabled = false; betInput.disabled = true; select.disabled = true;
      buildGrid();
      msg.textContent = "Whack a hole!"; msg.className = "win-banner";
      Casino.sound.play("tick");
      updateStats();
    }

    function whack(i) {
      if (phase !== "playing") return;
      const hole = grid.querySelector(`.mol-hole[data-i="${i}"]`);
      if (!hole || hole.classList.contains("done")) return;
      // 😈 rig: turn a trap into a mole when the cheat fires and a mole is still buried
      if (!board[i] && Casino.cheat.win()) {
        const buried = board.findIndex((v, j) => v && !grid.querySelector(`.mol-hole[data-i="${j}"]`).classList.contains("done"));
        if (buried >= 0) { board[buried] = false; board[i] = true; }
      }
      hole.classList.add("done");
      revealed++;
      if (board[i]) { // mole!
        found++;
        hole.classList.add("mole"); hole.textContent = "🐹";
        Casino.sound.play("win");
        if (found >= moles) { updateStats(); cashOut(true); return; }
        msg.textContent = `Mole! ${multiplier(moles, found).toFixed(2)}× — keep going or cash out.`; msg.className = "win-banner win";
        updateStats();
      } else { // trap → bust
        hole.classList.add("trap"); hole.textContent = "💥";
        revealAll(i);
        phase = "over";
        startBtn.disabled = false; cashBtn.disabled = true; betInput.disabled = false; select.disabled = false;
        msg.textContent = `Empty hole — busted! Lost ${Casino.money(bet)}.`; msg.className = "win-banner lose";
        Casino.sound.play("lose");
        updateStats();
      }
    }

    function revealAll(exceptTrap) {
      board.forEach((isMole, j) => {
        const h = grid.querySelector(`.mol-hole[data-i="${j}"]`);
        if (!h || h.classList.contains("done")) return;
        h.classList.add("done", "faint");
        h.textContent = isMole ? "🐹" : "·";
      });
    }

    function cashOut(auto) {
      if (phase !== "playing") return;
      const mult = multiplier(moles, found);
      const ret = Math.round(bet * mult);
      Casino.payout(ret);
      phase = "over";
      startBtn.disabled = false; cashBtn.disabled = true; betInput.disabled = false; select.disabled = false;
      revealAll(-1);
      const net = ret - bet;
      msg.textContent = `${auto && found >= moles ? "All moles found! " : ""}Cashed out ${mult.toFixed(2)}× — ${net >= 0 ? "+" + Casino.fmt(net) : "-" + Casino.fmt(-net)}.`;
      msg.className = "win-banner " + (net >= 0 ? "win" : "lose");
      Casino.sound.play(net >= bet * 3 ? "bigwin" : "cashout");
      updateStats();
    }

    startBtn.addEventListener("click", start);
    cashBtn.addEventListener("click", () => cashOut(false));
    select.addEventListener("change", () => { moles = Number(select.value); updateStats(); });
    updateStats();

    window.MolesAPI = {
      inRound: () => phase === "playing",
      over: () => phase !== "playing",
      found: () => found,
      moles: () => moles,
      holesLeft: () => HOLES - revealed,
      start: (b, m) => { if (b != null) betInput.value = b; if (m != null) select.value = m; start(); },
      whackRandom: () => { const opts = [...grid.querySelectorAll(".mol-hole:not(.done)")]; if (opts.length) whack(+opts[Math.floor(Math.random() * opts.length)].dataset.i); },
      cashOut: () => cashOut(false),
    };
  }

  return { render, _t: { HOLES, EDGE, multiplier } };
})();
