/* ============================================================
   Roulette — European single-zero wheel
   Real-table betting board · multiple staged bets · ball physics
   ============================================================ */
const RouletteGame = (() => {
  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  // Pocket order around a European wheel (used for colours + ball landing).
  const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const SEG = 360 / ORDER.length;
  const CHIPS = [1, 5, 25, 100];

  let history = [];

  function colorOf(n) { return n === 0 ? "green" : RED.has(n) ? "red" : "black"; }

  // Payout odds "to 1" for the live preview.
  function oddsRatio(key) {
    if (key.startsWith("n:")) return 35;                                  // straight up
    if (["red", "black", "even", "odd", "low", "high"].includes(key)) return 1; // even money
    return 2;                                                             // dozens & columns
  }
  const LABELS = {
    red: "Red", black: "Black", even: "Even", odd: "Odd", low: "1-18", high: "19-36",
    d1: "1st 12", d2: "2nd 12", d3: "3rd 12", c1: "Column 1", c2: "Column 2", c3: "Column 3",
  };
  const labelFor = (key) => (key.startsWith("n:") ? `${key.slice(2)} straight` : (LABELS[key] || key));

  /** Total returned (incl. stake) per credit staked on `key` if `n` hits, else 0. */
  function payoutFor(key, n) {
    if (key.startsWith("n:")) return (+key.slice(2) === n) ? 36 : 0;
    switch (key) {
      case "red":  return colorOf(n) === "red" ? 2 : 0;
      case "black": return colorOf(n) === "black" ? 2 : 0;
      case "even": return (n !== 0 && n % 2 === 0) ? 2 : 0;
      case "odd":  return (n % 2 === 1) ? 2 : 0;
      case "low":  return (n >= 1 && n <= 18) ? 2 : 0;
      case "high": return (n >= 19 && n <= 36) ? 2 : 0;
      case "d1":   return (n >= 1 && n <= 12) ? 3 : 0;
      case "d2":   return (n >= 13 && n <= 24) ? 3 : 0;
      case "d3":   return (n >= 25 && n <= 36) ? 3 : 0;
      case "c1":   return (n !== 0 && n % 3 === 0) ? 3 : 0;
      case "c2":   return (n !== 0 && n % 3 === 2) ? 3 : 0;
      case "c3":   return (n !== 0 && n % 3 === 1) ? 3 : 0;
    }
    return 0;
  }

  function render(view) {
    // --- betting state ---
    let bets = {};          // key -> staked credits
    let undoStack = [];     // [{ key, amt }] for undo
    let lastBets = null;    // snapshot for "rebet"
    let selectedChip = 5;
    let spinning = false;
    let wheelRot = 0;

    // number cells laid out like a real table (3 rows × 12 cols)
    const top = [], mid = [], bot = [];
    for (let n = 1; n <= 36; n++) (n % 3 === 0 ? top : n % 3 === 2 ? mid : bot).push(n);
    const numCells = [...top, ...mid, ...bot]
      .map((n) => `<div class="rt-num ${colorOf(n)}" data-bet="n:${n}">${n}</div>`).join("");

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🎡 European Roulette</h2>
        <p class="page-sub">Place as many chips as you like, then spin. Straight up pays 35:1.</p>
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="wheel-wrap">
            <div class="wheel-pointer"></div>
            <div class="wheel" id="wheel">
              <div class="wheel-center">RC</div>
              <div class="rt-ball-arm" id="ballArm"><div class="rt-ball"></div></div>
            </div>
            <div id="resultBox"></div>
          </div>
          <div class="divider"></div>
          <div class="history">
            <h4>Recent numbers</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>

        <div class="panel">
          <p class="controls-title">Chip size</p>
          <div class="rt-chip-row" id="chipRow">
            ${CHIPS.map((c) => `<button class="rt-chip-btn ${c === 5 ? "sel" : ""}" data-chip="${c}">${c}</button>`).join("")}
          </div>

          <p class="controls-title" style="margin-top:16px;">Table — click to place chips</p>
          <div class="rt-board-scroll">
            <div class="rt-board" id="board">
              <div class="rt-zero green" data-bet="n:0">0</div>
              <div class="rt-numbers">${numCells}</div>
              <div class="rt-cols">
                <div class="rt-col" data-bet="c1">2:1</div>
                <div class="rt-col" data-bet="c2">2:1</div>
                <div class="rt-col" data-bet="c3">2:1</div>
              </div>
              <div class="rt-dozens">
                <div class="rt-doz" data-bet="d1">1st 12</div>
                <div class="rt-doz" data-bet="d2">2nd 12</div>
                <div class="rt-doz" data-bet="d3">3rd 12</div>
              </div>
              <div class="rt-outside">
                <div class="rt-out" data-bet="low">1-18</div>
                <div class="rt-out" data-bet="even">EVEN</div>
                <div class="rt-out red" data-bet="red">RED</div>
                <div class="rt-out black" data-bet="black">BLACK</div>
                <div class="rt-out" data-bet="odd">ODD</div>
                <div class="rt-out" data-bet="high">19-36</div>
              </div>
            </div>
          </div>

          <div class="rt-controls">
            <button class="btn btn-ghost btn-sm" id="undoBtn">↶ Undo</button>
            <button class="btn btn-ghost btn-sm" id="clearBtn">Clear</button>
            <button class="btn btn-ghost btn-sm" id="rebetBtn">Rebet</button>
            <div class="rt-total">Staked: <b id="totalStaked">0</b></div>
          </div>
          <div class="rt-preview" id="rtPreview"></div>
          <button class="btn btn-block" id="spinBtn" style="margin-top:12px;font-size:16px;padding:14px;">SPIN</button>
        </div>
      </div>`;

    const board = view.querySelector("#board");
    const wheel = view.querySelector("#wheel");
    const ballArm = view.querySelector("#ballArm");
    const spinBtn = view.querySelector("#spinBtn");
    const totalEl = view.querySelector("#totalStaked");

    // paint wheel pockets
    wheel.style.background = `conic-gradient(${ORDER.map((n, i) => {
      const c = colorOf(n) === "red" ? "#ef4d6a" : colorOf(n) === "green" ? "#3ecf8e" : "#10151f";
      return `${c} ${i * SEG}deg ${(i + 1) * SEG}deg`;
    }).join(",")})`;

    // Number labels around the rim (rotate with the wheel; the winning pocket
    // settles at the top pointer reading upright).
    wheel.insertAdjacentHTML("beforeend", ORDER.map((n, i) => {
      const angle = i * SEG + SEG / 2;
      return `<div class="rt-pocket-num" style="transform:translate(-50%,-50%) rotate(${angle}deg) translateY(-97px);">${n}</div>`;
    }).join(""));

    const total = () => Object.values(bets).reduce((a, b) => a + b, 0);

    function refresh() {
      board.querySelectorAll("[data-bet]").forEach((el) => {
        const key = el.dataset.bet;
        let chip = el.querySelector(".rt-chip");
        if (bets[key] > 0) {
          if (!chip) { chip = document.createElement("div"); chip.className = "rt-chip"; el.appendChild(chip); }
          chip.textContent = bets[key];
        } else if (chip) { chip.remove(); }
      });
      totalEl.textContent = Casino.fmt(total());
      renderPreview();
    }

    // Live payout preview — updates as chips are placed, before the spin.
    function renderPreview() {
      const prev = view.querySelector("#rtPreview");
      const entries = Object.entries(bets);
      if (!entries.length) { prev.innerHTML = `<div class="rt-prev-empty">Place chips to preview payouts.</div>`; return; }
      prev.innerHTML = `<div class="rt-prev-head">If it hits, this pays</div>` + entries.map(([key, amt]) => {
        const r = oddsRatio(key);
        return `<div class="rt-prev-row">
            <span>${labelFor(key)} <em>${r}:1</em></span>
            <span class="rt-prev-pay">+${Casino.fmt(amt * r)} <small>→ ${Casino.fmt(amt * (r + 1))}</small></span>
          </div>`;
      }).join("");
    }

    function placeBet(key, amt) {
      amt = Math.floor(amt);
      if (spinning || !key || amt <= 0) return;
      bets[key] = (bets[key] || 0) + amt;
      undoStack.push({ key, amt });
      refresh();
    }

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-12).reverse()
        .map((n) => `<span class="pill" style="color:#fff;border:0;background:${
          colorOf(n) === "red" ? "var(--red)" : colorOf(n) === "green" ? "var(--green)" : "#10151f"};">${n}</span>`).join("");
    }

    function settle(n) {
      let returned = 0;
      for (const [key, amt] of Object.entries(bets)) returned += amt * payoutFor(key, n);
      view.querySelector("#resultBox").innerHTML = `<div class="result-num ${colorOf(n)}">${n}</div>`;
      const staked = total();
      if (returned > 0) {
        Casino.payout(returned);
        Casino.sound.play(returned - staked >= staked * 10 ? "bigwin" : "win");
        Casino.toast(`${n} ${colorOf(n)} — you won +${Casino.fmt(returned - staked)}!`, "win");
      } else {
        Casino.sound.play("lose");
        Casino.toast(`${n} ${colorOf(n)} — no winning bets.`, "lose");
      }
      history.push(n);
      updateHistory();
      lastBets = { ...bets };
      bets = {}; undoStack = [];
      refresh();
    }

    function spin() {
      if (spinning) return;
      const staked = total();
      if (staked <= 0) { Casino.toast("Place at least one bet first.", "info"); return; }
      if (!Casino.bet(staked)) return; // deducts total, or warns if short

      spinning = true;
      spinBtn.disabled = true;
      // Wheel-ticking sound while the ball rattles around (cleared on settle).
      const tickInt = setInterval(() => Casino.sound.play("tick"), 180);
      let result = Casino.randInt(0, 36);
      // Rigged odds: land on a number that wins at least one placed bet.
      if (Casino.cheat.win()) {
        const winners = [];
        for (let n = 0; n <= 36; n++) {
          if (Object.keys(bets).some((key) => payoutFor(key, n) > 0)) winners.push(n);
        }
        if (winners.length) result = Casino.pick(winners);
      }

      // Rotate the wheel so the winning pocket ends under the top pointer,
      // and spin the ball the other way, settling into that pocket.
      const idx = ORDER.indexOf(result);
      const pocketAngle = idx * SEG + SEG / 2;
      const delta = ((-pocketAngle - wheelRot) % 360 + 360) % 360;
      wheelRot += delta + 360 * 5; // spin ≥5 turns, ending with the pocket at the top

      // Ball arm is a child of the wheel, so it inherits wheelRot. Counter-rotate
      // it (plus extra turns) so the ball's absolute angle settles at the top pocket.
      wheel.style.transition = "transform 4s cubic-bezier(0.15, 0.85, 0.2, 1)";
      wheel.style.transform = `rotate(${wheelRot}deg)`;
      ballArm.classList.add("rolling");
      ballArm.style.transition = "transform 4s cubic-bezier(0.1, 0.72, 0.16, 1)";
      ballArm.style.transform = `rotate(${-wheelRot - 360 * 6}deg)`;

      setTimeout(() => {
        clearInterval(tickInt);
        ballArm.classList.remove("rolling");
        settle(result);
        spinning = false;
        spinBtn.disabled = false;
      }, 4100);
    }

    // --- events ---
    view.querySelectorAll(".rt-chip-btn").forEach((b) => {
      b.addEventListener("click", () => {
        selectedChip = Number(b.dataset.chip);
        view.querySelectorAll(".rt-chip-btn").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
      });
    });

    board.addEventListener("click", (e) => {
      const spot = e.target.closest("[data-bet]");
      if (spot) placeBet(spot.dataset.bet, selectedChip);
    });

    view.querySelector("#undoBtn").addEventListener("click", () => {
      if (spinning) return;
      const last = undoStack.pop();
      if (!last) return;
      bets[last.key] -= last.amt;
      if (bets[last.key] <= 0) delete bets[last.key];
      refresh();
    });
    view.querySelector("#clearBtn").addEventListener("click", () => {
      if (spinning) return;
      bets = {}; undoStack = []; refresh();
    });
    view.querySelector("#rebetBtn").addEventListener("click", () => {
      if (spinning || !lastBets) return;
      bets = { ...lastBets };
      undoStack = Object.entries(bets).map(([key, amt]) => ({ key, amt }));
      refresh();
    });
    spinBtn.addEventListener("click", spin);

    updateHistory();
    refresh();

    // Minimal programmatic API so the AI adapter can drive the new felt.
    window.RouletteAPI = {
      placeBet,
      clearBets: () => { if (!spinning) { bets = {}; undoStack = []; refresh(); } },
      spin,
      isSpinning: () => spinning,
      total,
    };
  }

  return { render };
})();
