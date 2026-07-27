/* ============================================================
   Hilo — higher/lower card guessing with a compounding multiplier
   ------------------------------------------------------------
   Ace is LOW (A=1 … K=13). Each next card is an independent draw
   from a full 52-card deck (the deck does not deplete). A same-rank
   card wins for whichever side you picked ("higher or same" /
   "lower or same"). Step multiplier = 0.99 / winChance, compounding.
   ============================================================ */
const HiloGame = (() => {
  const HOUSE_EDGE = 0.99;
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];

  let current = null;   // { rank, suit }
  let runMult = 1;      // running multiplier
  let bet = 0;
  let active = false;
  let history = [];     // recent ranks (labels) for the strip

  const rankLabel = (r) => (r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r));
  const drawCard = () => ({ rank: Casino.randInt(1, 13), suit: Casino.pick(SUITS) });

  // Win chances include ties ("or same"), so they overlap by the 1/13 tie mass.
  const chanceHigher = (r) => (14 - r) / 13; // P(next rank >= r)
  const chanceLower = (r) => r / 13;         // P(next rank <= r)
  const multFor = (chance) => HOUSE_EDGE / chance;

  function cardHTML(card) {
    if (!card) return `<div class="card back"><div class="suit-mid">♠</div></div>`;
    const cls = card.suit.red ? "card red" : "card";
    const lbl = rankLabel(card.rank);
    return `<div class="${cls}">
        <div class="rank-top">${lbl}<br>${card.suit.s}</div>
        <div class="suit-mid">${card.suit.s}</div>
        <div class="rank-bot">${lbl}${card.suit.s}</div>
      </div>`;
  }

  function render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🔼 Hilo</h2>
        <p class="page-sub">Will the next card be higher or lower? Ace is low. A tie wins either way. Chain correct calls for a bigger multiplier and cash out any time.</p>
        ${Casino.helpBtnHTML("hiloHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="felt">
            <div class="hilo-card-wrap"><div class="cards" id="hiloCard" style="justify-content:center;"></div></div>
            <div class="bj-result" id="hiloMsg">Set your bet and press Start.</div>
          </div>
          <div class="divider"></div>
          <div class="history">
            <h4>Recent cards</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}

          <div class="field">
            <label>Your call</label>
            <button class="btn btn-block btn-green" id="higherBtn" style="padding:12px;margin-bottom:8px;" disabled>▲ Higher or same</button>
            <button class="btn btn-block btn-blue" id="lowerBtn" style="padding:12px;" disabled>▼ Lower or same</button>
          </div>

          <div class="stat-grid">
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="runMult">1.00×</span></div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="cashVal">—</div></div>
          </div>

          <button class="btn btn-block" id="startBtn" style="margin-top:16px;font-size:16px;padding:14px;">Start Game</button>
          <button class="btn btn-block btn-green" id="cashBtn" style="margin-top:10px;font-size:16px;padding:14px;" disabled>Cash Out</button>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const higherBtn = view.querySelector("#higherBtn");
    const lowerBtn = view.querySelector("#lowerBtn");
    const startBtn = view.querySelector("#startBtn");
    const cashBtn = view.querySelector("#cashBtn");
    const msg = view.querySelector("#hiloMsg");

    Casino.wireBet(view);
    view.querySelector("#hiloHelp").addEventListener("click", () => Casino.openHowTo("How to play — Hilo", `
      <h4>Goal</h4>
      <p>A card is shown face-up. Call whether the <b>next</b> card will be <b>higher</b> or <b>lower</b>. Ace is low, King is high, and a <b>tie wins</b> either way.</p>
      <h4>Building a multiplier</h4>
      <p>Each correct call multiplies your payout by the true odds of that call (minus a small house edge) — the more cards that would beat you, the bigger the jump. Correct calls <b>chain</b>, so your multiplier keeps climbing.</p>
      <h4>Cashing out</h4>
      <p>Bank your current multiplier at any time with <b>Cash Out</b>. But one wrong call loses the whole bet — so don't get greedy.</p>`));

    function drawCurrent() {
      view.querySelector("#hiloCard").innerHTML = cardHTML(current);
    }

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-14).reverse()
        .map((h) => `<span class="pill ${h.win === undefined ? "" : h.win ? "win" : "lose"}">${h.label}</span>`).join("");
    }

    function updateGuessButtons() {
      if (!active || !current) {
        higherBtn.disabled = lowerBtn.disabled = true;
        higherBtn.textContent = "▲ Higher or same";
        lowerBtn.textContent = "▼ Lower or same";
        return;
      }
      const ch = chanceHigher(current.rank), cl = chanceLower(current.rank);
      higherBtn.disabled = lowerBtn.disabled = false;
      higherBtn.innerHTML = `▲ Higher or same · ${(ch * 100).toFixed(1)}% · ${multFor(ch).toFixed(2)}×`;
      lowerBtn.innerHTML = `▼ Lower or same · ${(cl * 100).toFixed(1)}% · ${multFor(cl).toFixed(2)}×`;
    }

    function updateStats() {
      view.querySelector("#runMult").textContent = runMult.toFixed(2) + "×";
      view.querySelector("#cashVal").textContent = active && runMult > 1 ? Casino.fmt(Math.floor(bet * runMult)) : "—";
    }

    function setControls(playing) {
      startBtn.disabled = playing;
      betInput.disabled = playing;
      cashBtn.disabled = !(playing && runMult > 1);
    }

    function start() {
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      current = drawCard();
      runMult = 1;
      active = true;
      history = [{ label: rankLabel(current.rank) }];
      drawCurrent();
      updateHistory();
      updateGuessButtons();
      updateStats();
      setControls(true);
      msg.textContent = "Higher or lower?";
      msg.style.color = "var(--gold-2)";
    }

    function guess(side) {
      if (!active) return;
      const chance = side === "higher" ? chanceHigher(current.rank) : chanceLower(current.rank);
      let next = drawCard();
      // Rigged odds: draw a card on the winning side of the call.
      if (Casino.cheat.win()) {
        const rank = side === "higher"
          ? Casino.randInt(current.rank, 13)
          : Casino.randInt(1, current.rank);
        next = { rank, suit: Casino.pick(SUITS) };
      }
      const won = side === "higher" ? next.rank >= current.rank : next.rank <= current.rank;
      const prevLabel = rankLabel(next.rank);
      current = next;
      drawCurrent();

      if (won) {
        runMult *= multFor(chance);
        history.push({ label: prevLabel, win: true });
        Casino.sound.play("win");
        msg.textContent = `${prevLabel} — correct! Now ${runMult.toFixed(2)}×.`;
        msg.style.color = "var(--green)";
        updateHistory();
        updateGuessButtons();
        updateStats();
        setControls(true);
      } else {
        history.push({ label: prevLabel, win: false });
        active = false;
        Casino.sound.play("lose");
        msg.textContent = `${prevLabel} — wrong. You lose ${Casino.money(bet)}.`;
        msg.style.color = "var(--red)";
        updateHistory();
        updateGuessButtons();
        runMult = 1;
        updateStats();
        setControls(false);
      }
    }

    function cashOut() {
      if (!active || runMult <= 1) return;
      const winnings = Math.floor(bet * runMult);
      Casino.payout(winnings);
      active = false;
      Casino.sound.play(runMult >= 10 ? "bigwin" : "cashout");
      msg.textContent = `Cashed out ${runMult.toFixed(2)}× — +${Casino.fmt(winnings - bet)} profit!`;
      msg.style.color = "var(--green)";
      updateGuessButtons();
      setControls(false);
      view.querySelector("#cashVal").textContent = "—";
    }

    higherBtn.addEventListener("click", () => guess("higher"));
    lowerBtn.addEventListener("click", () => guess("lower"));
    startBtn.addEventListener("click", start);
    cashBtn.addEventListener("click", cashOut);

    drawCurrent();
    updateStats();
  }

  return { render };
})();
