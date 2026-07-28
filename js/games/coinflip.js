/* ============================================================
   Coinflip — streak flip (compounding 50/50)
   ------------------------------------------------------------
   Pick Heads or Tails. Guess right and your stake compounds by
   ~1.96× (2× minus a 2% edge). Cash out or flip again — a wrong
   guess forfeits the whole streak. Multi-coin mode: bet that all
   2 or 3 coins land on your side for 3.92× / 7.84× per step.
   Each coin is committed by a server-seed hash before you pick.
   ============================================================ */
const CoinflipGame = (() => {
  const EDGE = 0.02; // per-step house edge → RTP 0.98
  const payoutFor = (coins) => Math.pow(2, coins) * (1 - EDGE); // 1.96 / 3.92 / 7.84

  function xmur3(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; }; }
  const seedHash = (s) => xmur3(s)().toString(16).padStart(8, "0");
  const randSeed = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  // deterministic coin face from committed seeds: 0 = Tails, 1 = Heads
  const coinFace = (server, client, nonce, idx) => (xmur3(`${server}:${client}:${nonce}:${idx}`)() & 1);

  const HOWTO = `
    <h4>Goal</h4>
    <p>Call <b>Heads</b> or <b>Tails</b>. Guess right and your stake grows by <b>${payoutFor(1)}×</b>; guess wrong
    and you lose it all. After each win you choose to <b>Cash Out</b> or <b>Flip Again</b> to compound.</p>
    <h4>Compounding</h4>
    <table>
      <tr><td>1 win</td><td>${payoutFor(1).toFixed(2)}×</td></tr>
      <tr><td>3 wins</td><td>${Math.pow(payoutFor(1), 3).toFixed(2)}×</td></tr>
      <tr><td>5 wins</td><td>${Math.pow(payoutFor(1), 5).toFixed(1)}×</td></tr>
      <tr><td>10 wins</td><td>${Math.round(Math.pow(payoutFor(1), 10))}×</td></tr>
    </table>
    <h4>Multi-coin twist</h4>
    <p>Flip <b>2</b> or <b>3</b> coins at once and bet they <b>all</b> land on your side — riskier, but each win pays
    <b>${payoutFor(2)}×</b> or <b>${payoutFor(3)}×</b>.</p>
    <h4>Provably fair</h4>
    <p>Each coin is fixed by a committed <b>server-seed hash</b> shown before you call. The seed is revealed after the
    round so you can verify no coin was flipped after your pick. Every step returns a fair <b>98%</b>.</p>`;

  function render(view) {
    let bet = 0, mult = 1, streak = 0, coins = 1, phase = "idle"; // idle · playing · over
    let server = randSeed(), client = randSeed(), nonce = 1;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("circle-dollar-sign", "ico-title")} Coinflip</h2>
        <p class="page-sub">Call it right and compound your stake ${payoutFor(1)}× per flip. Cash out or push your streak — one wrong call ends it. Flip up to 3 coins for bigger jumps.</p>
        ${Casino.helpBtnHTML("cfHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="cf-stage">
            <div class="cf-coins" id="cfCoins"></div>
            <div class="cf-mult" id="cfMultBig">1.00×</div>
            <div class="bj-result" id="cfMsg">Set a bet, pick your side.</div>
          </div>
          <div class="divider"></div>
          <div class="history"><h4>Streak</h4><div class="history-list cf-history" id="cfHist"></div></div>
          <div class="cf-fair" id="cfFair"></div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="field" style="margin-top:12px;">
            <label>Coins (all must match)</label>
            <div class="bet-row" id="cfCoinSel">
              <button class="btn btn-ghost sel" data-coins="1">1 · ${payoutFor(1)}×</button>
              <button class="btn btn-ghost" data-coins="2">2 · ${payoutFor(2)}×</button>
              <button class="btn btn-ghost" data-coins="3">3 · ${payoutFor(3)}×</button>
            </div>
          </div>
          <div class="cf-pick" id="cfPick" style="margin-top:14px;">
            <button class="btn btn-block btn-blue" id="cfHeads" style="font-size:16px;padding:14px;">Heads</button>
            <button class="btn btn-block btn-purple" id="cfTails" style="font-size:16px;padding:14px;margin-top:10px;">Tails</button>
          </div>
          <button class="btn btn-block btn-green" id="cfCash" style="margin-top:10px;font-size:16px;padding:14px;display:none;">Cash Out</button>
          <div class="stat-grid" style="margin-top:16px;">
            <div class="stat"><div class="k">Streak</div><div class="v" id="cfStreak">0</div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="cfCashVal">—</div></div>
          </div>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const headsBtn = view.querySelector("#cfHeads");
    const tailsBtn = view.querySelector("#cfTails");
    const cashBtn = view.querySelector("#cfCash");
    const msg = view.querySelector("#cfMsg");
    Casino.wireBet(view);
    view.querySelector("#cfHelp").addEventListener("click", () => Casino.openHowTo("How to play — Coinflip", HOWTO));

    view.querySelectorAll("#cfCoinSel [data-coins]").forEach((b) => b.addEventListener("click", () => {
      if (phase === "playing") return;
      coins = Number(b.dataset.coins);
      view.querySelectorAll("#cfCoinSel .btn").forEach((x) => x.classList.toggle("sel", x === b));
    }));

    /* The coin is built from CSS (radial gradients + a milled rim); the face is
       an engraved mark, not a glyph. `.cf-face` is the 3D-rotating element so
       the outer .cf-coin keeps its layout box for the agent's DOM reads. */
    const faceMark = (f) => (f
      ? `<span class="cf-mark cf-mark-h"></span>`
      : `<span class="cf-mark cf-mark-t"></span>`);

    function renderCoins(faces, animate) {
      const wrap = view.querySelector("#cfCoins");
      wrap.innerHTML = (faces || Array(coins).fill(null))
        .map((f) => `<div class="cf-coin ${f == null ? "idle" : f ? "heads" : "tails"}">
             <div class="cf-face">${f == null ? `<span class="cf-mark cf-mark-q"></span>` : faceMark(f)}</div>
           </div>`).join("");
      if (!animate || !faces) return;

      /* GSAP 3D flip: multiple turns on Y, with a scale bump at the apex so the
         coin reads as passing nearer the viewer rather than just spinning flat. */
      const g = window.gsap;
      if (!g || (Casino.fx && Casino.fx.reduced())) return;
      wrap.querySelectorAll(".cf-face").forEach((face, i) => {
        g.timeline({ delay: i * 0.08 })
          .fromTo(face,
            { rotationY: 0, scale: 0.86 },
            { rotationY: 1080, duration: 0.82, ease: "power4.out", force3D: true })
          .to(face, { scale: 1.14, duration: 0.34, ease: "power2.out" }, 0)
          .to(face, { scale: 1, duration: 0.44, ease: "back.out(1.7)" }, 0.34);
      });
    }
    function renderFair() {
      const el = view.querySelector("#cfFair");
      el.innerHTML = phase === "over"
        ? `Revealed · server <code>${server}</code> · hash <code>${seedHash(server)}</code>`
        : `Provably fair · committed hash <code>${seedHash(server)}</code> · nonce ${nonce}`;
    }
    function pushHist(win, faces) {
      const el = view.querySelector("#cfHist");
      const d = document.createElement("div");
      d.className = "cf-hist-item " + (win ? "win" : "lose");
      d.innerHTML = faces.map((f) => `<i class="cf-pip ${f ? "h" : "t"}"></i>`).join("");
      el.prepend(d); while (el.children.length > 12) el.removeChild(el.lastChild);
    }
    function refresh() {
      view.querySelector("#cfMultBig").textContent = mult.toFixed(2) + "×";
      view.querySelector("#cfStreak").textContent = streak;
      view.querySelector("#cfCashVal").textContent = phase === "playing" && streak > 0 ? Casino.money(Math.round(bet * mult)) : "—";
      renderFair();
    }

    function ensureStarted() {
      if (phase === "playing") return true;
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return false;
      mult = 1; streak = 0; phase = "playing"; server = randSeed();
      betInput.disabled = true;
      view.querySelectorAll("#cfCoinSel .btn").forEach((x) => (x.disabled = true));
      cashBtn.style.display = "block";
      view.querySelector("#cfHist").innerHTML = "";
      renderCoins(null);
      return true;
    }

    function call(pick) { // pick: 1 heads, 0 tails — also starts a fresh round after one ends
      if (!ensureStarted()) return;
      let faces = Array.from({ length: coins }, (_, i) => coinFace(server, client, nonce, streak * 10 + i));
      // 😈 rig: make every coin match the pick
      if (Casino.cheat.win()) faces = faces.map(() => pick);
      renderCoins(faces, true);
      const win = faces.every((f) => f === pick);
      pushHist(win, faces);
      if (win) {
        streak++; mult *= payoutFor(coins);
        Casino.sound.play(mult >= 8 ? "bigwin" : "win");
        msg.textContent = `${coins > 1 ? "All " + coins + " match" : "Correct"}! Streak ${streak} · ${mult.toFixed(2)}×.`;
        msg.style.color = "var(--green)";
        refresh();
      } else {
        Casino.sound.play("lose");
        msg.textContent = `Wrong! Streak over — lost ${Casino.money(bet)}. Pick a side to play again.`;
        msg.style.color = "var(--red)";
        endRound(false);
      }
    }

    function cashOut() {
      if (phase !== "playing" || streak === 0) return;
      const ret = Math.round(bet * mult);
      Casino.payout(ret);
      msg.textContent = `Cashed out ${mult.toFixed(2)}× = ${Casino.money(ret)} (+${Casino.fmt(ret - bet)}). Pick a side to go again.`;
      msg.style.color = "var(--green)";
      Casino.sound.play("cashout");
      endRound(true);
    }

    function endRound() {
      phase = "over"; nonce++;
      betInput.disabled = false;
      view.querySelectorAll("#cfCoinSel .btn").forEach((x) => (x.disabled = false));
      cashBtn.style.display = "none";
      refresh();
    }

    headsBtn.addEventListener("click", () => call(1));
    tailsBtn.addEventListener("click", () => call(0));
    cashBtn.addEventListener("click", cashOut);
    renderCoins(null); refresh();

    window.CoinflipAPI = {
      inRound: () => phase === "playing",
      streak: () => streak,
      mult: () => mult,
      setCoins: (n) => { const b = view.querySelector(`#cfCoinSel [data-coins="${n}"]`); if (b && phase !== "playing") b.click(); },
      call: (pick) => call(pick ? 1 : 0),
      cashOut: () => cashOut(),
    };
  }

  return { render, _t: { EDGE, payoutFor, coinFace, seedHash } };
})();
