/* ============================================================
   Baccarat (Punto Banco) — bet Player / Banker / Tie
   ------------------------------------------------------------
   Standard 8-deck rules with the real third-card table. Payouts:
   Player 1:1, Banker 1:1 minus 5% commission, Tie 8:1. Player/Banker
   push on a tie. RTP ≈ 98.8% (Player) / 98.9% (Banker); Tie is the
   sucker bet (~85.6%). Verified against the drawing rules.
   ============================================================ */
const BaccaratGame = (() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  let shoe = [];
  let history = [];   // "P" | "B" | "T"
  let dealing = false;

  function buildShoe() {
    const d = [];
    for (let n = 0; n < 8; n++) SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })));
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function draw() { if (shoe.length < 6) shoe = buildShoe(); return shoe.pop(); }
  function cardVal(c) { return c.rank === "A" ? 1 : ["10", "J", "Q", "K"].includes(c.rank) ? 0 : Number(c.rank); }
  function total(cards) { return cards.reduce((a, c) => a + cardVal(c), 0) % 10; }

  function bankerDraws(bt, p3v) {
    if (p3v === null) return bt <= 5;      // player stood
    if (bt <= 2) return true;
    if (bt === 3) return p3v !== 8;
    if (bt === 4) return p3v >= 2 && p3v <= 7;
    if (bt === 5) return p3v >= 4 && p3v <= 7;
    if (bt === 6) return p3v >= 6 && p3v <= 7;
    return false;                           // 7 stands
  }

  // Deal a full coup. Returns { P, B, result } (result: "P"|"B"|"T").
  function deal() {
    const P = [draw(), draw()], B = [draw(), draw()];
    let pt = total(P), bt = total(B);
    if (pt < 8 && bt < 8) {                 // no natural
      let p3v = null;
      if (pt <= 5) { const c = draw(); P.push(c); p3v = cardVal(c); }
      if (bankerDraws(bt, p3v)) B.push(draw());
    }
    pt = total(P); bt = total(B);
    return { P, B, pt, bt, result: pt > bt ? "P" : bt > pt ? "B" : "T" };
  }

  // Total returned (incl. stake) for a $bet on `side` given `result`.
  function payoutFor(side, result, bet) {
    if (side === "player") return result === "P" ? bet * 2 : result === "T" ? bet : 0;
    if (side === "banker") return result === "B" ? Math.floor(bet * 1.95) : result === "T" ? bet : 0;
    return result === "T" ? bet * 9 : 0;    // tie 8:1
  }
  const wins = (side, r) => (side === "player" && r === "P") || (side === "banker" && r === "B") || (side === "tie" && r === "T");

  function cardHTML(card, faceDown) {
    if (!card) return `<div class="card back"><div class="suit-mid">♠</div></div>`;
    const cls = card.suit.red ? "card red" : "card";
    return `<div class="${cls}"><div class="rank-top">${card.rank}<br>${card.suit.s}</div><div class="suit-mid">${card.suit.s}</div><div class="rank-bot">${card.rank}${card.suit.s}</div></div>`;
  }

  const HOWTO = `
    <h4>Goal</h4>
    <p>Bet on which hand — <b>Player</b> or <b>Banker</b> — finishes closest to <b>9</b>, or bet the <b>Tie</b>.
    You're not dealt into it; you just back a side and watch. Two hands are dealt by fixed rules.</p>
    <h4>Card values</h4>
    <p>Ace = 1, 2–9 = face value, 10/J/Q/K = 0. A hand's value is the <b>last digit of the total</b> (e.g. 7 + 8 = 15 → 5).</p>
    <h4>The deal</h4>
    <p>Player and Banker each get two cards. An 8 or 9 on the first two ("natural") ends it. Otherwise a fixed
    house rule decides whether each side takes one more card — you don't choose. Highest total wins.</p>
    <h4>Payouts</h4>
    <table>
      <tr><td>Banker wins</td><td>1 : 1 (−5% commission)</td></tr>
      <tr><td>Player wins</td><td>1 : 1</td></tr>
      <tr><td>Tie</td><td>8 : 1</td></tr>
    </table>
    <p>On a tie, Player/Banker bets are returned. <b>Banker is the best bet</b> (lowest house edge ~1.06%);
    Player ~1.24%. <b>Tie is a sucker bet</b> (~14% edge) — big payout, rarely hits.</p>`;

  function render(view) {
    let side = "banker";
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("heart", "ico-title")} Baccarat</h2>
        <p class="page-sub">Back the Player or Banker to land closest to 9 — or take the Tie. Banker is the smartest bet; Tie pays 8:1 but rarely hits.</p>
        ${Casino.helpBtnHTML("bacHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="felt bac-felt">
            <div class="bac-hands">
              <div class="bac-hand">
                <div class="hand-label"><span>Player</span><span class="hand-score" id="bacPScore">—</span></div>
                <div class="cards" id="bacP"></div>
              </div>
              <div class="bac-hand">
                <div class="hand-label"><span>Banker</span><span class="hand-score" id="bacBScore">—</span></div>
                <div class="cards" id="bacB"></div>
              </div>
            </div>
            <div class="bj-result" id="bacResult">Place a bet and deal.</div>
          </div>
          <div class="divider"></div>
          <div class="history">
            <h4>Bead plate</h4>
            <div class="bac-beads" id="bacBeads"></div>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(25)}
          <div class="field">
            <label>Bet on</label>
            <div class="bet-row">
              <button class="btn btn-ghost" data-side="player" id="bacPlayer">Player <small>1:1</small></button>
              <button class="btn btn-ghost" data-side="banker" id="bacBanker">Banker <small>0.95:1</small></button>
              <button class="btn btn-ghost" data-side="tie" id="bacTie">Tie <small>8:1</small></button>
            </div>
          </div>
          <div class="stat-grid">
            <div class="stat"><div class="k">Your bet</div><div class="v" id="bacSide">Banker</div></div>
            <div class="stat"><div class="k">Profit on win</div><div class="v" id="bacProfit">—</div></div>
          </div>
          <button class="btn btn-block btn-green" id="bacDeal" style="margin-top:16px;font-size:16px;padding:14px;">DEAL</button>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const dealBtn = view.querySelector("#bacDeal");
    const resultEl = view.querySelector("#bacResult");
    Casino.wireBet(view, updateStats);
    view.querySelector("#bacHelp").addEventListener("click", () => Casino.openHowTo("How to play — Baccarat", HOWTO));

    function setSide(s) {
      side = s;
      ["player", "banker", "tie"].forEach((k) => {
        const b = view.querySelector(`[data-side="${k}"]`);
        b.classList.toggle("btn-green", k === s);
        b.classList.toggle("btn-ghost", k !== s);
      });
      updateStats();
    }
    function updateStats() {
      const bet = Math.floor(Number(betInput.value)) || 0;
      const mult = side === "player" ? 1 : side === "banker" ? 0.95 : 8;
      view.querySelector("#bacSide").textContent = side[0].toUpperCase() + side.slice(1);
      view.querySelector("#bacProfit").textContent = bet > 0 ? "+" + Casino.fmt(Math.floor(bet * mult)) : "—";
    }

    function renderBeads() {
      view.querySelector("#bacBeads").innerHTML = history.slice(-42).map((r) =>
        `<span class="bac-bead ${r}">${r}</span>`).join("");
    }

    function showHands(P, B, hideAll) {
      view.querySelector("#bacP").innerHTML = P.map((c) => cardHTML(c, hideAll)).join("");
      view.querySelector("#bacB").innerHTML = B.map((c) => cardHTML(c, hideAll)).join("");
      view.querySelector("#bacPScore").textContent = hideAll ? "—" : total(P);
      view.querySelector("#bacBScore").textContent = hideAll ? "—" : total(B);
    }

    function doDeal() {
      if (dealing) return;
      const bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;

      let coup = deal();
      // Rigged odds: keep dealing until the player's side wins.
      if (Casino.cheat.win() && !wins(side, coup.result)) {
        for (let i = 0; i < 400 && !wins(side, coup.result); i++) coup = deal();
      }

      dealing = true;
      dealBtn.disabled = true;
      resultEl.textContent = "Dealing…";
      resultEl.style.color = "var(--gold-2)";

      // reveal card by card for drama
      const seq = [];
      const maxLen = Math.max(coup.P.length, coup.B.length);
      for (let i = 0; i < maxLen; i++) { if (coup.P[i]) seq.push(["P", i]); if (coup.B[i]) seq.push(["B", i]); }
      view.querySelector("#bacP").innerHTML = ""; view.querySelector("#bacB").innerHTML = "";
      const shownP = [], shownB = [];
      let k = 0;
      const anim = setInterval(() => {
        const [who, idx] = seq[k];
        if (who === "P") { shownP.push(coup.P[idx]); view.querySelector("#bacP").innerHTML = shownP.map((c) => cardHTML(c)).join(""); view.querySelector("#bacPScore").textContent = total(shownP); }
        else { shownB.push(coup.B[idx]); view.querySelector("#bacB").innerHTML = shownB.map((c) => cardHTML(c)).join(""); view.querySelector("#bacBScore").textContent = total(shownB); }
        Casino.sound.play("tick");
        if (++k >= seq.length) { clearInterval(anim); finish(coup, bet); }
      }, 340);
    }

    function finish(coup, bet) {
      const ret = payoutFor(side, coup.result, bet);
      const net = ret - bet;
      if (ret > 0) Casino.payout(ret);
      history.push(coup.result); renderBeads();
      const label = coup.result === "P" ? `Player wins ${coup.pt}–${coup.bt}` : coup.result === "B" ? `Banker wins ${coup.bt}–${coup.pt}` : `Tie at ${coup.pt}`;
      if (net > 0) { resultEl.textContent = `${label} — +${Casino.fmt(net)}!`; resultEl.style.color = "var(--green)"; Casino.sound.play(side === "tie" ? "bigwin" : "win"); Casino.toast(`${label} — won +${Casino.fmt(net)}!`, "win"); }
      else if (net === 0) { resultEl.textContent = `${label} — push, bet returned.`; resultEl.style.color = "var(--gold-2)"; Casino.sound.play("cashout"); }
      else { resultEl.textContent = `${label}. You lose.`; resultEl.style.color = "var(--red)"; Casino.sound.play("lose"); Casino.toast(`${label} — no win.`, "lose"); }
      dealing = false; dealBtn.disabled = false;
    }

    view.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => setSide(b.dataset.side)));
    dealBtn.addEventListener("click", doDeal);
    setSide("banker");
    renderBeads();
  }

  return { render, _t: { deal, payoutFor } };
})();
