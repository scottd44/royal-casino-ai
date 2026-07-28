/* ============================================================
   Snakes — roll around a 12-tile loop
   ------------------------------------------------------------
   Roll 2d6 and move clockwise. Land on a safe tile → your
   multiplier grows; land on a snake → bust and lose the bet.
   Up to 5 rolls per round; cash out any time after roll 1.
   Difficulty = how many of the 12 tiles are snakes. The multiplier
   schedule is calibrated to the true survival odds so every
   cash-out point returns a constant 0.97 (3% house edge).
   ============================================================ */
const SnakesGame = (() => {
  const TILES = 12, MAX_ROLLS = 5;
  const DIFF = [
    { key: "easy", label: "Easy", snakes: 1 },
    { key: "medium", label: "Medium", snakes: 3 },
    { key: "hard", label: "Hard", snakes: 5 },
    { key: "expert", label: "Expert", snakes: 7 },
    { key: "master", label: "Master", snakes: 9 },
  ];
  // cumulative cash-out multiplier after surviving k rolls (index 0 = after roll 1), per snake count.
  // derived from empirical survival curves so RTP is a constant 0.97 at every step.
  const SCHED = {
    1: [1.058, 1.16, 1.271, 1.393, 1.526],
    3: [1.293, 1.759, 2.387, 3.236, 4.386],
    5: [1.663, 2.981, 5.309, 9.395, 16.637],
    7: [2.325, 6.096, 15.746, 40.186, 101.891],
    9: [3.886, 18.965, 89.77, 402.935, 1719.858],
  };
  const multAfter = (snakes, k) => (k <= 0 ? 1 : SCHED[snakes][Math.min(k, MAX_ROLLS) - 1]);
  // 12 border cells of a 4×4 grid, clockwise from top-left → [gridRow, gridCol]
  const RING = [[1,1],[1,2],[1,3],[1,4],[2,4],[3,4],[4,4],[4,3],[4,2],[4,1],[3,1],[2,1]];

  const HOWTO = `
    <h4>Goal</h4>
    <p>Roll two dice and move your token clockwise around the 12-tile loop. Land on a <b>safe tile</b> and your
    multiplier grows; land on a <b>snake</b> and the round busts. Cash out any time after your first roll.</p>
    <h4>Difficulty = snakes</h4>
    <p>Pick how many of the 12 tiles are snakes — <b>Easy</b> (1) grows slowly and safely, <b>Master</b> (9) can pay
    over 1,700× but rarely survives:</p>
    <table>
      <tr><td>Easy · 1 snake</td><td>up to ${SCHED[1][4]}×</td></tr>
      <tr><td>Hard · 5 snakes</td><td>up to ${SCHED[5][4]}×</td></tr>
      <tr><td>Master · 9 snakes</td><td>up to ${Math.round(SCHED[9][4])}×</td></tr>
    </table>
    <h4>Push your luck</h4>
    <p>You get up to <b>${MAX_ROLLS} rolls</b> per round. After each safe roll, <b>Cash Out</b> to bank the multiplier
    or <b>Roll Again</b> to compound. Every cash-out point returns the same fair <b>97%</b>.</p>`;

  function render(view) {
    let bet = 0, snakes = 3, phase = "idle"; // idle · playing · over
    let board = null, pos = 0, rolls = 0, mult = 1, instant = false, busy = false;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("rc:snake", "ico-title")} Snakes</h2>
        <p class="page-sub">Roll 2d6 and race clockwise around the loop. Safe tiles compound your multiplier; snakes bust you. Cash out or push your luck up to 5 rolls.</p>
        ${Casino.helpBtnHTML("snHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="sn-board" id="snBoard"></div>
          <div class="bj-result" id="snMsg" style="margin-top:16px;">Pick a difficulty and roll.</div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="field" style="margin-top:12px;">
            <label>Difficulty (snakes)</label>
            <div class="bet-row sn-diff" id="snDiff">
              ${DIFF.map((d) => `<button class="btn btn-ghost ${d.snakes===3?"sel":""}" data-snakes="${d.snakes}">${d.label}</button>`).join("")}
            </div>
          </div>
          <div class="stat-grid" style="margin-top:14px;">
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="snMult">1.00×</span></div></div>
            <div class="stat"><div class="k">Roll</div><div class="v" id="snRoll">0 / ${MAX_ROLLS}</div></div>
            <div class="stat"><div class="k">Next roll</div><div class="v"><span class="multiplier-tag" id="snNext">—</span></div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="snCash">—</div></div>
          </div>
          <button class="btn btn-block btn-green" id="snRollBtn" style="margin-top:16px;font-size:16px;padding:14px;">${Casino.icon("dices")} Roll Dice</button>
          <button class="btn btn-block btn-gold" id="snCashBtn" style="margin-top:10px;font-size:16px;padding:14px;display:none;">Cash Out</button>
          <label class="vp-toggle" style="margin-top:12px;"><input type="checkbox" id="snInstant"> Instant roll <span>— skip the token animation</span></label>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const boardEl = view.querySelector("#snBoard");
    const rollBtn = view.querySelector("#snRollBtn");
    const cashBtn = view.querySelector("#snCashBtn");
    const msg = view.querySelector("#snMsg");
    Casino.wireBet(view);
    view.querySelector("#snHelp").addEventListener("click", () => Casino.openHowTo("How to play — Snakes", HOWTO));
    view.querySelector("#snInstant").addEventListener("change", (e) => (instant = e.target.checked));

    function buildBoard() {
      let html = "";
      for (let i = 0; i < TILES; i++) {
        const [gr, gc] = RING[i];
        html += `<div class="sn-tile" id="snT${i}" style="grid-row:${gr};grid-column:${gc};"><span class="sn-tile-n">${i + 1}</span><span class="sn-tile-face"></span></div>`;
      }
      html += `<div class="sn-center" id="snCenter">
        <div class="sn-dice" id="snDice"><span>⚁</span><span>⚄</span></div>
        <div class="sn-total" id="snTotal">Total —</div>
      </div>`;
      boardEl.innerHTML = html;
    }
    buildBoard();

    const tile = (i) => view.querySelector(`#snT${i}`);
    function setToken(i) { for (let j = 0; j < TILES; j++) tile(j).classList.toggle("token", j === i); }

    function updateStats() {
      view.querySelector("#snMult").textContent = mult.toFixed(2) + "×";
      view.querySelector("#snRoll").textContent = `${rolls} / ${MAX_ROLLS}`;
      view.querySelector("#snNext").textContent = phase === "playing" && rolls < MAX_ROLLS ? multAfter(snakes, rolls + 1).toFixed(2) + "×" : "—";
      view.querySelector("#snCash").textContent = phase === "playing" && rolls > 0 ? Casino.money(Math.round(bet * mult)) : "—";
    }

    function start() {
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return false;
      board = new Array(TILES).fill(false);
      const idx = Array.from({ length: TILES }, (_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      idx.slice(0, snakes).forEach((i) => (board[i] = true));
      pos = 0; rolls = 0; mult = 1; phase = "playing";
      betInput.disabled = true;
      view.querySelectorAll("#snDiff .btn").forEach((b) => (b.disabled = true));
      buildBoard(); setToken(0);
      cashBtn.style.display = "block";
      updateStats();
      return true;
    }

    const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    function doRoll() {
      if (busy) return;
      if (phase !== "playing") { if (!start()) return; }
      if (rolls >= MAX_ROLLS) return;
      busy = true; rollBtn.disabled = true; cashBtn.disabled = true;
      let d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
      let sum = d1 + d2;
      let land = (pos + sum) % TILES;
      // 😈 rig: nudge the roll so you land on a safe tile if one is reachable
      if (Casino.cheat.win() && board[land]) {
        for (let s = 2; s <= 12; s++) { const t = (pos + s) % TILES; if (!board[t]) { sum = s; land = t; d1 = Math.min(6, sum - 1); d2 = sum - d1; break; } }
      }
      view.querySelector("#snDice").innerHTML = `<span>${DICE[d1 - 1]}</span><span>${DICE[d2 - 1]}</span>`;
      view.querySelector("#snTotal").textContent = "Total " + sum;
      Casino.sound.play("tick");

      const finish = () => {
        pos = land; rolls++;
        const t = tile(land);
        if (board[land]) { // snake → bust
          t.classList.add("snake", "revealed"); t.querySelector(".sn-tile-face").innerHTML = `<span class="sn-snake"></span>`;
          setToken(land);
          revealAll();
          phase = "over";
          msg.textContent = `Snake on tile ${land + 1}! Busted — lost ${Casino.money(bet)}.`; msg.style.color = "var(--red)";
          Casino.sound.play("lose");
          rollBtn.disabled = false; cashBtn.style.display = "none"; betInput.disabled = false;
          view.querySelectorAll("#snDiff .btn").forEach((b) => (b.disabled = false));
          rollBtn.innerHTML = Casino.icon("dices") + " Roll Dice";
          busy = false; updateStats();
        } else { // safe → multiply
          mult = multAfter(snakes, rolls);
          const step = mult / multAfter(snakes, rolls - 1);
          t.classList.add("safe", "revealed"); t.querySelector(".sn-tile-face").textContent = "×" + step.toFixed(2);
          setToken(land);
          Casino.sound.play("win");
          if (rolls >= MAX_ROLLS) {
            msg.textContent = `Survived all ${MAX_ROLLS} rolls at ${mult.toFixed(2)}× — auto cash-out!`; msg.style.color = "var(--green)";
            updateStats(); busy = false; cashOut(true);
          } else {
            msg.textContent = `Safe! ${mult.toFixed(2)}× — roll again or cash out.`; msg.style.color = "var(--green)";
            rollBtn.disabled = false; cashBtn.disabled = false; rollBtn.innerHTML = Casino.icon("dices") + " Roll Again";
            busy = false; updateStats();
          }
        }
      };

      if (instant) finish();
      else {
        // step the token around the loop
        let step = 0;
        const stepFn = () => {
          step++;
          setToken((pos + step) % TILES);
          if (step < sum) setTimeout(stepFn, 110);
          else setTimeout(finish, 160);
        };
        setTimeout(stepFn, 120);
      }
    }

    function revealAll() {
      for (let i = 0; i < TILES; i++) {
        const t = tile(i); if (t.classList.contains("revealed")) continue;
        if (board[i]) { t.classList.add("snake", "faint"); t.querySelector(".sn-tile-face").innerHTML = `<span class="sn-snake"></span>`; }
      }
    }

    function cashOut(auto) {
      if (phase !== "playing" || rolls === 0) return;
      const ret = Math.round(bet * mult);
      Casino.payout(ret);
      phase = "over";
      revealAll();
      rollBtn.disabled = false; cashBtn.style.display = "none"; betInput.disabled = false;
      view.querySelectorAll("#snDiff .btn").forEach((b) => (b.disabled = false));
      rollBtn.innerHTML = Casino.icon("dices") + " Roll Dice";
      const net = ret - bet;
      msg.textContent = `Cashed out ${mult.toFixed(2)}× = ${Casino.money(ret)} (${net >= 0 ? "+" : ""}${Casino.fmt(net)}).`;
      msg.style.color = net >= 0 ? "var(--green)" : "var(--red)";
      if (!auto) Casino.sound.play(net >= bet * 3 ? "bigwin" : "cashout");
      updateStats();
    }

    view.querySelectorAll("#snDiff .btn").forEach((b) => b.addEventListener("click", () => {
      if (phase === "playing") return;
      snakes = Number(b.dataset.snakes);
      view.querySelectorAll("#snDiff .btn").forEach((x) => x.classList.toggle("sel", x === b));
      updateStats();
    }));
    rollBtn.addEventListener("click", doRoll);
    cashBtn.addEventListener("click", () => cashOut(false));
    updateStats();

    window.SnakesAPI = {
      inRound: () => phase === "playing",
      busy: () => busy,
      rolls: () => rolls,
      mult: () => mult,
      setDifficulty: (s) => { const b = view.querySelector(`#snDiff [data-snakes="${s}"]`); if (b && phase !== "playing") b.click(); },
      setInstant: (v) => { const c = view.querySelector("#snInstant"); c.checked = !!v; instant = !!v; },
      roll: () => doRoll(),
      cashOut: () => cashOut(false),
    };
  }

  return { render, _t: { TILES, MAX_ROLLS, SCHED, multAfter } };
})();
