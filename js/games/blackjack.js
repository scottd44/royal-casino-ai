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

  function cardVal(c) { return c.rank === "A" ? 11 : ["K", "Q", "J", "10"].includes(c.rank) ? 10 : Number(c.rank); }

  // Total + whether an ace is still counted as 11 (soft hand).
  function handInfo(hand) {
    let total = 0, aces = 0;
    hand.forEach((c) => {
      if (c.rank === "A") { total += 11; aces++; }
      else total += cardVal(c);
    });
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
  }

  /* Basic strategy (dealer stands on 17, blackjack pays 3:2, no split here).
     Returns "hit" | "stand" | "double". `canDouble` false → doubles fall back. */
  function basicStrategy(playerHand, dealerUpcard, canDouble) {
    const { total, soft } = handInfo(playerHand);
    const d = cardVal(dealerUpcard); // 2..11 (A = 11)
    let rec;
    if (soft) {
      if (total >= 19) rec = "stand";
      else if (total === 18) rec = (d >= 3 && d <= 6) ? "double" : (d === 2 || d === 7 || d === 8) ? "stand" : "hit";
      else if (total === 17) rec = (d >= 3 && d <= 6) ? "double" : "hit";
      else if (total >= 15) rec = (d >= 4 && d <= 6) ? "double" : "hit"; // A4, A5
      else if (total >= 13) rec = (d >= 5 && d <= 6) ? "double" : "hit"; // A2, A3
      else rec = "hit";
    } else {
      if (total >= 17) rec = "stand";
      else if (total >= 13) rec = (d >= 2 && d <= 6) ? "stand" : "hit"; // 13-16
      else if (total === 12) rec = (d >= 4 && d <= 6) ? "stand" : "hit";
      else if (total === 11) rec = (d <= 10) ? "double" : "hit";
      else if (total === 10) rec = (d <= 9) ? "double" : "hit";
      else if (total === 9) rec = (d >= 3 && d <= 6) ? "double" : "hit";
      else rec = "hit"; // 5-8
    }
    if (rec === "double" && !canDouble) rec = (soft && total >= 18) ? "stand" : "hit";
    return rec;
  }

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
        <h2 class="page-title">${Casino.icon("spade", "ico-title")} Blackjack</h2>
        <p class="page-sub">Beat the dealer without going over 21. Blackjack pays 3:2. Dealer stands on 17.</p>
        ${Casino.helpBtnHTML("bjHelp")}
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
          <label class="bj-beginner"><input type="checkbox" id="bjBeginner"> Beginner mode — show the strategy hint</label>
          <div class="divider"></div>
          <div class="bj-hint" id="bjHint" style="display:none"></div>
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
    const beginnerChk = view.querySelector("#bjBeginner");
    const hintEl = view.querySelector("#bjHint");

    Casino.wireBet(view);
    view.querySelector("#bjHelp").addEventListener("click", () => Casino.openHowTo("How to play — Blackjack", `
      <h4>Goal</h4>
      <p>Get your hand closer to <b>21</b> than the dealer — without going over. Number cards are face value, face cards are 10, and an <b>Ace</b> is 1 or 11 (whichever helps). Going over 21 is a <b>bust</b> and an instant loss.</p>
      <h4>Your options</h4>
      <ul>
        <li><b>Hit</b> — take another card.</li>
        <li><b>Stand</b> — keep your total and pass to the dealer.</li>
        <li><b>Double</b> — double your bet, take exactly one more card, then stand.</li>
      </ul>
      <h4>Payouts &amp; dealer rules</h4>
      <p>A win pays <b>1:1</b>; a natural <b>Blackjack</b> (Ace + 10-value on the first two cards) pays <b>3:2</b>. The dealer must <b>hit until 17</b> and then stand. Tie = push (bet returned).</p>
      <p>New to it? Flip on <b>Beginner mode</b> for a live basic-strategy hint each turn.</p>`));

    // Beginner mode preference persists.
    const BEG_KEY = "royal_casino_bj_beginner";
    beginnerChk.checked = localStorage.getItem(BEG_KEY) === "1";
    beginnerChk.addEventListener("change", () => {
      localStorage.setItem(BEG_KEY, beginnerChk.checked ? "1" : "0");
      updateHint();
    });

    const ACTION_LABEL = { hit: "HIT", stand: "STAND", double: "DOUBLE" };
    function clearHintHighlight() {
      [hitBtn, standBtn, doubleBtn].forEach((b) => b.classList.remove("bj-suggest"));
    }
    function updateHint() {
      clearHintHighlight();
      const canAct = inRound && !hitBtn.disabled;
      if (!beginnerChk.checked || !canAct) { hintEl.style.display = "none"; return; }
      const canDouble = player.length === 2 && Casino.getBalance() >= bet;
      const rec = basicStrategy(player, dealer[0], canDouble);
      hintEl.style.display = "";
      hintEl.innerHTML = `Basic strategy says <b>${ACTION_LABEL[rec]}</b>`;
      const btn = { hit: hitBtn, stand: standBtn, double: doubleBtn }[rec];
      if (btn && !btn.disabled) btn.classList.add("bj-suggest");
    }

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
        message = "Lucky break — your stake is refunded.";
        Casino.sound.play("cashout");
      }
      inRound = false;
      setActionButtons(false);
      dealBtn.disabled = false;
      drawHands(false);
      hintEl.style.display = "none";
      clearHintHighlight();
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
      updateHint();

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
      else updateHint();
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
