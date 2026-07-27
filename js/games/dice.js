/* ============================================================
   Dice — roll 0.00–99.99, adjustable target & multiplier
   ============================================================ */
const DiceGame = (() => {
  const HOUSE_EDGE = 0.99; // 1% edge on the fair multiplier
  let history = [];
  let rolling = false;

  function render(view) {
    let target = 50;      // win chance boundary
    let mode = "under";   // "under" or "over"

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🎲 Dice</h2>
        <p class="page-sub">Pick a target and predict whether the roll lands under or over it. Higher risk, higher payout.</p>
        ${Casino.helpBtnHTML("diceHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="dice-display">
            <div class="dice-roll-num" id="rollNum">—</div>
            <div class="hint" id="rollMsg">Set your target and roll.</div>
          </div>
          <div class="slider-track" id="sliderTrack">
            <div class="dice-marker" id="diceMarker">0.00</div>
            <input type="range" min="2" max="98" value="50" step="1" class="dice-slider" id="slider" />
          </div>
          <div class="slider-labels"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
          <div class="divider"></div>
          <div class="history">
            <h4>Recent rolls</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}

          <div class="field">
            <label>Prediction</label>
            <div class="bet-row">
              <button class="btn btn-ghost" id="underBtn">Roll Under</button>
              <button class="btn btn-ghost" id="overBtn">Roll Over</button>
            </div>
          </div>

          <div class="stat-grid">
            <div class="stat"><div class="k">Win chance</div><div class="v" id="winChance">50%</div></div>
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="mult">1.98×</span></div></div>
            <div class="stat"><div class="k">Target</div><div class="v" id="targetV">50.00</div></div>
            <div class="stat"><div class="k">Profit on win</div><div class="v" id="profit">—</div></div>
          </div>

          <button class="btn btn-block" id="rollBtn" style="margin-top:16px;font-size:16px;padding:14px;">ROLL DICE</button>
        </div>
      </div>`;

    const slider = view.querySelector("#slider");
    const track = view.querySelector("#sliderTrack");
    const betInput = view.querySelector("#betInput");
    const rollBtn = view.querySelector("#rollBtn");
    const underBtn = view.querySelector("#underBtn");
    const overBtn = view.querySelector("#overBtn");

    Casino.wireBet(view, updateStats);
    view.querySelector("#diceHelp").addEventListener("click", () => Casino.openHowTo("How to play — Dice", `
      <h4>Goal</h4>
      <p>A number from <b>0.00 to 100.00</b> is rolled at random. Drag the slider to set your <b>target</b>, then bet whether the roll comes in <b>under</b> or <b>over</b> it.</p>
      <h4>Setting the odds</h4>
      <p>The slider <i>is</i> your risk dial. Betting "under 90" wins ~90% of the time but pays barely over 1×; betting "under 5" almost never wins but pays around 20×. The <b>Win chance</b> and <b>Multiplier</b> stats move with the slider so you always see the deal.</p>
      <h4>Fairness</h4>
      <p>Every roll is uniform and independent, with the payouts set to the true odds minus a small house edge.</p>`));

    function winChance() {
      return mode === "under" ? target : 100 - target;
    }

    function multiplier() {
      return (100 / winChance()) * HOUSE_EDGE;
    }

    function updateStats() {
      target = Number(slider.value);
      const chance = winChance();
      const mult = multiplier();
      view.querySelector("#winChance").textContent = chance.toFixed(0) + "%";
      view.querySelector("#mult").textContent = mult.toFixed(2) + "×";
      view.querySelector("#targetV").textContent = target.toFixed(2);
      const betAmount = Math.floor(Number(betInput.value)) || 0;
      const profit = betAmount * mult - betAmount;
      view.querySelector("#profit").textContent = betAmount > 0 ? "+" + Casino.fmt(profit) : "—";
      // gradient split shows losing (red) vs winning (green) zone
      const splitPct = mode === "under" ? target : target;
      track.style.setProperty("--split", splitPct + "%");
      // flip the gradient direction depending on prediction
      track.style.background = mode === "under"
        ? `linear-gradient(90deg, var(--green) 0 ${target}%, var(--red) ${target}% 100%)`
        : `linear-gradient(90deg, var(--red) 0 ${target}%, var(--green) ${target}% 100%)`;
    }

    function setMode(m) {
      mode = m;
      underBtn.classList.toggle("btn-green", m === "under");
      underBtn.classList.toggle("btn-ghost", m !== "under");
      overBtn.classList.toggle("btn-green", m === "over");
      overBtn.classList.toggle("btn-ghost", m !== "over");
      updateStats();
    }

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-10).reverse()
        .map((r) => `<span class="pill ${r.win ? "win" : "lose"}">${r.roll.toFixed(2)}</span>`).join("");
    }

    function roll() {
      if (rolling) return;
      const betAmount = Math.floor(Number(betInput.value));
      if (!Casino.bet(betAmount)) return;
      rolling = true;
      rollBtn.disabled = true;

      let result = Math.floor(Math.random() * 10000) / 100; // 0.00–99.99
      // Rigged odds: force a roll on the winning side of the target.
      if (Casino.cheat.win()) {
        result = mode === "under"
          ? Math.floor(Math.random() * target * 100) / 100          // [0, target)
          : target + 0.01 + Math.floor(Math.random() * (100 - target) * 100) / 100; // (target, 100)
      }
      const won = mode === "under" ? result < target : result > target;
      const numEl = view.querySelector("#rollNum");
      const msgEl = view.querySelector("#rollMsg");

      // brief animated count-up for flavor
      let ticks = 0;
      const anim = setInterval(() => {
        numEl.textContent = (Math.random() * 100).toFixed(2);
        Casino.sound.play("tick");
        if (++ticks > 8) {
          clearInterval(anim);
          numEl.textContent = result.toFixed(2);
          numEl.className = "dice-roll-num " + (won ? "win" : "lose");
          // slide the little arrow-marker to exactly where the dice landed
          const marker = view.querySelector("#diceMarker");
          marker.textContent = result.toFixed(2);
          marker.style.left = result + "%";
          marker.className = "dice-marker show " + (won ? "win" : "lose");
          if (won) {
            const payout = Math.floor(betAmount * multiplier());
            Casino.payout(payout);
            Casino.sound.play(multiplier() >= 10 ? "bigwin" : "win");
            msgEl.textContent = `${result.toFixed(2)} is ${mode} ${target} — won +${Casino.fmt(payout - betAmount)}!`;
            Casino.toast(`Rolled ${result.toFixed(2)} — won +${Casino.fmt(payout - betAmount)}!`, "win");
          } else {
            Casino.sound.play("lose");
            msgEl.textContent = `${result.toFixed(2)} is not ${mode} ${target}. You lose.`;
            Casino.toast(`Rolled ${result.toFixed(2)} — no win.`, "lose");
          }
          history.push({ roll: result, win: won });
          updateHistory();
          rolling = false;
          rollBtn.disabled = false;
        }
      }, 55);
    }

    slider.addEventListener("input", updateStats);
    betInput.addEventListener("input", updateStats);
    underBtn.addEventListener("click", () => setMode("under"));
    overBtn.addEventListener("click", () => setMode("over"));
    rollBtn.addEventListener("click", roll);

    setMode("under");
    updateHistory();
  }

  return { render };
})();
