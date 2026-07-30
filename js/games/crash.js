/* ============================================================
   Crash — multiplier climbs from 1.00x; cash out before it crashes
   ============================================================ */
const CrashGame = (() => {
  const HOUSE_EDGE = 0.99;      // ~1% edge, consistent with Dice/Mines
  const MS_PER_DOUBLING = 2500; // multiplier doubles every 2.5s of real time

  let history = []; // past crash points
  let state = "idle"; // idle | running | crashed
  let cashedOut = false;

  /** P(crash >= x) = HOUSE_EDGE / x for x >= 1 — a clean, constant house edge at any cash-out target. */
  function genCrashPoint() {
    const r = Math.random();
    const raw = HOUSE_EDGE / (1 - r);
    return Math.max(1.0, Math.floor(raw * 100) / 100);
  }

  // Accelerating climb: gentle creep at the start, then it takes off. The 1.5
  // power on the time makes early growth slower and later growth faster than a
  // plain exponential. (Pacing only — the crash point is drawn independently, so
  // fairness is unchanged.)
  function liveMultiplier(elapsedMs) {
    const x = Math.max(0, elapsedMs) / MS_PER_DOUBLING;
    return Math.pow(2, Math.pow(x, 1.5));
  }

  function render(view) {
    let betAmount = 20;
    let autoTarget = 0; // 0 = no auto cash-out
    let crashPoint = 1;
    let startTime = 0;
    let liveMult = 1;
    let cashedAtMult = 0;
    let points = []; // [{t, m}] for the chart
    let raf = null;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("rocket", "ico-title")} Crash</h2>
        <p class="page-sub">The multiplier climbs from 1.00×. Cash out before it crashes — wait too long and you lose it all.</p>
        ${Casino.helpBtnHTML("crashHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="crash-stage" data-state="idle" id="crashStage">
            <canvas id="crashCanvas" class="crash-canvas"></canvas>
            <div class="crash-mult idle" id="crashMult">1.00×</div>
            <div class="crash-result" id="crashResult"></div>
          </div>
          <div class="divider"></div>
          <div class="history">
            <h4>Recent crashes</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}

          <div class="field">
            <label>Auto cash-out at (0 = off, manual only)</label>
            <input class="input" id="autoInput" type="number" min="0" step="0.1" value="2.0" />
            <div class="bet-row">
              <button class="btn btn-ghost" data-auto="1.5">1.5×</button>
              <button class="btn btn-ghost" data-auto="2">2×</button>
              <button class="btn btn-ghost" data-auto="3">3×</button>
              <button class="btn btn-ghost" data-auto="0">Off</button>
            </div>
          </div>

          <div class="stat-grid">
            <div class="stat"><div class="k">If cashed now</div><div class="v" id="potPay">—</div></div>
            <div class="stat"><div class="k">Last round</div><div class="v" id="lastRound">—</div></div>
          </div>

          <button class="btn btn-block btn-green" id="placeBetBtn" style="margin-top:16px;font-size:16px;padding:14px;">Place Bet</button>
          <button class="btn btn-block btn-red" id="cashOutBtn" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cash Out</button>
        </div>
      </div>`;

    const stage = view.querySelector("#crashStage");
    const canvas = view.querySelector("#crashCanvas");
    const ctx2d = canvas.getContext("2d");
    const multEl = view.querySelector("#crashMult");
    const resultEl = view.querySelector("#crashResult");
    const betInput = view.querySelector("#betInput");
    const autoInput = view.querySelector("#autoInput");
    const placeBtn = view.querySelector("#placeBetBtn");
    const cashBtn = view.querySelector("#cashOutBtn");
    const potPay = view.querySelector("#potPay");

    Casino.wireBet(view);
    view.querySelector("#crashHelp").addEventListener("click", () => Casino.openHowTo("How to play — Crash", `
      <h4>Goal</h4>
      <p>Place a bet, then watch the multiplier climb from <b>1.00×</b> upward. Hit <b>Cash Out</b> to collect your bet times the current multiplier — but if the rocket <b>crashes</b> before you cash out, you lose the whole bet.</p>
      <h4>Auto cash-out</h4>
      <p>Set an <b>auto cash-out</b> value and the game banks you automatically the instant the multiplier reaches it — handy for locking in a target without split-second timing. Set it to <b>0 / Off</b> to cash out manually.</p>
      <h4>The catch</h4>
      <p>The crash point is random every round: most rounds crash early, a few run very high. Bigger multipliers mean bigger wins but a much greater chance of busting first.</p>`));
    view.querySelectorAll("[data-auto]").forEach((b) => {
      b.addEventListener("click", () => { autoInput.value = b.dataset.auto; });
    });

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-14).reverse()
        .map((m) => `<span class="pill ${m >= 2 ? "win" : "lose"}">${m.toFixed(2)}×</span>`).join("");
    }

    function resizeCanvas() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    function drawChart() {
      resizeCanvas();
      const w = canvas.width, h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      if (points.length < 2) return;

      const maxT = Math.max(points[points.length - 1].t, 4000);
      const maxM = Math.max(2, liveMult * 1.15);
      const pad = 10;
      const x = (t) => pad + (t / maxT) * (w - 2 * pad);
      const y = (m) => h - pad - ((m - 1) / (maxM - 1)) * (h - 2 * pad);

      // faint gridlines
      ctx2d.strokeStyle = "rgba(138,150,173,0.15)";
      ctx2d.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const gy = pad + ((h - 2 * pad) / 4) * i;
        ctx2d.beginPath(); ctx2d.moveTo(pad, gy); ctx2d.lineTo(w - pad, gy); ctx2d.stroke();
      }

      const hot = state === "crashed" && !cashedOut;
      const grad = ctx2d.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, hot ? "rgba(239,77,106,0.30)" : "rgba(62,207,142,0.28)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx2d.beginPath();
      points.forEach((p, i) => (i ? ctx2d.lineTo(x(p.t), y(p.m)) : ctx2d.moveTo(x(p.t), y(p.m))));
      ctx2d.lineTo(x(points[points.length - 1].t), h - pad);
      ctx2d.lineTo(x(points[0].t), h - pad);
      ctx2d.closePath();
      ctx2d.fillStyle = grad; ctx2d.fill();

      ctx2d.strokeStyle = hot ? "#ef4d6a" : "#3ecf8e";
      ctx2d.lineWidth = 2.5;
      ctx2d.beginPath();
      points.forEach((p, i) => (i ? ctx2d.lineTo(x(p.t), y(p.m)) : ctx2d.moveTo(x(p.t), y(p.m))));
      ctx2d.stroke();

      // Rocket riding the tip of the line on the way up; 💥 at the crash point.
      const tip = points[points.length - 1];
      const tx = x(tip.t), ty = y(tip.m);
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      if (state === "running") {
        // tilt the rocket along the current slope so it "flies"
        const prev = points[points.length - 2] || tip;
        const ang = Math.atan2(y(tip.m) - y(prev.m), x(tip.t) - x(prev.t));
        ctx2d.save();
        ctx2d.translate(tx, ty);
        ctx2d.rotate(ang + Math.PI / 4); // 🚀 points up-right by default
        ctx2d.font = "22px serif";
        ctx2d.fillText("🚀", 0, 0);
        ctx2d.restore();
      } else if (state === "crashed" && !cashedOut) {
        ctx2d.font = "22px serif";
        ctx2d.fillText("💥", tx, ty);
      }
    }

    function updatePotential() {
      const bet = Math.floor(Number(betInput.value)) || 0;
      potPay.textContent = state === "running" && !cashedOut
        ? Casino.money(Math.floor(bet * liveMult))
        : "—";
    }

    function setMultDisplay() {
      multEl.textContent = liveMult.toFixed(2) + "×";
      multEl.className = "crash-mult " + (
        state === "crashed" ? (cashedOut ? "cashed" : "crashed")
        : cashedOut ? "cashed"
        : liveMult >= 5 ? "hot" : liveMult >= 2 ? "warm" : "running"
      );
    }

    function doCashOut(atMult) {
      if (cashedOut || state !== "running") return;
      cashedOut = true;
      cashedAtMult = atMult;
      const bet = Math.floor(Number(betInput.value));
      const win = Math.floor(bet * atMult);
      Casino.payout(win);
      Casino.sound.play(atMult >= 5 ? "bigwin" : "cashout");
      resultEl.textContent = `Cashed out @ ${atMult.toFixed(2)}× — +${Casino.money(win - bet)}`;
      resultEl.style.color = "var(--green)";
      Casino.toast(`Cashed out at ${atMult.toFixed(2)}× for ${Casino.money(win)}!`, "win");
      cashBtn.disabled = true;
      setMultDisplay();
    }

    function finishRound() {
      cancelAnimationFrame(raf);
      state = "crashed";
      stage.dataset.state = "crashed";
      cashBtn.disabled = true;
      history.push(crashPoint);
      updateHistory();
      view.querySelector("#lastRound").textContent = crashPoint.toFixed(2) + "×";

      if (!cashedOut) {
        resultEl.textContent = `Crashed @ ${crashPoint.toFixed(2)}× — lost ${Casino.money(Number(betInput.value))}`;
        resultEl.style.color = "var(--red)";
        Casino.sound.play("lose");
        Casino.toast(`Crashed at ${crashPoint.toFixed(2)}× — bet lost.`, "lose");
      }
      setMultDisplay();
      drawChart();
      updatePotential();

      setTimeout(() => {
        state = "idle";
        stage.dataset.state = "idle";
        placeBtn.disabled = false;
        resultEl.textContent = "";
        liveMult = 1; points = [];
        multEl.textContent = "1.00×";
        multEl.className = "crash-mult idle";
        drawChart();
      }, 1300);
    }

    function tick() {
      const elapsed = performance.now() - startTime;
      liveMult = liveMultiplier(elapsed);
      points.push({ t: elapsed, m: liveMult });

      if (liveMult >= crashPoint) {
        liveMult = crashPoint;
        points.push({ t: elapsed, m: liveMult });
        setMultDisplay();
        drawChart();
        finishRound();
        return;
      }

      if (autoTarget > 1 && !cashedOut && liveMult >= autoTarget) {
        doCashOut(autoTarget);
      }

      setMultDisplay();
      drawChart();
      updatePotential();
      raf = requestAnimationFrame(tick);
    }

    function placeBet() {
      if (state !== "idle") return;
      const bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      autoTarget = Number(autoInput.value) || 0;
      crashPoint = genCrashPoint();
      // Rigged odds: let the multiplier climb well past the auto cash-out.
      if (Casino.cheat.win()) {
        const tgt = autoTarget > 1 ? autoTarget : 2.5;
        crashPoint = Math.max(crashPoint, tgt * (1.1 + Math.random() * 0.6));
      }
      cashedOut = false;
      cashedAtMult = 0;
      points = [{ t: 0, m: 1 }];
      liveMult = 1;
      startTime = performance.now();

      state = "running";
      stage.dataset.state = "running";
      placeBtn.disabled = true;
      cashBtn.disabled = false;
      resultEl.textContent = "";
      setMultDisplay();
      raf = requestAnimationFrame(tick);
    }

    placeBtn.addEventListener("click", placeBet);
    cashBtn.addEventListener("click", () => {
      const elapsed = performance.now() - startTime;
      doCashOut(liveMultiplier(elapsed));
    });
    window.addEventListener("resize", drawChart);

    updateHistory();
    drawChart();
  }

  return { render };
})();
