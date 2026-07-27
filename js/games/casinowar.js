/* ============================================================
   Casino War — highest card wins
   ------------------------------------------------------------
   You and the dealer each get one card (Aces high). Higher wins 1:1.
   On a tie you can Surrender (lose half) or go to War: match your
   bet, burn three, one card each — tie-or-better now wins even money
   on the raise (the original bet pushes). Basic strategy: always War.
   ============================================================ */
const CasinoWarGame = (() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const rv = (c) => RANKS.indexOf(c.rank) + 2;

  let deck = [];
  function buildDeck() {
    const d = [];
    SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })));
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function draw() { if (deck.length < 12) deck = buildDeck(); return deck.pop(); }

  function cardHTML(card, faceDown) {
    if (faceDown || !card) return `<div class="card back"><div class="suit-mid">♠</div></div>`;
    const cls = card.suit.red ? "card red" : "card";
    return `<div class="${cls}"><div class="rank-top">${card.rank}<br>${card.suit.s}</div><div class="suit-mid">${card.suit.s}</div><div class="rank-bot">${card.rank}${card.suit.s}</div></div>`;
  }

  const HOWTO = `
    <h4>Goal</h4>
    <p>Simplest game in the house: you and the dealer each get one card. <b>Higher card wins.</b> Suits don't
    matter; Aces are high.</p>
    <h4>Payout</h4>
    <p>Your card beats the dealer's → you win <b>1:1</b>. Lower → you lose the bet.</p>
    <h4>Tie → War</h4>
    <ul>
      <li><b>Surrender</b> — take back half your bet and end it.</li>
      <li><b>Go to War</b> — match your original bet, three cards are burned, then one more card each. If your
      war card <b>ties or beats</b> the dealer, you win even money on the <i>raise</i> (your original bet
      pushes). If it loses, you lose both bets.</li>
    </ul>
    <p><b>Strategy:</b> always go to War on a tie — surrendering costs you more in the long run.</p>`;

  function render(view) {
    let bet = 0, busy = false, tieCard = null;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">⚔️ Casino War</h2>
        <p class="page-sub">Highest card wins — that's it. Tie? Go to war for the pot.</p>
        ${Casino.helpBtnHTML("warHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="felt war-felt">
            <div class="war-hands">
              <div class="war-seat"><div class="hand-label"><span>You</span></div><div class="cards" id="warP"></div></div>
              <div class="war-vs">VS</div>
              <div class="war-seat"><div class="hand-label"><span>Dealer</span></div><div class="cards" id="warD"></div></div>
            </div>
            <div class="bj-result" id="warResult">Place a bet and deal.</div>
          </div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(25)}
          <button class="btn btn-block btn-green" id="warDeal" style="margin-top:14px;font-size:16px;padding:14px;">Deal</button>
          <div class="hc-actrow" id="warWarRow" style="margin-top:10px;display:none;">
            <button class="btn btn-ghost" id="warSurrender">Surrender (½)</button>
            <button class="btn btn-red" id="warGo">⚔️ Go to War</button>
          </div>
          <div class="stat-grid" style="margin-top:14px;">
            <div class="stat"><div class="k">Last result</div><div class="v" id="warLast">—</div></div>
            <div class="stat"><div class="k">Best win</div><div class="v" id="warBest">0</div></div>
          </div>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const dealBtn = view.querySelector("#warDeal");
    const warRow = view.querySelector("#warWarRow");
    const resultEl = view.querySelector("#warResult");
    let best = 0;
    Casino.wireBet(view);
    view.querySelector("#warHelp").addEventListener("click", () => Casino.openHowTo("How to play — Casino War", HOWTO));

    const showP = (c, fd) => (view.querySelector("#warP").innerHTML = cardHTML(c, fd));
    const showD = (c, fd) => (view.querySelector("#warD").innerHTML = cardHTML(c, fd));
    function done(net, msg, type) {
      resultEl.textContent = msg;
      resultEl.style.color = type === "win" ? "var(--green)" : type === "lose" ? "var(--red)" : "var(--gold-2)";
      view.querySelector("#warLast").textContent = net > 0 ? "+" + Casino.fmt(net) : net < 0 ? "-" + Casino.fmt(-net) : "push";
      if (net > best) { best = net; view.querySelector("#warBest").textContent = Casino.fmt(best); }
      Casino.sound.play(type === "win" ? "win" : type === "lose" ? "lose" : "cashout");
      busy = false; dealBtn.disabled = false; betInput.disabled = false;
    }

    function deal() {
      if (busy) return;
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      busy = true; dealBtn.disabled = true; betInput.disabled = true;
      let p = draw(), d = draw();
      if (Casino.cheat.win() && rv(p) <= rv(d)) { let g = 0; while (g++ < 200 && rv(p) <= rv(d)) { p = draw(); d = draw(); } }
      showP(null, true); showD(null, true);
      setTimeout(() => { showP(p); Casino.sound.play("tick"); }, 250);
      setTimeout(() => {
        showD(d); Casino.sound.play("tick");
        if (rv(p) > rv(d)) { Casino.payout(bet * 2); done(bet, `Your ${p.rank} beats ${d.rank} — +${Casino.fmt(bet)}!`, "win"); }
        else if (rv(p) < rv(d)) done(-bet, `Dealer's ${d.rank} beats your ${p.rank}. You lose.`, "lose");
        else { // tie → war
          tieCard = d;
          resultEl.textContent = `Tie at ${p.rank}! Go to war or surrender.`;
          resultEl.style.color = "var(--gold-2)";
          warRow.style.display = "flex";
          Casino.sound.play("cashout");
        }
      }, 550);
    }

    function surrender() {
      warRow.style.display = "none";
      Casino.payout(Math.floor(bet / 2));
      done(-Math.floor(bet / 2), `Surrendered — got back ${Casino.money(Math.floor(bet / 2))}.`, "info");
    }

    function goToWar() {
      if (!Casino.bet(bet)) { Casino.toast("Not enough to go to war.", "lose"); return; }
      warRow.style.display = "none";
      // burn 3, then one each
      draw(); draw(); draw();
      let p = draw(), d = draw();
      if (Casino.cheat.win() && rv(p) < rv(d)) { let g = 0; while (g++ < 200 && rv(p) < rv(d)) { p = draw(); d = draw(); } }
      showP(null, true); showD(null, true);
      setTimeout(() => { showP(p); Casino.sound.play("tick"); }, 250);
      setTimeout(() => {
        showD(d); Casino.sound.play("tick");
        if (rv(p) >= rv(d)) { Casino.payout(bet * 3); done(bet, `War won! ${p.rank} vs ${d.rank} — +${Casino.fmt(bet)}!`, "win"); } // raise wins, ante pushes
        else done(-bet * 2, `War lost — ${d.rank} tops your ${p.rank}. Lost ${Casino.money(bet * 2)}.`, "lose");
      }, 550);
    }

    dealBtn.addEventListener("click", deal);
    view.querySelector("#warSurrender").addEventListener("click", surrender);
    view.querySelector("#warGo").addEventListener("click", goToWar);
  }

  return { render };
})();
