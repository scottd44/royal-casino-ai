/* ============================================================
   Slots — 3 reels, weighted symbols
   ============================================================ */
const SlotsGame = (() => {
  // Symbols ordered rare -> common; weight controls appearance frequency.
  // Paytable tuned so the overall return-to-player is ~99% (≈1% house edge),
  // matching Dice/Mines/Crash/Plinko. Ordering is monotonic: rarer pays more.
  /* `s` stays the identity key (evaluate() compares on it and uses it as a
     counts[] key) — only the RENDERING changed. Each symbol draws as a CSS
     shape via .sym-<s>, so nothing here depends on a font or an emoji table. */
  const SYMBOLS = [
    { s: "seven",   name: "Seven",   weight: 1, three: 60, two: 6 },
    { s: "diamond", name: "Diamond", weight: 2, three: 38, two: 5 },
    { s: "bell",    name: "Bell",    weight: 3, three: 18, two: 4 },
    { s: "clover",  name: "Clover",  weight: 4, three: 10, two: 3 },
    { s: "star",    name: "Star",    weight: 5, three: 7,  two: 2 },
    { s: "crown",   name: "Crown",   weight: 6, three: 5,  two: 1 },
    { s: "cherry",  name: "Cherry",  weight: 8, three: 4,  two: 1 },
  ];
  const symHTML = (sym) => `<span class="sym sym-${sym.s}" title="${sym.name}"></span>`;

  const weighted = [];
  SYMBOLS.forEach((sym) => { for (let i = 0; i < sym.weight; i++) weighted.push(sym); });

  let history = [];
  let spinning = false;

  function spinReel() { return Casino.pick(weighted); }

  function evaluate(a, b, c, betAmount) {
    // Three of a kind
    if (a.s === b.s && b.s === c.s) {
      return { mult: a.three, label: `Triple ${a.name}!`, win: betAmount * a.three };
    }
    // Two of a kind (any pair among the three) — use the best paying pair symbol
    const counts = {};
    [a, b, c].forEach((x) => { counts[x.s] = (counts[x.s] || 0) + 1; });
    const pairSym = [a, b, c].find((x) => counts[x.s] === 2);
    if (pairSym) {
      return { mult: pairSym.two, label: `Pair of ${pairSym.name}`, win: betAmount * pairSym.two };
    }
    return { mult: 0, label: "", win: 0 };
  }

  function render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("cherry", "ico-title")} Lucky Sevens Slots</h2>
        <p class="page-sub">Match symbols across the payline. Three-of-a-kind pays big.</p>
        ${Casino.helpBtnHTML("slotsHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="slot-machine">
            <div class="reels" id="reels">
              ${[0,1,2].map(() => `
                <div class="reel" data-reel>
                  <div class="reel-strip"><span>${symHTML(SYMBOLS[6])}</span></div>
                </div>`).join("")}
            </div>
            <div class="win-banner" id="winBanner"></div>
            <div class="payline-note">One payline · bet applies to that line</div>
          </div>
          <div class="divider"></div>
          <div class="paytable">
            <table>
              <tr><td>Any three matching</td><td>up to 60×</td></tr>
              <tr><td>${symHTML(SYMBOLS[0]).repeat(3)}</td><td>60×</td></tr>
              <tr><td>${symHTML(SYMBOLS[1]).repeat(3)}</td><td>38×</td></tr>
              <tr><td>${symHTML(SYMBOLS[2]).repeat(3)}</td><td>18×</td></tr>
              <tr><td>Any matching pair</td><td>1× – 6×</td></tr>
            </table>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <button class="btn btn-block" id="spinBtn" style="font-size:17px;padding:15px;">SPIN</button>
          <div class="stat-grid" style="margin-top:16px;">
            <div class="stat"><div class="k">Last win</div><div class="v" id="lastWin">—</div></div>
            <div class="stat"><div class="k">Best win</div><div class="v" id="bestWin">0</div></div>
          </div>
          <div class="history">
            <h4>Recent spins</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>
      </div>`;

    const reels = [...view.querySelectorAll("[data-reel]")];
    const betInput = view.querySelector("#betInput");
    const spinBtn = view.querySelector("#spinBtn");
    const winBanner = view.querySelector("#winBanner");
    let bestWin = 0;

    Casino.wireBet(view);
    view.querySelector("#slotsHelp").addEventListener("click", () => Casino.openHowTo("How to play — Lucky Sevens Slots", `
      <h4>Goal</h4>
      <p>Set a bet and <b>Spin</b>. The three reels stop on a single <b>payline</b> across the middle. Match symbols on that line to win.</p>
      <h4>Payouts</h4>
      <p><b>Three of a kind</b> pays the most — triple <b>Seven</b> is the top jackpot at 60×. Any <b>matching pair</b> pays a smaller amount. The full paytable is shown right on the machine.</p>
      <h4>Odds</h4>
      <p>Every spin is independent and random. The reel weightings and paytable together give a fixed long-run return, so there's no "due" machine — just spin and enjoy the variance.</p>`));

    function setReel(reelEl, sym) {
      reelEl.querySelector(".reel-strip").innerHTML = `<span>${symHTML(sym)}</span>`;
    }

    // Fill a reel with a tall column of random symbols so the spin animation
    // has something to scroll (the strip translates up one symbol per loop).
    function fillSpinStrip(reelEl) {
      let html = "";
      for (let i = 0; i < 12; i++) html += `<span>${symHTML(spinReel())}</span>`;
      reelEl.querySelector(".reel-strip").innerHTML = html;
    }

    function updateHistory() {
      const h = view.querySelector("#history");
      h.innerHTML = history.slice(-8).reverse()
        .map((r) => `<span class="pill ${r.win > 0 ? "win" : "lose"}">${r.win > 0 ? "+" + Casino.fmt(r.win) : "—"}</span>`)
        .join("");
    }

    function doSpin() {
      if (spinning) return;
      const betAmount = Math.floor(Number(betInput.value));
      if (!Casino.bet(betAmount)) return;

      spinning = true;
      spinBtn.disabled = true;
      winBanner.textContent = "";
      reels.forEach((r) => { fillSpinStrip(r); r.classList.add("spinning"); });

      let finals = [spinReel(), spinReel(), spinReel()];
      // Rigged odds: force a paying combo in the player's favor.
      if (Casino.cheat.win()) {
        const sym = spinReel();
        if (Math.random() < 0.5) finals = [sym, sym, sym]; // three of a kind
        else {
          finals = [sym, sym, spinReel()];
          for (let i = finals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [finals[i], finals[j]] = [finals[j], finals[i]]; }
        }
      }

      // Stagger the reel stops for effect.
      reels.forEach((r, i) => {
        setTimeout(() => {
          r.classList.remove("spinning");
          setReel(r, finals[i]);
          Casino.sound.play("tick");
          if (i === reels.length - 1) finish(finals, betAmount);
        }, 600 + i * 420);
      });
    }

    function finish(finals, betAmount) {
      const result = evaluate(finals[0], finals[1], finals[2], betAmount);
      if (result.win > 0) {
        Casino.payout(result.win);
        Casino.sound.play(result.mult >= 18 ? "bigwin" : "win");
        winBanner.textContent = `${result.label}  +${Casino.fmt(result.win)}`;
        Casino.toast(`${result.label} — won ${Casino.money(result.win)}!`, "win");
        view.querySelector("#lastWin").textContent = "+" + Casino.fmt(result.win);
        if (result.win > bestWin) { bestWin = result.win; view.querySelector("#bestWin").textContent = Casino.fmt(bestWin); }
      } else {
        Casino.sound.play("lose");
        winBanner.textContent = "No win — spin again!";
        view.querySelector("#lastWin").textContent = "0";
      }
      history.push({ win: result.win });
      updateHistory();
      spinning = false;
      spinBtn.disabled = false;
    }

    spinBtn.addEventListener("click", doSpin);
    updateHistory();
  }

  return { render };
})();
