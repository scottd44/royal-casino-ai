/* ============================================================
   Chicken Road — cross lane by lane, cash out before a car hits
   ------------------------------------------------------------
   Camera-follow presentation: the chicken stays centered while the
   road scrolls under it (you can see a few lanes ahead), like the
   crypto-casino version. Fair per-step (EV 1, 1% edge once → ~99% RTP).
   ============================================================ */
const ChickenGame = (() => {
  const HOUSE_EDGE = 0.99;
  const DIFFS = {
    easy:      { label: "Easy",      steps: 15, surv: 0.91 },
    medium:    { label: "Medium",    steps: 13, surv: 0.83 },
    hard:      { label: "Hard",      steps: 11, surv: 0.72 },
    daredevil: { label: "Daredevil", steps: 9,  surv: 0.55 },
  };
  const CAR_COLORS = ["#e0463f", "#e6a13a", "#4d8cff", "#9d6bff", "#3ecf8e", "#e05a9c", "#22d3ee"];

  let diff = "easy";
  let lanes = [];
  let crossed = 0;
  let bet = 0;
  let active = false;
  let busy = false;

  const multAfter = (L, d) => (L <= 0 ? 1 : HOUSE_EDGE * Math.pow(1 / d.surv, L));

  function render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("bird", "ico-title")} Chicken Road</h2>
        <p class="page-sub">Cross the road one lane at a time — each lane you clear grows your multiplier. Cash out before a car flattens you. Harder roads pay far more but the traffic is deadly.</p>
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="chk-stage" id="chkStage">
            <div class="chk-track" id="chkTrack"></div>
            <div class="chk-fade chk-fade-l"></div>
            <div class="chk-fade chk-fade-r"></div>
          </div>
          <div class="win-banner" id="chkMsg" style="margin-top:16px;">Choose a difficulty and press Start.</div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="field">
            <label>Difficulty</label>
            <select class="input" id="chkDiff">
              ${Object.entries(DIFFS).map(([k, d]) =>
                `<option value="${k}" ${k === "easy" ? "selected" : ""}>${d.label} — ${Math.round(d.surv * 100)}% safe/lane</option>`).join("")}
            </select>
          </div>
          <div class="stat-grid">
            <div class="stat"><div class="k">Lane</div><div class="v" id="laneNum">0</div></div>
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="curMult">1.00×</span></div></div>
            <div class="stat"><div class="k">Next lane</div><div class="v"><span class="multiplier-tag" id="nextMult">—</span></div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="cashVal">—</div></div>
          </div>
          <button class="btn btn-block btn-green" id="chkStart" style="margin-top:16px;font-size:16px;padding:14px;">Start Game</button>
          <button class="btn btn-block btn-purple" id="chkCross" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cross ▶</button>
          <button class="btn btn-block btn-blue" id="chkCash" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cash Out</button>
        </div>
      </div>`;

    const stage = view.querySelector("#chkStage");
    const track = view.querySelector("#chkTrack");
    const betInput = view.querySelector("#betInput");
    const diffSelect = view.querySelector("#chkDiff");
    const startBtn = view.querySelector("#chkStart");
    const crossBtn = view.querySelector("#chkCross");
    const cashBtn = view.querySelector("#chkCash");
    const msg = view.querySelector("#chkMsg");
    let chicken, startCurb;

    Casino.wireBet(view);

    function carHTML(laneIdx) {
      const col = CAR_COLORS[laneIdx % CAR_COLORS.length];
      const delay = (-Math.random() * 3).toFixed(2);
      const dur = (1.7 + Math.random() * 1.7).toFixed(2);
      return `<div class="chk-car" style="--car:${col};animation-delay:${delay}s;animation-duration:${dur}s"></div>`;
    }

    function buildRoad() {
      const d = DIFFS[diff];
      track.innerHTML = "";
      startCurb = Casino.el("div", "chk-curb chk-start", `<span class="chk-home">🏁</span>`);
      track.appendChild(startCurb);
      lanes = [];
      for (let i = 1; i <= d.steps; i++) {
        const lane = Casino.el("div", "chk-lane");
        lane.dataset.lane = i;
        lane.innerHTML =
          `<div class="chk-mult">${multAfter(i, d).toFixed(2)}×</div>` +
          carHTML(i) + carHTML(i + 3);
        lane.addEventListener("click", () => { if (active && !busy && Number(lane.dataset.lane) === crossed + 1) cross(); });
        track.appendChild(lane);
        lanes.push(lane);
      }
      const fin = Casino.el("div", "chk-curb chk-finish", `<span class="chk-home">🏆</span>`);
      track.appendChild(fin);
      chicken = Casino.el("div", "chk-chicken", "🐔");
      track.appendChild(chicken);
      // place instantly at the start (no slide / camera glide)
      requestAnimationFrame(() => {
        track.style.transition = "none";
        chicken.style.transition = "none";
        moveTo(startCurb, false);
        requestAnimationFrame(() => { track.style.transition = ""; chicken.style.transition = ""; });
      });
    }

    // Center `el` in the viewport by sliding the whole track (camera-follow).
    function moveTo(el, hop) {
      if (!el || !chicken) return;
      const cx = el.offsetLeft + el.offsetWidth / 2;
      chicken.style.left = (cx - chicken.offsetWidth / 2) + "px";
      const viewW = stage.clientWidth, trackW = track.scrollWidth;
      const cam = Math.max(Math.min(0, viewW - trackW), viewW / 2 - cx);
      track.style.transform = `translateX(${cam}px)`;
      if (hop) { chicken.classList.remove("hop"); void chicken.offsetWidth; chicken.classList.add("hop"); }
    }

    function markNext() {
      lanes.forEach((l) => l.classList.remove("chk-next"));
      if (active && lanes[crossed]) lanes[crossed].classList.add("chk-next");
    }

    function updateStats() {
      const d = DIFFS[diff];
      const cur = multAfter(crossed, d);
      view.querySelector("#laneNum").textContent = crossed;
      view.querySelector("#curMult").textContent = cur.toFixed(2) + "×";
      view.querySelector("#nextMult").textContent = active ? multAfter(crossed + 1, d).toFixed(2) + "×" : "—";
      view.querySelector("#cashVal").textContent = active && crossed > 0 ? Casino.fmt(Math.floor(bet * cur)) : "—";
      markNext();
    }

    function setControls() {
      startBtn.disabled = active;
      betInput.disabled = active;
      diffSelect.disabled = active;
      crossBtn.disabled = !active || busy;
      cashBtn.disabled = !active || crossed === 0 || busy;
    }

    function start() {
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      diff = diffSelect.value;
      crossed = 0;
      active = true;
      buildRoad();
      updateStats();
      setControls();
      msg.textContent = "Cross the road — tap the next lane or press Cross.";
      msg.style.color = "var(--gold-2)";
    }

    function cross() {
      if (!active || busy) return;
      const d = DIFFS[diff];
      let safe = Math.random() < d.surv;
      if (Casino.cheat.win()) safe = true;
      busy = true;
      setControls();
      const targetLane = lanes[crossed];
      if (safe) {
        crossed++;
        moveTo(targetLane, true);
        targetLane.classList.add("cleared");
        Casino.sound.play("tick");
        setTimeout(() => {
          busy = false;
          updateStats();
          if (crossed >= d.steps) { finishWin(); return; }
          setControls();
          msg.textContent = `Lane ${crossed} cleared — ${multAfter(crossed, d).toFixed(2)}×. Keep going or cash out.`;
          msg.style.color = "var(--gold-2)";
        }, 380);
      } else {
        moveTo(targetLane, true);
        targetLane.classList.add("crash");
        setTimeout(() => {
          chicken.classList.add("splat");
          chicken.textContent = "💥";
          Casino.sound.play("lose");
          endLoss();
        }, 320);
      }
    }

    function endLoss() {
      active = false; busy = false;
      msg.textContent = `Splat! A car got you on lane ${crossed + 1}. Lost ${Casino.money(bet)}.`;
      msg.style.color = "var(--red)";
      lanes.forEach((l, i) => { if (i >= crossed) l.classList.add("dim"); });
      markNext();
      setControls();
      updateStats();
    }

    function payAndEnd(mult, reachedEnd) {
      const winnings = Math.floor(bet * mult);
      Casino.payout(winnings);
      active = false; busy = false;
      chicken.classList.add("cheer");
      Casino.sound.play(mult >= 5 ? "bigwin" : "cashout");
      msg.textContent = reachedEnd
        ? `Made it across! ${mult.toFixed(2)}× — +${Casino.fmt(winnings - bet)}!`
        : `Cashed out ${mult.toFixed(2)}× — +${Casino.fmt(winnings - bet)} profit!`;
      msg.style.color = "var(--green)";
      markNext();
      setControls();
      view.querySelector("#cashVal").textContent = "—";
    }
    function finishWin() { payAndEnd(multAfter(DIFFS[diff].steps, DIFFS[diff]), true); }
    function cashOut() {
      if (!active || busy || crossed === 0) { Casino.toast("Cross at least one lane before cashing out.", "info"); return; }
      payAndEnd(multAfter(crossed, DIFFS[diff]), false);
    }

    diffSelect.addEventListener("change", () => { diff = diffSelect.value; if (!active) { buildRoad(); updateStats(); } });
    startBtn.addEventListener("click", start);
    crossBtn.addEventListener("click", cross);
    cashBtn.addEventListener("click", cashOut);
    window.addEventListener("resize", () => { moveTo(active && crossed > 0 ? lanes[crossed - 1] : startCurb, false); });

    buildRoad();
    updateStats();
  }

  return { render };
})();
