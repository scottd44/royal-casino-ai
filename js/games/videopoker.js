/* ============================================================
   Video Poker — Jacks or Better (9/6 full-pay, ~99.5% RTP)
   ============================================================ */
const VideoPokerGame = (() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  // Paytable is expressed "for 1": the total returned per unit staked
  // (so "Jacks or Better" paying 1 returns your bet — a push). 9/6 full-pay
  // Jacks or Better returns ~99.5%, matching the app's ~1% house edge.
  const PAYTABLE = [
    { key: "royal",    label: "Royal Flush",      pay: 800 },
    { key: "sflush",   label: "Straight Flush",   pay: 50 },
    { key: "quads",    label: "Four of a Kind",   pay: 25 },
    { key: "full",     label: "Full House",       pay: 9 },
    { key: "flush",    label: "Flush",            pay: 6 },
    { key: "straight", label: "Straight",         pay: 4 },
    { key: "trips",    label: "Three of a Kind",  pay: 3 },
    { key: "twopair",  label: "Two Pair",         pay: 2 },
    { key: "jacks",    label: "Jacks or Better",  pay: 1 },
  ];
  const PAY = Object.fromEntries(PAYTABLE.map((p) => [p.key, p.pay]));

  let deck = [];
  let hand = [];        // 5 cards
  let held = [false, false, false, false, false];
  let bet = 0;
  let phase = "idle";   // "idle" (needs deal) | "draw" (holds locked in, awaiting draw)

  function buildDeck() {
    const d = [];
    SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })));
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function draw() {
    if (!deck.length) deck = buildDeck();
    return deck.pop();
  }

  function rankVal(r) { return RANKS.indexOf(r) + 2; } // 2..14 (A high)

  /* Evaluate a 5-card hand → { key, label, pay } or null for no win. */
  function evaluate(cards) {
    const counts = {};
    cards.forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
    const groups = Object.values(counts).sort((a, b) => b - a); // e.g. [3,2]

    const isFlush = cards.every((c) => c.suit.s === cards[0].suit.s);

    const vals = [...new Set(cards.map((c) => rankVal(c.rank)))].sort((a, b) => a - b);
    let isStraight = vals.length === 5 && vals[4] - vals[0] === 4;
    // Wheel straight: A-2-3-4-5 (Ace counts low)
    const isWheel = vals.length === 5 &&
      vals[0] === 2 && vals[1] === 3 && vals[2] === 4 && vals[3] === 5 && vals[4] === 14;
    if (isWheel) isStraight = true;

    if (isStraight && isFlush) {
      // Royal = 10-J-Q-K-A of one suit (not the wheel).
      if (!isWheel && vals[0] === 10) return { key: "royal", ...pick("royal") };
      return { key: "sflush", ...pick("sflush") };
    }
    if (groups[0] === 4) return { key: "quads", ...pick("quads") };
    if (groups[0] === 3 && groups[1] === 2) return { key: "full", ...pick("full") };
    if (isFlush) return { key: "flush", ...pick("flush") };
    if (isStraight) return { key: "straight", ...pick("straight") };
    if (groups[0] === 3) return { key: "trips", ...pick("trips") };
    if (groups[0] === 2 && groups[1] === 2) return { key: "twopair", ...pick("twopair") };
    if (groups[0] === 2) {
      // Only a pair of Jacks or higher pays.
      const pairRank = Object.keys(counts).find((r) => counts[r] === 2);
      if (rankVal(pairRank) >= 11) return { key: "jacks", ...pick("jacks") };
    }
    return null;

    function pick(k) {
      const row = PAYTABLE.find((p) => p.key === k);
      return { label: row.label, pay: row.pay };
    }
  }

  function cardHTML(card, faceDown) {
    if (faceDown) return `<div class="card back"><div class="suit-mid">♠</div></div>`;
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
        <h2 class="page-title">${Casino.icon("club", "ico-title")} Video Poker</h2>
        <p class="page-sub">Jacks or Better. Deal five, hold the ones you want, and draw. Pair of jacks or higher pays.</p>
        ${Casino.helpBtnHTML("vpHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="felt">
            <div class="vp-cards" id="vpCards"></div>
            <div class="bj-result" id="vpResult">Press Deal to start.</div>
          </div>
          <div class="divider"></div>
          <div class="paytable">
            <table id="vpPaytable">
              ${PAYTABLE.map((p) => `
                <tr data-row="${p.key}"><td>${p.label}</td><td><span class="pay-mult">${p.pay}×</span></td></tr>`).join("")}
            </table>
            <p class="payline-note">Payouts are total returned per $1 staked (Jacks pays 1× = your bet back).</p>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(25)}
          <button class="btn btn-block btn-green" id="dealBtn" style="font-size:16px;padding:14px;">Deal</button>
          <button class="btn btn-block" id="drawBtn" style="font-size:16px;padding:14px;margin-top:10px;" disabled>Draw</button>
          <p class="hint" style="margin-top:16px;">
            After the deal, click cards to <strong>Hold</strong> them, then press Draw to replace the rest.
          </p>
          <label class="vp-toggle"><input type="checkbox" id="vpInstant"> Instant draw <span>— flip the new cards at once instead of dealing them one by one</span></label>
          <div class="stat-grid" style="margin-top:16px;">
            <div class="stat"><div class="k">Last win</div><div class="v" id="lastWin">—</div></div>
            <div class="stat"><div class="k">Best win</div><div class="v" id="bestWin">0</div></div>
          </div>
        </div>
      </div>`;

    const cardsEl = view.querySelector("#vpCards");
    const resultEl = view.querySelector("#vpResult");
    const betInput = view.querySelector("#betInput");
    const dealBtn = view.querySelector("#dealBtn");
    const drawBtn = view.querySelector("#drawBtn");
    const instantChk = view.querySelector("#vpInstant");
    let bestWin = 0;

    // Instant-draw preference persists across sessions.
    const INSTANT_KEY = "royal_casino_vp_instant";
    instantChk.checked = localStorage.getItem(INSTANT_KEY) === "1";
    instantChk.addEventListener("change", () =>
      localStorage.setItem(INSTANT_KEY, instantChk.checked ? "1" : "0"));

    Casino.wireBet(view);
    view.querySelector("#vpHelp").addEventListener("click", () => Casino.openHowTo("How to play — Video Poker", `
      <h4>Goal</h4>
      <p>Make the best five-card poker hand you can. Press <b>Deal</b> for five cards, then click any cards you want to <b>Hold</b>, and press <b>Draw</b> to replace the rest. Your final hand is paid per the table.</p>
      <h4>"Jacks or Better"</h4>
      <p>The smallest paying hand is a <b>pair of Jacks</b> — a pair of tens or lower pays nothing. Bigger hands (two pair, flush, full house, and up to a royal flush) pay progressively more, shown live in the paytable.</p>
      <h4>Strategy tips</h4>
      <ul>
        <li>Always keep a paying pair or better.</li>
        <li>Hold four cards to a flush or open-ended straight over a low pair.</li>
        <li>Never hold a lone low card just because it's high-ish — draw fresh.</li>
      </ul>`));

    function highlightRow(key) {
      view.querySelectorAll("#vpPaytable tr").forEach((tr) =>
        tr.classList.toggle("hit", tr.dataset.row === key));
    }

    function renderHand(faceDownEmpty) {
      if (faceDownEmpty) {
        cardsEl.innerHTML = [0,1,2,3,4].map(() =>
          `<div class="vp-slot">${cardHTML(null, true)}</div>`).join("");
        return;
      }
      cardsEl.innerHTML = hand.map((c, i) => `
        <div class="vp-slot ${held[i] ? "held" : ""}" data-idx="${i}">
          <div class="vp-hold-badge">HELD</div>
          ${cardHTML(c, false)}
        </div>`).join("");
      // Only allow toggling holds while in the draw phase.
      if (phase === "draw") {
        cardsEl.querySelectorAll(".vp-slot").forEach((slot) => {
          slot.addEventListener("click", () => toggleHold(Number(slot.dataset.idx)));
        });
      }
    }

    function toggleHold(i) {
      if (phase !== "draw") return;
      held[i] = !held[i];
      const slot = cardsEl.querySelector(`.vp-slot[data-idx="${i}"]`);
      slot.classList.toggle("held", held[i]);
    }

    function deal() {
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      deck = buildDeck();
      hand = [draw(), draw(), draw(), draw(), draw()];
      held = [false, false, false, false, false];
      phase = "draw";
      renderHand(false);
      // Show what was dealt so a made hand is obvious — hold it before drawing!
      const dealt = evaluate(hand);
      if (dealt) {
        highlightRow(dealt.key);
        resultEl.textContent = `Dealt ${dealt.label} — HOLD these cards, then Draw to keep it.`;
        resultEl.style.color = "var(--green)";
      } else {
        highlightRow(null);
        resultEl.textContent = "Hold the cards you want, then Draw.";
        resultEl.style.color = "var(--gold-2)";
      }
      dealBtn.disabled = true;
      drawBtn.disabled = false;
    }

    // Re-render one slot with its (now face-up) card and a deal animation.
    function revealSlot(i) {
      const slot = cardsEl.querySelector(`.vp-slot[data-idx="${i}"]`);
      if (!slot) return;
      slot.classList.remove("held");
      slot.classList.add("vp-dealt");
      slot.innerHTML = `<div class="vp-hold-badge">HELD</div>${cardHTML(hand[i], false)}`;
    }

    // Held cards face up; the cards being replaced start face-down.
    function renderDealing(replaceSet) {
      cardsEl.innerHTML = hand.map((c, i) => `
        <div class="vp-slot ${held[i] ? "held" : ""}" data-idx="${i}">
          <div class="vp-hold-badge">HELD</div>
          ${replaceSet.has(i) ? cardHTML(null, true) : cardHTML(c, false)}
        </div>`).join("");
    }

    function doDraw() {
      if (phase !== "draw") return;
      const toReplace = [];
      for (let i = 0; i < 5; i++) if (!held[i]) toReplace.push(i);
      phase = "drawing";
      drawBtn.disabled = true;
      dealBtn.disabled = true;
      resultEl.textContent = toReplace.length ? "Drawing…" : "Standing pat…";
      resultEl.style.color = "var(--gold-2)";

      // Instant draw: replace everything and resolve immediately.
      if (instantChk.checked || !toReplace.length) {
        for (const idx of toReplace) hand[idx] = draw();
        renderDealing(new Set()); // all face-up
        finishDraw();
        return;
      }

      renderDealing(new Set(toReplace));

      // Deal the replacements one at a time; whole draw takes ~4s.
      const perCard = Math.min(1200, Math.round(4200 / toReplace.length));
      let k = 0;
      const timer = setInterval(() => {
        const idx = toReplace[k];
        hand[idx] = draw();
        revealSlot(idx);
        Casino.sound.play("tick");
        if (++k >= toReplace.length) { clearInterval(timer); finishDraw(); }
      }, perCard);
    }

    function finishDraw() {
      phase = "idle";
      held = [true, true, true, true, true];

      const result = evaluate(hand);
      if (result) {
        const winAmount = bet * result.pay;
        Casino.payout(winAmount);
        highlightRow(result.key);
        const net = winAmount - bet;
        if (net > 0) {
          Casino.sound.play(result.pay >= 25 ? "bigwin" : "win");
          resultEl.textContent = `${result.label}! +${Casino.fmt(net)}`;
          resultEl.style.color = "var(--green)";
          Casino.toast(`${result.label} — won +${Casino.fmt(net)}!`, "win");
        } else {
          resultEl.textContent = `${result.label} — bet returned.`;
          resultEl.style.color = "var(--gold-2)";
          Casino.toast(`${result.label} — push.`, "info");
        }
        view.querySelector("#lastWin").textContent = "+" + Casino.fmt(winAmount);
        if (winAmount > bestWin) {
          bestWin = winAmount;
          view.querySelector("#bestWin").textContent = Casino.fmt(bestWin);
        }
      } else if (Casino.cheat.win()) {
        // Rigged odds: refund the stake on a non-paying hand.
        Casino.payout(bet);
        Casino.sound.play("cashout");
        resultEl.textContent = "Lucky refund — stake returned.";
        resultEl.style.color = "var(--gold-2)";
        Casino.toast("Lucky refund — stake returned.", "info");
        view.querySelector("#lastWin").textContent = "+" + Casino.fmt(bet);
      } else {
        Casino.sound.play("lose");
        resultEl.textContent = "No win — deal again.";
        resultEl.style.color = "var(--red)";
        Casino.toast("No paying hand.", "lose");
        view.querySelector("#lastWin").textContent = "0";
      }

      dealBtn.disabled = false;
      drawBtn.disabled = true;
    }

    dealBtn.addEventListener("click", deal);
    drawBtn.addEventListener("click", doDraw);
    renderHand(true);
  }

  // `evaluate` is exposed so the AI agent can describe the current made hand
  // (and its fallback heuristic can reason about holds) without duplicating logic.
  return { render, evaluate };
})();
