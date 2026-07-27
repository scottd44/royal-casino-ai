/* ============================================================
   Red Dog (Acey-Deucey) — will the third card fall between?
   ------------------------------------------------------------
   Two cards are dealt. The "spread" is how many ranks sit strictly
   between them; the wider the spread the likelier a third card lands
   inside, so it pays less. You may raise before the third card.
   Consecutive = push; a pair pays 11:1 only if it makes trips.
   ============================================================ */
const RedDogGame = (() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const rv = (c) => RANKS.indexOf(c.rank) + 2;   // 2..14 (A high)

  let deck = [];
  function buildDeck() {
    const d = [];
    SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })));
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function draw() { if (deck.length < 8) deck = buildDeck(); return deck.pop(); }
  const cardOfVal = (v) => ({ rank: RANKS[v - 2], suit: Casino.pick(SUITS) });
  const oddsFor = (spread) => (spread === 1 ? 5 : spread === 2 ? 4 : spread === 3 ? 2 : 1);

  function cardHTML(card, faceDown) {
    if (faceDown || !card) return `<div class="card back"><div class="suit-mid">♠</div></div>`;
    const cls = card.suit.red ? "card red" : "card";
    return `<div class="${cls}"><div class="rank-top">${card.rank}<br>${card.suit.s}</div><div class="suit-mid">${card.suit.s}</div><div class="rank-bot">${card.rank}${card.suit.s}</div></div>`;
  }

  const HOWTO = `
    <h4>Goal</h4>
    <p>Two cards are dealt. A third is coming — you're betting it lands with a rank <b>strictly between</b> the
    first two. Aces are high.</p>
    <h4>The spread</h4>
    <p>The "spread" is how many ranks sit between the two cards (e.g. 5 and 9 → spread of 3: the 6, 7, 8). A
    bigger spread is easier to hit, so it pays less:</p>
    <table><tr><td>Spread 1</td><td>5:1</td></tr><tr><td>Spread 2</td><td>4:1</td></tr><tr><td>Spread 3</td><td>2:1</td></tr><tr><td>Spread 4+</td><td>1:1</td></tr></table>
    <h4>Special cases</h4>
    <ul>
      <li><b>Consecutive</b> cards (e.g. 8 and 9): automatic <b>push</b> — bet returned.</li>
      <li><b>Pair</b>: a third card is dealt; if it makes <b>three of a kind</b> you win <b>11:1</b>, otherwise push.</li>
    </ul>
    <h4>Raising</h4>
    <p>After seeing the spread you may <b>Raise</b> (double your bet) or <b>Call</b> (leave it), then the third
    card is revealed. <b>Strategy:</b> only raise on a spread of <b>7 or more</b>.</p>`;

  function render(view) {
    let bet = 0, busy = false, pending = null; // pending: {c1,c2,lo,hi,spread,odds}

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🔴 Red Dog</h2>
        <p class="page-sub">Bet the third card lands between the first two. Wider spread = better odds of hitting, smaller payout. Raise on a big spread.</p>
        ${Casino.helpBtnHTML("rdHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="felt rd-felt">
            <div class="cards rd-cards" id="rdCards"></div>
            <div class="rd-spread" id="rdSpread"></div>
            <div class="bj-result" id="rdResult">Place a bet and deal.</div>
          </div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(25)}
          <button class="btn btn-block btn-green" id="rdDeal" style="margin-top:14px;font-size:16px;padding:14px;">Deal</button>
          <div class="hc-actrow" id="rdActRow" style="margin-top:10px;display:none;">
            <button class="btn btn-blue" id="rdCall">Call</button>
            <button class="btn btn-purple" id="rdRaise">Raise (2×)</button>
          </div>
          <div class="stat-grid" style="margin-top:14px;">
            <div class="stat"><div class="k">Spread</div><div class="v" id="rdSpreadV">—</div></div>
            <div class="stat"><div class="k">Pays</div><div class="v"><span class="multiplier-tag" id="rdPays">—</span></div></div>
          </div>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const dealBtn = view.querySelector("#rdDeal");
    const actRow = view.querySelector("#rdActRow");
    const resultEl = view.querySelector("#rdResult");
    const cardsEl = view.querySelector("#rdCards");
    Casino.wireBet(view);
    view.querySelector("#rdHelp").addEventListener("click", () => Casino.openHowTo("How to play — Red Dog", HOWTO));

    function setSpread(txt, pays) { view.querySelector("#rdSpreadV").textContent = txt; view.querySelector("#rdPays").textContent = pays; }
    function endRound(net, msg, type) {
      resultEl.textContent = msg;
      resultEl.style.color = type === "win" ? "var(--green)" : type === "lose" ? "var(--red)" : "var(--gold-2)";
      Casino.sound.play(type === "win" ? (net >= bet * 4 ? "bigwin" : "win") : type === "lose" ? "lose" : "cashout");
      busy = false; dealBtn.disabled = false; betInput.disabled = false; pending = null;
    }

    function deal() {
      if (busy) return;
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      busy = true; dealBtn.disabled = true; betInput.disabled = true;
      view.querySelector("#rdSpread").textContent = "";
      const c1 = draw(), c2 = draw();
      let a = rv(c1), b = rv(c2);
      cardsEl.innerHTML = cardHTML(c1) + `<div class="rd-gap" id="rdGap">?</div>` + cardHTML(c2);
      Casino.sound.play("tick");

      if (a === b) { // pair → third card, trips pays 11:1
        let c3 = draw();
        if (Casino.cheat.win()) c3 = cardOfVal(a);
        setSpread("Pair", "11:1 on trips");
        setTimeout(() => {
          view.querySelector("#rdGap").outerHTML = cardHTML(c3);
          if (rv(c3) === a) { Casino.payout(bet * 12); endRound(bet * 11, `Trip ${c1.rank}s! +${Casino.fmt(bet * 11)}!`, "win"); }
          else { Casino.payout(bet); endRound(0, `Pair of ${c1.rank}s, no trips — push.`, "info"); }
        }, 500);
        return;
      }
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const spread = hi - lo - 1;
      if (spread === 0) { setSpread("Consecutive", "push"); setTimeout(() => { Casino.payout(bet); endRound(0, "Consecutive cards — push, bet returned.", "info"); }, 450); return; }
      const odds = oddsFor(spread);
      pending = { lo, hi, spread, odds };
      setSpread(String(spread), odds + ":1");
      view.querySelector("#rdSpread").textContent = `Spread ${spread} — pays ${odds}:1. Raise or call?`;
      view.querySelector("#rdSpread").style.color = "var(--gold-2)";
      actRow.style.display = "flex";
    }

    function resolveThird(wager) {
      actRow.style.display = "none";
      const { lo, hi, odds } = pending;
      let c3 = draw();
      if (Casino.cheat.win() && !(rv(c3) > lo && rv(c3) < hi)) c3 = cardOfVal(Casino.randInt(lo + 1, hi - 1));
      setTimeout(() => {
        view.querySelector("#rdGap").outerHTML = cardHTML(c3);
        if (rv(c3) > lo && rv(c3) < hi) { Casino.payout(wager * (odds + 1)); endRound(wager * odds, `${c3.rank} lands between — +${Casino.fmt(wager * odds)}!`, "win"); }
        else endRound(-wager, `${c3.rank} is outside. Lost ${Casino.money(wager)}.`, "lose");
      }, 450);
    }

    function call() { resolveThird(bet); }
    function raise() { if (!Casino.bet(bet)) { Casino.toast("Not enough to raise.", "lose"); return; } resolveThird(bet * 2); }

    dealBtn.addEventListener("click", deal);
    view.querySelector("#rdCall").addEventListener("click", call);
    view.querySelector("#rdRaise").addEventListener("click", raise);
  }

  return { render, _t: { oddsFor } };
})();
