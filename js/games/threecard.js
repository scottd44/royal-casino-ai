/* ============================================================
   Three Card Poker — Ante/Play + Pair Plus
   ------------------------------------------------------------
   You and the dealer get 3 cards. After seeing yours, Play (match
   your ante) or Fold. Dealer needs Queen-high to qualify. In 3-card
   poker a STRAIGHT beats a FLUSH (rarer). Ante Bonus & Pair Plus pay
   on your hand regardless of the dealer.
   ============================================================ */
const ThreeCardGame = (() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const rv = (c) => RANKS.indexOf(c.rank) + 2;   // 2..14

  let deck = [];
  const CAT = ["High card", "Pair", "Flush", "Straight", "Three of a kind", "Straight flush"];

  function buildDeck() {
    const d = [];
    SUITS.forEach((suit) => RANKS.forEach((rank) => d.push({ rank, suit })));
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function draw() { if (deck.length < 8) deck = buildDeck(); return deck.pop(); }

  function rank3(cs) {
    const rs = cs.map(rv).sort((a, b) => b - a);
    const flush = cs[0].suit.s === cs[1].suit.s && cs[1].suit.s === cs[2].suit.s;
    const uniq = [...new Set(rs)];
    let straight = false, sHigh = 0;
    if (uniq.length === 3) {
      if (rs[0] - rs[2] === 2) { straight = true; sHigh = rs[0]; }
      else if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) { straight = true; sHigh = 3; } // A-2-3
    }
    const trips = rs[0] === rs[1] && rs[1] === rs[2];
    const pair = !trips && (rs[0] === rs[1] || rs[1] === rs[2] || rs[0] === rs[2]);
    if (straight && flush) return [5, sHigh];
    if (trips) return [4, rs[0]];
    if (straight) return [3, sHigh];
    if (flush) return [2, rs[0], rs[1], rs[2]];
    if (pair) { const pr = rs[0] === rs[1] ? rs[0] : rs[1] === rs[2] ? rs[1] : rs[0]; const k = rs.filter((r) => r !== pr)[0] || 0; return [1, pr, k]; }
    return [0, rs[0], rs[1], rs[2]];
  }
  function cmp3(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x - y; } return 0; }
  const catName = (s) => CAT[s[0]];
  const qualifies = (s) => s[0] > 0 || s[1] >= 12; // Queen-high or better

  // returns total returned (incl. relevant stakes) + labels
  function resolve(player, dealer, ante, pp) {
    const ps = rank3(player), ds = rank3(dealer);
    let ret = 0;
    const abMult = ps[0] === 5 ? 5 : ps[0] === 4 ? 4 : ps[0] === 3 ? 1 : 0; // ante bonus
    ret += ante * abMult;
    let label;
    if (!qualifies(ds)) { ret += ante * 2 + ante; label = "Dealer doesn't qualify — ante wins, play pushes"; }
    else { const c = cmp3(ps, ds); if (c > 0) { ret += ante * 4; label = `You win — ${catName(ps)} beats ${catName(ds)}`; } else if (c < 0) { label = `Dealer wins with ${catName(ds)}`; } else { ret += ante * 2; label = "Tie — push"; } }
    if (pp > 0) { const m = [0, 2, 4, 7, 31, 41][ps[0]]; ret += m ? pp * m : 0; }
    return { ret, label, ps, ds, abMult };
  }

  function cardHTML(card, faceDown) {
    if (faceDown || !card) return `<div class="card back"><div class="suit-mid">♠</div></div>`;
    const cls = card.suit.red ? "card red" : "card";
    return `<div class="${cls}"><div class="rank-top">${card.rank}<br>${card.suit.s}</div><div class="suit-mid">${card.suit.s}</div><div class="rank-bot">${card.rank}${card.suit.s}</div></div>`;
  }

  const HOWTO = `
    <h4>Goal</h4>
    <p>Make a better 3-card poker hand than the dealer. Place an <b>Ante</b>; after seeing your three cards you
    choose to <b>Play</b> (match your ante) or <b>Fold</b> (forfeit the ante).</p>
    <h4>Hand ranking (high → low)</h4>
    <p>Straight flush › <b>Three of a kind</b> › <b>Straight</b> › Flush › Pair › High card.
    Note: with only 3 cards, a <b>straight beats a flush</b> (it's rarer).</p>
    <h4>Dealer qualifies on Queen-high</h4>
    <ul>
      <li>Dealer <b>doesn't qualify</b> (worse than Q-high): Ante pays 1:1, your Play bet pushes.</li>
      <li>Dealer <b>qualifies</b>: best hand wins — Ante &amp; Play both pay 1:1 (tie pushes).</li>
    </ul>
    <h4>Ante Bonus (paid no matter what the dealer has)</h4>
    <table><tr><td>Straight</td><td>1:1</td></tr><tr><td>Three of a kind</td><td>4:1</td></tr><tr><td>Straight flush</td><td>5:1</td></tr></table>
    <h4>Pair Plus (optional side bet on your hand)</h4>
    <table><tr><td>Pair</td><td>1:1</td></tr><tr><td>Flush</td><td>3:1</td></tr><tr><td>Straight</td><td>6:1</td></tr><tr><td>Three of a kind</td><td>30:1</td></tr><tr><td>Straight flush</td><td>40:1</td></tr></table>
    <p><b>Strategy:</b> Play any hand of <b>Queen-6-4 or better</b>; fold worse.</p>`;

  function render(view) {
    let phase = "bet"; // bet | decide
    let player = [], dealer = [], ante = 0, pp = 0;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🂡 Three Card Poker</h2>
        <p class="page-sub">Beat the dealer with three cards. Ante up, then Play or Fold. Add Pair Plus for bonus payouts on your own hand.</p>
        ${Casino.helpBtnHTML("tcpHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="felt">
            <div class="hand-row"><div class="hand-label"><span>Dealer</span><span class="hand-score" id="tcpDScore">—</span></div><div class="cards" id="tcpDealer"></div></div>
            <div class="hand-row"><div class="hand-label"><span>You</span><span class="hand-score" id="tcpPScore">—</span></div><div class="cards" id="tcpPlayer"></div></div>
            <div class="bj-result" id="tcpResult">Set your ante and deal.</div>
          </div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(25, "Ante")}
          <label class="bj-beginner"><input type="checkbox" id="tcpPP"> Also bet <b>Pair Plus</b> (= ante)</label>
          <button class="btn btn-block btn-green" id="tcpDeal" style="margin-top:14px;font-size:16px;padding:14px;">Deal</button>
          <div class="hc-actrow" style="margin-top:10px;">
            <button class="btn btn-red" id="tcpFold" disabled>Fold</button>
            <button class="btn btn-blue" id="tcpPlay" disabled>Play</button>
          </div>
          <div class="stat-grid" style="margin-top:14px;">
            <div class="stat"><div class="k">Your hand</div><div class="v" id="tcpHand">—</div></div>
            <div class="stat"><div class="k">Last win</div><div class="v" id="tcpLast">—</div></div>
          </div>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const ppChk = view.querySelector("#tcpPP");
    const dealBtn = view.querySelector("#tcpDeal");
    const foldBtn = view.querySelector("#tcpFold");
    const playBtn = view.querySelector("#tcpPlay");
    const resultEl = view.querySelector("#tcpResult");
    Casino.wireBet(view);
    view.querySelector("#tcpHelp").addEventListener("click", () => Casino.openHowTo("How to play — Three Card Poker", HOWTO));

    function showHands(revealDealer) {
      view.querySelector("#tcpPlayer").innerHTML = player.map((c) => cardHTML(c)).join("");
      view.querySelector("#tcpPScore").textContent = player.length ? catName(rank3(player)) : "—";
      view.querySelector("#tcpDealer").innerHTML = dealer.map((c) => cardHTML(c, !revealDealer)).join("");
      view.querySelector("#tcpDScore").textContent = revealDealer && dealer.length ? catName(rank3(dealer)) : "—";
      view.querySelector("#tcpHand").textContent = player.length ? catName(rank3(player)) : "—";
    }

    function setButtons(deciding) {
      dealBtn.disabled = deciding; betInput.disabled = deciding; ppChk.disabled = deciding;
      foldBtn.disabled = !deciding; playBtn.disabled = !deciding;
    }

    function deal() {
      ante = Math.floor(Number(betInput.value));
      pp = ppChk.checked ? ante : 0;
      if (!Casino.bet(ante + pp)) return;
      deck = deck.length < 12 ? buildDeck() : deck;
      player = [draw(), draw(), draw()];
      dealer = [draw(), draw(), draw()];
      // Rigged odds: deal until the player's hand outranks the dealer.
      if (Casino.cheat.win()) { let g = 0; while (g++ < 300 && cmp3(rank3(player), rank3(dealer)) <= 0) { player = [draw(), draw(), draw()]; dealer = [draw(), draw(), draw()]; } }
      phase = "decide";
      showHands(false);
      resultEl.textContent = "Play (match your ante) or Fold?";
      resultEl.style.color = "var(--gold-2)";
      setButtons(true);
      Casino.sound.play("tick");
    }

    function fold() {
      phase = "bet"; setButtons(false);
      showHands(true);
      resultEl.textContent = `Folded — lost ${Casino.money(ante + pp)}.`;
      resultEl.style.color = "var(--red)";
      Casino.sound.play("lose");
    }

    function play() {
      if (!Casino.bet(ante)) { Casino.toast("Not enough for the Play bet.", "lose"); return; }
      phase = "bet"; setButtons(false);
      showHands(true);
      const r = resolve(player, dealer, ante, pp);
      const staked = ante * 2 + pp;
      const net = r.ret - staked;
      if (r.ret > 0) Casino.payout(r.ret);
      let extra = "";
      if (r.abMult) extra += ` · Ante bonus ${r.abMult}:1`;
      if (net > 0) { resultEl.textContent = `${r.label}${extra} — +${Casino.fmt(net)}!`; resultEl.style.color = "var(--green)"; Casino.sound.play(net >= ante * 6 ? "bigwin" : "win"); Casino.toast(`Won +${Casino.fmt(net)}!`, "win"); }
      else if (net === 0) { resultEl.textContent = `${r.label}${extra} — even.`; resultEl.style.color = "var(--gold-2)"; Casino.sound.play("cashout"); }
      else { resultEl.textContent = `${r.label}${extra}. Lost ${Casino.money(-net)}.`; resultEl.style.color = "var(--red)"; Casino.sound.play("lose"); }
      view.querySelector("#tcpLast").textContent = net > 0 ? "+" + Casino.fmt(net) : net < 0 ? "-" + Casino.fmt(-net) : "0";
    }

    dealBtn.addEventListener("click", deal);
    foldBtn.addEventListener("click", fold);
    playBtn.addEventListener("click", play);
  }

  return { render, _t: { rank3, cmp3, resolve, qualifies } };
})();
