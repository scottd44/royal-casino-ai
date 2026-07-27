/* ============================================================
   Blackjack — dealer stands on 17, blackjack pays 3:2
   ============================================================ */
const BlackjackGame = (() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  let deck = [];
  let player = [];
  let dealer = [];
  let bet = 0;
  let inRound = false;
  let doubled = false;

  function buildDeck() {
    const d = [];
    SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })));
    // Fisher–Yates shuffle
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function draw() {
    if (deck.length < 10) deck = buildDeck();
    return deck.pop();
  }

  function handValue(hand) {
    let total = 0, aces = 0;
    hand.forEach((c) => {
      if (c.rank === "A") { total += 11; aces++; }
      else if (["K", "Q", "J", "10"].includes(c.rank)) total += 10;
      else total += Number(c.rank);
    });
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  function isBlackjack(hand) { return hand.length === 2 && handValue(hand) === 21; }

  function cardHTML(card, faceDown) {
    if (faceDown) {
      return `<div class="card back"><div class="suit-mid">♠</div></div>`;
    }
    const cls = card.suit.red ? "card red" : "card";
    return `<div class="${cls}">
        <div class="rank-top">${card.rank}<br>${card.suit.s}</div>
        <div class="suit-mid">${card.suit.s}</div>
        <div class="rank-bot">${card.rank}${card.suit.s}</div>
      </div>`;
  }

  function render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🃏 Blackjack</h2>
        <p class="page-sub">Beat the dealer without going over 21. Blackjack pays 3:2. Dealer stands on 17.</p>
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="felt">
            <div class="hand-row">
              <div class="hand-label"><span>Dealer</span><span class="hand-score" id="dealerScore">—</span></div>
              <div class="cards" id="dealerCards"></div>
            </div>
            <div class="hand-row">
              <div class="hand-label"><span>You</span><span class="hand-score" id="playerScore">—</span></div>
              <div class="cards" id="playerCards"></div>
            </div>
            <div class="bj-result" id="bjResult"></div>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(25)}
          <button class="btn btn-block btn-green" id="dealBtn" style="font-size:16px;padding:14px;">Deal</button>
          <div class="divider"></div>
          <div class="bj-actions">
            <button class="btn btn-blue" id="hitBtn" disabled>Hit</button>
            <button class="btn" id="standBtn" disabled>Stand</button>
            <button class="btn btn-ghost" id="doubleBtn" disabled>Double</button>
          </div>
          <p class="hint" style="margin-top:16px;">
            <strong>Double</strong> doubles your bet, deals one card, then stands.
          </p>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const dealBtn = view.querySelector("#dealBtn");
    const hitBtn = view.querySelector("#hitBtn");
    const standBtn = view.querySelector("#standBtn");
    const doubleBtn = view.querySelector("#doubleBtn");
    const resultEl = view.querySelector("#bjResult");

    Casino.wireBet(view);

    function drawHands(hideHole) {
      const pv = handValue(player);
      view.querySelector("#playerCards").innerHTML = player.map((c) => cardHTML(c, false)).join("");
      view.querySelector("#playerScore").textContent = pv;

      view.querySelector("#dealerCards").innerHTML = dealer
        .map((c, i) => cardHTML(c, hideHole && i === 1)).join("");
      view.querySelector("#dealerScore").textContent = hideHole
        ? handValue([dealer[0]]) + " + ?"
        : handValue(dealer);
    }

    function setActionButtons(active) {
      hitBtn.disabled = !active;
      standBtn.disabled = !active;
      // Double only allowed on the opening two cards with funds available.
      doubleBtn.disabled = !active || player.length !== 2 || Casino.getBalance() < bet;
      dealBtn.disabled = active;
    }

    function endRound(message, type, winAmount) {
      // Rigged odds: turn a loss into a stake refund (lucky break).
      if (type === "lose" && Casino.cheat.win()) {
        type = "push";
        winAmount = bet;
        message = "🍀 Lucky break — your stake is refunded.";
        Casino.sound.play("cashout");
      }
      inRound = false;
      setActionButtons(false);
      dealBtn.disabled = false;
      drawHands(false);
      resultEl.textContent = message;
      resultEl.style.color =
        type === "win" ? "var(--green)" : type === "lose" ? "var(--red)" : "var(--gold-2)";
      if (winAmount > 0) Casino.payout(winAmount);
      if (type === "win") Casino.sound.play("win");
      else if (type === "lose") Casino.sound.play("lose");
      Casino.toast(message, type);
    }

    function deal() {
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      doubled = false;
      inRound = true;
      resultEl.textContent = "";
      deck = deck.length < 15 ? buildDeck() : deck;
      player = [draw(), draw()];
      dealer = [draw(), draw()];
      drawHands(true);
      setActionButtons(true);

      // Immediate blackjack resolution
      const pBJ = isBlackjack(player);
      const dBJ = isBlackjack(dealer);
      if (pBJ || dBJ) {
        if (pBJ && dBJ) endRound("Push — both blackjack. Bet returned.", "info", bet);
        else if (pBJ) endRound(`Blackjack! Paid 3:2 (+${Casino.fmt(Math.floor(bet * 1.5))}).`, "win", Math.floor(bet * 2.5));
        else endRound("Dealer has blackjack. You lose.", "lose", 0);
      }
    }

    function playerBust() {
      endRound(`Bust at ${handValue(player)}. You lose.`, "lose", 0);
    }

    function dealerPlayAndSettle() {
      while (handValue(dealer) < 17) dealer.push(draw());
      const pv = handValue(player);
      const dv = handValue(dealer);
      drawHands(false);

      if (dv > 21) endRound(`Dealer busts at ${dv}. You win +${Casino.fmt(bet)}!`, "win", bet * 2);
      else if (dv > pv) endRound(`Dealer wins ${dv} to ${pv}. You lose.`, "lose", 0);
      else if (dv < pv) endRound(`You win ${pv} to ${dv}! +${Casino.fmt(bet)}`, "win", bet * 2);
      else endRound(`Push at ${pv}. Bet returned.`, "info", bet);
    }

    hitBtn.addEventListener("click", () => {
      if (!inRound) return;
      player.push(draw());
      drawHands(true);
      doubleBtn.disabled = true;
      if (handValue(player) > 21) playerBust();
      else if (handValue(player) === 21) dealerPlayAndSettle();
    });

    standBtn.addEventListener("click", () => {
      if (!inRound) return;
      dealerPlayAndSettle();
    });

    doubleBtn.addEventListener("click", () => {
      if (!inRound || player.length !== 2) return;
      if (!Casino.bet(bet)) return; // take the extra stake
      bet *= 2;
      doubled = true;
      player.push(draw());
      drawHands(true);
      if (handValue(player) > 21) playerBust();
      else dealerPlayAndSettle();
    });

    dealBtn.addEventListener("click", deal);
  }

  return { render };
})();
