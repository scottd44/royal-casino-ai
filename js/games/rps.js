/* ============================================================
   Rock Paper Scissors — streak builder
   ------------------------------------------------------------
   Beat the house to compound your stake ~1.96× per win. Ties are
   neutral (replay, streak unchanged). A loss forfeits the streak.
   Cash out any time after your first win. The house's move is
   locked by a committed server-seed hash before you throw.
   ============================================================ */
const RPSGame = (() => {
  const EDGE = 0.02; // per decisive round → RTP 0.98
  const WIN = 2 * (1 - EDGE); // 1.96×
  const MOVES = ["Rock", "Paper", "Scissors"];
  /* Marks come from the shared raw-SVG registry in core.js — one definition
     feeds the buttons, the throw plates, the streak strip, the sidebar and the
     page title, so they can never drift apart again. */
  const SVG = {
    0: Casino.icon("rc:rock", "rps-svg"),
    1: Casino.icon("rc:paper", "rps-svg"),
    2: Casino.icon("rc:scissors", "rps-svg"),
  };
  const NAME_OF = ["Rock", "Paper", "Scissors"];

  function xmur3(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; }; }
  const seedHash = (s) => xmur3(s)().toString(16).padStart(8, "0");
  const randSeed = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const houseMove = (server, client, nonce) => xmur3(`${server}:${client}:${nonce}`)() % 3;
  // outcome of player p vs house h: 1 win, 0 tie, -1 loss
  const outcome = (p, h) => (p === h ? 0 : (p - h + 3) % 3 === 1 ? 1 : -1);

  const HOWTO = `
    <h4>Goal</h4>
    <p>Throw <b>Rock</b>, <b>Paper</b>, or <b>Scissors</b> against the house. Rock beats Scissors, Paper beats Rock,
    Scissors beats Paper. Each win compounds your stake by <b>${WIN}×</b>; cash out or keep your streak going.</p>
    <h4>Ties &amp; losses</h4>
    <ul>
      <li><b>Tie</b> — neutral. The round replays and your streak/multiplier are unchanged.</li>
      <li><b>Loss</b> — the streak is forfeit and you lose the bet.</li>
    </ul>
    <h4>Compounding</h4>
    <table>
      <tr><td>1 win</td><td>${WIN.toFixed(2)}×</td></tr>
      <tr><td>3 wins</td><td>${Math.pow(WIN, 3).toFixed(2)}×</td></tr>
      <tr><td>5 wins</td><td>${Math.pow(WIN, 5).toFixed(1)}×</td></tr>
      <tr><td>10 wins</td><td>${Math.round(Math.pow(WIN, 10))}×</td></tr>
    </table>
    <h4>Provably fair</h4>
    <p>The house move is fixed by a committed <b>seed hash</b> shown before you throw, revealed after the round so
    you can verify it wasn't changed to beat you. Each decisive round returns a fair <b>98%</b>.</p>`;

  function render(view) {
    let bet = 0, mult = 1, streak = 0, phase = "idle"; // idle · playing · over
    let server = randSeed(), client = randSeed(), nonce = 1;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("rc:rock", "ico-title")} Rock Paper Scissors</h2>
        <p class="page-sub">Beat the house to compound your stake ${WIN}× per win. Ties replay for free, a loss ends the streak. Cash out whenever you like.</p>
        ${Casino.helpBtnHTML("rpsHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="rps-stage">
            <div class="rps-hands">
              <div class="rps-seat"><div class="rps-label">You</div><div class="rps-throw" id="rpsYou">–</div></div>
              <div class="rps-vs">VS</div>
              <div class="rps-seat"><div class="rps-label">House</div><div class="rps-throw" id="rpsHouse">–</div></div>
            </div>
            <div class="cf-mult" id="rpsMultBig">1.00×</div>
            <div class="bj-result" id="rpsMsg">Set a bet and throw.</div>
          </div>
          <div class="divider"></div>
          <div class="history"><h4>Streak track</h4><div class="history-list rps-track" id="rpsTrack"></div></div>
          <div class="bs-fair" id="rpsFair"></div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="field" style="margin-top:14px;">
            <label>Throw</label>
            <div class="rps-btns">
              <button class="btn btn-blue rps-move" data-move="0" style="padding:14px;flex-direction:column;gap:6px;">${SVG[0]}<span class="rps-btn-label">Rock</span></button>
              <button class="btn btn-blue rps-move" data-move="1" style="padding:14px;flex-direction:column;gap:6px;">${SVG[1]}<span class="rps-btn-label">Paper</span></button>
              <button class="btn btn-blue rps-move" data-move="2" style="padding:14px;flex-direction:column;gap:6px;">${SVG[2]}<span class="rps-btn-label">Scissors</span></button>
            </div>
          </div>
          <button class="btn btn-block btn-green" id="rpsCash" style="margin-top:12px;font-size:16px;padding:14px;display:none;">Cash Out</button>
          <div class="stat-grid" style="margin-top:16px;">
            <div class="stat"><div class="k">Streak</div><div class="v" id="rpsStreak">0</div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="rpsCashVal">—</div></div>
          </div>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const cashBtn = view.querySelector("#rpsCash");
    const msg = view.querySelector("#rpsMsg");
    Casino.wireBet(view);
    view.querySelector("#rpsHelp").addEventListener("click", () => Casino.openHowTo("How to play — Rock Paper Scissors", HOWTO));

    function renderFair() {
      view.querySelector("#rpsFair").innerHTML = phase === "over"
        ? `Revealed · server <code>${server}</code> · hash <code>${seedHash(server)}</code>`
        : `Provably fair · committed hash <code>${seedHash(server)}</code> · nonce ${nonce}`;
    }
    function pushTrack(res, p, h) {
      const el = view.querySelector("#rpsTrack");
      const d = document.createElement("div");
      d.className = "rps-track-item " + (res > 0 ? "win" : res < 0 ? "lose" : "tie");
      d.innerHTML = `<span class="rps-mini">${SVG[p]}</span><span class="rps-vs-mini">${res > 0 ? "&rsaquo;" : res < 0 ? "&lsaquo;" : "="}</span><span class="rps-mini">${SVG[h]}</span>`;
      el.prepend(d); while (el.children.length > 12) el.removeChild(el.lastChild);
    }
    function refresh() {
      view.querySelector("#rpsMultBig").textContent = mult.toFixed(2) + "×";
      view.querySelector("#rpsStreak").textContent = streak;
      view.querySelector("#rpsCashVal").textContent = phase === "playing" && streak > 0 ? Casino.money(Math.round(bet * mult)) : "—";
      renderFair();
    }

    function ensureStarted() {
      if (phase === "playing") return true;
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return false;
      mult = 1; streak = 0; phase = "playing"; server = randSeed();
      betInput.disabled = true; cashBtn.style.display = "block";
      view.querySelector("#rpsTrack").innerHTML = "";
      return true;
    }

    /* Both plates flip on Y like turning cards, house trailing slightly so the
       result reads as a reveal rather than a simultaneous swap. */
    function revealThrows(youEl, houseEl) {
      const g = window.gsap;
      if (!g || (Casino.fx && Casino.fx.reduced())) return;
      [youEl, houseEl].forEach((el, i) => {
        g.fromTo(el,
          { rotationY: -180, scale: 0.8, opacity: 0 },
          { rotationY: 0, scale: 1, opacity: 1, duration: 0.52, delay: i * 0.12,
            ease: "back.out(1.7)", force3D: true, clearProps: "transform,opacity" });
      });
    }

    function throwMove(p) { // also starts a fresh round after one ends
      if (!ensureStarted()) return;
      let h = houseMove(server, client, nonce);
      // 😈 rig: house throws the move your pick beats
      if (Casino.cheat.win()) h = (p + 2) % 3;
      const youEl = view.querySelector("#rpsYou"), houseEl = view.querySelector("#rpsHouse");
      youEl.innerHTML = SVG[p]; houseEl.innerHTML = SVG[h];
      revealThrows(youEl, houseEl);
      const res = outcome(p, h);
      pushTrack(res, p, h);
      if (res === 0) { // tie → neutral replay
        nonce++;
        msg.textContent = `Tie on ${MOVES[p]} — throw again (streak safe).`; msg.style.color = "var(--gold-2)";
        Casino.sound.play("tick"); renderFair();
      } else if (res > 0) {
        streak++; mult *= WIN; nonce++;
        msg.textContent = `You win! ${NAME_OF[p]} beats ${NAME_OF[h]} · streak ${streak} · ${mult.toFixed(2)}×.`; msg.style.color = "var(--green)";
        Casino.sound.play(mult >= 8 ? "bigwin" : "win"); refresh();
      } else {
        msg.textContent = `House wins with ${NAME_OF[h]}. Streak over — lost ${Casino.money(bet)}. Throw again to play.`; msg.style.color = "var(--red)";
        Casino.sound.play("lose"); endRound();
      }
    }

    function cashOut() {
      if (phase !== "playing" || streak === 0) return;
      const ret = Math.round(bet * mult);
      Casino.payout(ret);
      msg.textContent = `Cashed out ${mult.toFixed(2)}× = ${Casino.money(ret)} (+${Casino.fmt(ret - bet)}). Throw again to play.`; msg.style.color = "var(--green)";
      Casino.sound.play("cashout"); endRound();
    }

    function endRound() {
      phase = "over"; nonce++;
      betInput.disabled = false; cashBtn.style.display = "none";
      refresh();
    }

    view.querySelectorAll(".rps-move").forEach((b) => b.addEventListener("click", () => throwMove(+b.dataset.move)));
    cashBtn.addEventListener("click", cashOut);
    refresh();

    window.RPSAPI = {
      inRound: () => phase === "playing",
      streak: () => streak,
      mult: () => mult,
      throw: (m) => throwMove(m),
      cashOut: () => cashOut(),
    };
  }

  return { render, _t: { EDGE, WIN, outcome, houseMove, seedHash } };
})();
