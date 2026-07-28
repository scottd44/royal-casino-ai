/* ============================================================
   Wheel — compounding risk wheel (spin, accumulate, cash out)
   ------------------------------------------------------------
   Pick a risk level (Low/Medium/High/Risky). Each winning spin
   MULTIPLIES your running multiplier; a bust segment wipes it out.
   Keep spinning to grow it or cash out to bank bet × multiplier.
   Every risk is fair per spin (E[m]=1) with a 1% edge applied once
   at cash-out → 99% RTP wherever you stop.
   ============================================================ */
const WheelGame = (() => {
  const HOUSE_EDGE = 0.99;
  const S = 30; // segments per wheel

  const COLORS = {
    t1: "#f0883e",   // orange  (smallest wins)
    t2: "#4d8cff",   // blue
    t3: "#3ecf8e",   // green
    jack: "#e6c15a", // yellow  (jackpot)
    bust: "#333b49", // losing segment
  };

  // Each risk: `bust` losing segments + winning `tiers` [mult, count, colorKey].
  // Counts + bust = S, and Σ(mult·count) = S so each spin is fair (E[m]=1).
  const RISKS = {
    low:    { label: "Low",    bust: 10, tiers: [[1.1, 10, "t1"], [1.4, 6, "t2"], [1.9, 3, "t3"], [4.9, 1, "jack"]] },
    medium: { label: "Medium", bust: 17, tiers: [[1.5, 7, "t1"], [2, 3, "t2"], [3, 2, "t3"], [7.5, 1, "jack"]] },
    high:   { label: "High",   bust: 21, tiers: [[2, 5, "t1"], [3, 2, "t2"], [5, 1, "t3"], [9, 1, "jack"]] },
    risky:  { label: "Risky",  bust: 25, tiers: [[2, 2, "t1"], [4, 1, "t2"], [8, 1, "t3"], [14, 1, "jack"]] },
  };

  function buildSegments(riskKey) {
    const r = RISKS[riskKey];
    const segs = [];
    for (let i = 0; i < r.bust; i++) segs.push({ mult: 0, color: "bust", bust: true });
    r.tiers.forEach(([m, c, col]) => { for (let i = 0; i < c; i++) segs.push({ mult: m, color: col, bust: false }); });
    for (let i = segs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [segs[i], segs[j]] = [segs[j], segs[i]]; }
    return segs;
  }

  let history = [];

  function render(view) {
    let risk = "medium";
    let segments = [];
    let mult = 0;        // accumulated multiplier (0 = no active round)
    let bet = 0;
    let active = false;  // a round is in progress (≥1 winning spin, can cash out)
    let spinning = false;
    let wheelRot = 0;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("target", "ico-title")} Wheel</h2>
        <p class="page-sub">Pick a risk level and spin. Every winning spin multiplies your running multiplier — keep spinning to grow it, but a bust segment wipes it out. Cash out any time to bank it.</p>
        ${Casino.helpBtnHTML("wheelHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="wheel-wrap">
            <div class="wheel-face" id="wheelStage" data-state="idle">
              <div class="wheel-pointer"></div>
              <div class="wheel wheel-disc" id="wheelDisc"></div>
              <div class="wheel-hub" id="wheelCenter">—</div>
            </div>
            <div class="wheel-targets" id="targets"></div>
          </div>
          <div class="divider"></div>
          <div class="history">
            <h4>Recent spins</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>

        <div class="panel">
          <p class="controls-title">Risk level</p>
          <div class="bet-row wheel-risk-row" id="riskRow">
            <button class="btn btn-ghost" data-risk="low">Low</button>
            <button class="btn btn-ghost" data-risk="medium">Medium</button>
            <button class="btn btn-ghost" data-risk="high">High</button>
            <button class="btn btn-ghost" data-risk="risky">Risky</button>
          </div>

          <div style="margin-top:16px;">${Casino.betFieldHTML(20)}</div>

          <div class="stat-grid">
            <div class="stat"><div class="k">Current multiplier</div><div class="v"><span class="multiplier-tag" id="curMult">—</span></div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="cashVal">—</div></div>
            <div class="stat"><div class="k">Bust chance</div><div class="v" id="bustChance">—</div></div>
            <div class="stat"><div class="k">Last spin</div><div class="v" id="lastSpin">—</div></div>
          </div>

          <button class="btn btn-block btn-purple" id="wheelBtn" style="margin-top:16px;font-size:16px;padding:14px;">SPIN</button>
          <button class="btn btn-block btn-blue" id="cashBtn" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cash Out</button>
        </div>
      </div>`;

    const disc = view.querySelector("#wheelDisc");
    const hub = view.querySelector("#wheelCenter");
    const betInput = view.querySelector("#betInput");
    const riskRow = view.querySelector("#riskRow");
    const wheelBtn = view.querySelector("#wheelBtn");
    const cashBtn = view.querySelector("#cashBtn");
    const targetsEl = view.querySelector("#targets");

    Casino.wireBet(view); // input is disabled mid-round, which wireBet respects
    view.querySelector("#wheelHelp").addEventListener("click", () => Casino.openHowTo("How to play — Wheel", `
      <h4>Goal</h4>
      <p>Choose a <b>risk level</b>, place a bet, and spin. The wheel is divided into segments — most multiply your stake, some are <b>bust</b> (×0). Each winning spin multiplies your <b>running multiplier</b>, which compounds the longer you keep going.</p>
      <h4>Risk levels</h4>
      <p><b>Low</b> has many small, safe segments and few busts; <b>Risky</b> has big multipliers but lots of bust segments. The <b>Bust chance</b> stat shows how likely the next spin wipes you out.</p>
      <h4>Cash out</h4>
      <p>Land on a bust and you lose everything you've built. Press <b>Cash Out</b> between spins to bank the current multiplier before you push your luck again.</p>`));

    function paintWheel() {
      const seg = 360 / S;
      const line = Math.min(1.2, seg * 0.12);
      disc.style.background = `conic-gradient(${segments.map((sgm, i) => {
        const a0 = i * seg, a1 = (i + 1) * seg, edge = a1 - line;
        return `${COLORS[sgm.color]} ${a0}deg ${edge}deg, rgba(8,12,20,0.7) ${edge}deg ${a1}deg`;
      }).join(",")})`;
    }

    // Target payout chips: what you'd have if the next spin hits each tier.
    function renderTargets() {
      const r = RISKS[risk];
      const chips = r.tiers.map(([m, c, col]) => {
        const total = active ? mult * m : m;
        const label = active ? total.toFixed(total < 100 ? 2 : 0) + "×" : m + "×";
        return `<span class="wheel-target" style="--c:${COLORS[col]}">${label}</span>`;
      });
      chips.push(`<span class="wheel-target wheel-target-bust">Bust ${Math.round(r.bust / S * 100)}%</span>`);
      targetsEl.innerHTML = chips.join("");
    }

    function updateStats() {
      view.querySelector("#curMult").textContent = active ? mult.toFixed(2) + "×" : "—";
      view.querySelector("#cashVal").textContent = active ? Casino.fmt(Math.floor(bet * mult * HOUSE_EDGE)) : "—";
      view.querySelector("#bustChance").textContent = Math.round(RISKS[risk].bust / S * 100) + "%";
    }

    function setControls() {
      // Bet/risk locked mid-round; buttons reflect spin state.
      wheelBtn.disabled = spinning;
      cashBtn.disabled = spinning || !active;
      betInput.disabled = active || spinning;
      riskRow.querySelectorAll("button").forEach((b) => (b.disabled = active || spinning));
      wheelBtn.textContent = active ? "SPIN AGAIN" : "SPIN";
    }

    function setRisk(r) {
      if (active || spinning) return;
      risk = r;
      riskRow.querySelectorAll("[data-risk]").forEach((b) => {
        const on = b.dataset.risk === r;
        b.classList.toggle("btn-purple", on);
        b.classList.toggle("btn-ghost", !on);
      });
      segments = buildSegments(r);
      paintWheel();
      renderTargets();
      updateStats();
    }

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-14).reverse()
        .map((h) => `<span class="pill ${h > 0 ? "win" : "lose"}">${h > 0 ? h.toFixed(2) + "×" : "bust"}</span>`).join("");
    }

    function spin() {
      if (spinning) return;
      if (!active) {
        // First spin of a round — place the bet.
        bet = Math.floor(Number(betInput.value));
        if (!Casino.bet(bet)) return;
      }
      spinning = true;
      setControls();
      view.querySelector("#wheelStage").dataset.state = "spinning";
      hub.textContent = "…";
      hub.className = "wheel-hub";

      let idx = Casino.randInt(0, S - 1);
      // Rigged odds: land on a winning (non-bust) segment.
      if (Casino.cheat.win()) {
        const winIdx = segments.map((s, i) => (s.bust ? -1 : i)).filter((i) => i >= 0);
        if (winIdx.length) idx = Casino.pick(winIdx);
      }

      const seg = 360 / S;
      const centerAngle = idx * seg + seg / 2;
      const delta = ((-centerAngle - wheelRot) % 360 + 360) % 360;
      wheelRot += delta + 360 * 5;
      disc.style.transition = "transform 4s cubic-bezier(0.15, 0.85, 0.2, 1)";
      disc.style.transform = `rotate(${wheelRot}deg)`;

      const tickInt = setInterval(() => Casino.sound.play("tick"), 170);
      setTimeout(() => { clearInterval(tickInt); settle(idx); }, 4100);
    }

    function settle(idx) {
      const seg = segments[idx];
      spinning = false;
      view.querySelector("#wheelStage").dataset.state = "idle";

      if (seg.bust) {
        // Bust — the whole multiplier (and the bet) is wiped.
        history.push(0);
        hub.textContent = "BUST";
        hub.className = "wheel-hub lose";
        view.querySelector("#lastSpin").textContent = "bust";
        Casino.sound.play("lose");
        Casino.toast(`Busted — lost ${Casino.money(bet)}.`, "lose");
        active = false;
        mult = 0;
        updateHistory();
        setControls();
        updateStats();
        renderTargets();
        return;
      }

      // Winning spin — compound the multiplier.
      mult = active ? mult * seg.mult : seg.mult;
      active = true;
      history.push(seg.mult);
      hub.textContent = mult.toFixed(2) + "×";
      hub.className = "wheel-hub win";
      view.querySelector("#lastSpin").textContent = "×" + seg.mult;
      Casino.sound.play(seg.mult >= 5 ? "bigwin" : "win");
      updateHistory();
      setControls();
      updateStats();
      renderTargets();
    }

    function cashOut() {
      if (!active || spinning || mult <= 0) return;
      const winnings = Math.floor(bet * mult * HOUSE_EDGE);
      Casino.payout(winnings);
      Casino.sound.play(mult >= 5 ? "bigwin" : "cashout");
      Casino.toast(`Cashed out ${mult.toFixed(2)}× — +${Casino.fmt(winnings - bet)} profit!`, "win");
      hub.textContent = mult.toFixed(2) + "×";
      hub.className = "wheel-hub win";
      active = false;
      mult = 0;
      setControls();
      updateStats();
      renderTargets();
    }

    riskRow.querySelectorAll("[data-risk]").forEach((b) => b.addEventListener("click", () => setRisk(b.dataset.risk)));
    wheelBtn.addEventListener("click", spin);
    cashBtn.addEventListener("click", cashOut);

    setRisk("medium");
    updateHistory();
  }

  return { render };
})();
