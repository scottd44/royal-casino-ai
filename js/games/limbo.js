/* ============================================================
   Limbo — pick a target multiplier; beat the random result
   ============================================================ */
const LimboGame = (() => {
  const HOUSE_EDGE = 0.99; // 1% edge, matching Dice/Crash/Mines/Plinko

  let history = [];
  let rolling = false;

  // Instant result multiplier with a built-in house edge.
  // P(result >= x) = HOUSE_EDGE / x, so every target shares the same ~1% edge.
  function drawResult() {
    const u = Math.random();
    if (u <= 0) return 1000000; // vanishingly rare — treat as a huge hit
    return HOUSE_EDGE / u;
  }

  const winChanceFor = (target) => (HOUSE_EDGE / target) * 100; // percent

  function render(view) {
    let target = 2.0;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("trending-up", "ico-title")} Limbo</h2>
        <p class="page-sub">Set a target multiplier and fire. If the random result lands at or above your target, you win. Higher targets pay more but hit less.</p>
        ${Casino.helpBtnHTML("limboHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="dice-display">
            <div class="dice-roll-num" id="limboNum">—</div>
            <div class="hint" id="limboMsg">Pick a target and press Play.</div>
          </div>
          <div class="divider"></div>
          <div class="history">
            <h4>Recent results</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}

          <div class="field">
            <label>Target multiplier</label>
            <input class="input" id="targetInput" type="number" min="1.01" step="0.01" value="2.00" />
            <div class="bet-row">
              <button class="btn btn-ghost" data-target="1.5">1.5×</button>
              <button class="btn btn-ghost" data-target="2">2×</button>
              <button class="btn btn-ghost" data-target="10">10×</button>
              <button class="btn btn-ghost" data-target="100">100×</button>
            </div>
          </div>

          <div class="stat-grid">
            <div class="stat"><div class="k">Win chance</div><div class="v" id="winChance">49.50%</div></div>
            <div class="stat"><div class="k">Payout</div><div class="v"><span class="multiplier-tag" id="mult">2.00×</span></div></div>
            <div class="stat"><div class="k">Profit on win</div><div class="v" id="profit">—</div></div>
          </div>

          <button class="btn btn-block" id="limboBtn" style="margin-top:16px;font-size:16px;padding:14px;">PLAY LIMBO</button>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const targetInput = view.querySelector("#targetInput");
    const limboBtn = view.querySelector("#limboBtn");

    Casino.wireBet(view, updateStats);
    view.querySelector("#limboHelp").addEventListener("click", () => Casino.openHowTo("How to play — Limbo", `
      <h4>Goal</h4>
      <p>Every round generates a random <b>result multiplier</b>. Before firing, you pick a <b>target</b>. If the result lands <b>at or above</b> your target, you win that multiplier; if it falls short, you lose the bet.</p>
      <h4>Risk vs. reward</h4>
      <p>A low target (like 1.5×) hits often but pays little. A high target (like 100×) pays huge but rarely lands. The <b>Win chance</b> and <b>Payout</b> stats update live as you change the target, so you can see the trade-off before you commit.</p>
      <h4>Fairness</h4>
      <p>The result is drawn from a fair distribution with a small house edge baked into the payout, exactly like a provably-fair crash game.</p>`));

    view.querySelectorAll("[data-target]").forEach((b) => {
      b.addEventListener("click", () => {
        targetInput.value = Number(b.dataset.target).toFixed(2);
        updateStats();
      });
    });

    function readTarget() {
      let t = Number(targetInput.value);
      if (!Number.isFinite(t) || t < 1.01) t = 1.01;
      return t;
    }

    function updateStats() {
      target = readTarget();
      const chance = winChanceFor(target);
      view.querySelector("#winChance").textContent = chance.toFixed(2) + "%";
      view.querySelector("#mult").textContent = target.toFixed(2) + "×";
      const betAmount = Math.floor(Number(betInput.value)) || 0;
      const profit = Math.floor(betAmount * target) - betAmount;
      view.querySelector("#profit").textContent = betAmount > 0 ? "+" + Casino.fmt(profit) : "—";
    }

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-10).reverse()
        .map((r) => `<span class="pill ${r.win ? "win" : "lose"}">${r.result.toFixed(2)}×</span>`).join("");
    }

    function play() {
      if (rolling) return;
      const betAmount = Math.floor(Number(betInput.value));
      if (!Casino.bet(betAmount)) return;
      target = readTarget();
      targetInput.value = target.toFixed(2);
      rolling = true;
      limboBtn.disabled = true;

      let result = drawResult();
      // Rigged odds: force a result at or above the target.
      if (Casino.cheat.win()) result = target * (1 + Math.random());
      const won = result >= target;
      const numEl = view.querySelector("#limboNum");
      const msgEl = view.querySelector("#limboMsg");

      // Quick count-up toward the result for flavor, with soft ticks.
      let ticks = 0;
      const steps = 10;
      const anim = setInterval(() => {
        ticks++;
        // ease the shown value up toward the final result
        const shown = (result * (ticks / steps));
        numEl.textContent = shown.toFixed(2) + "×";
        Casino.sound.play("tick");
        if (ticks >= steps) {
          clearInterval(anim);
          numEl.textContent = result.toFixed(2) + "×";
          numEl.className = "dice-roll-num " + (won ? "win" : "lose");
          if (won) {
            const payout = Math.floor(betAmount * target);
            Casino.payout(payout);
            const profit = payout - betAmount;
            msgEl.textContent = `${result.toFixed(2)}× ≥ ${target.toFixed(2)}× — won +${Casino.fmt(profit)}!`;
            Casino.sound.play(target >= 10 ? "bigwin" : "win");
            Casino.toast(`${result.toFixed(2)}× — won +${Casino.fmt(profit)}!`, "win");
          } else {
            msgEl.textContent = `${result.toFixed(2)}× fell short of ${target.toFixed(2)}×. You lose.`;
            Casino.sound.play("lose");
            Casino.toast(`Crashed at ${result.toFixed(2)}× — no win.`, "lose");
          }
          history.push({ result, win: won });
          updateHistory();
          rolling = false;
          limboBtn.disabled = false;
        }
      }, 45);
    }

    betInput.addEventListener("input", updateStats);
    targetInput.addEventListener("input", updateStats);
    limboBtn.addEventListener("click", play);

    updateStats();
    updateHistory();
  }

  return { render };
})();
