/* ============================================================
   Keno — instant lottery (pick 1–10, draw 10 of 40)
   ------------------------------------------------------------
   Choose up to 10 numbers on a 40-tile board and a risk level.
   Ten tiles are drawn; you're paid on how many you matched.
   Paytables are generated from the exact hypergeometric odds and
   calibrated so every pick-count / risk combo returns 0.97 (3%
   edge). Higher risk pays only for near-perfect tickets but with
   jackpots up to 10,000×.
   ============================================================ */
const KenoGame = (() => {
  const T = 40, DRAW = 10, MAX_PICK = 10;
  const TARGET = 0.97, CAP = 10000;
  const RISKS = [
    { key: "low", label: "Low", tf: 0.30, growth: 2.6 },
    { key: "classic", label: "Classic", tf: 0.40, growth: 5 },
    { key: "medium", label: "Medium", tf: 0.50, growth: 9 },
    { key: "high", label: "High", tf: 0.62, growth: 24 },
  ];

  function comb(n, k) { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
  const hyp = (m, P) => comb(P, m) * comb(T - P, DRAW - m) / comb(T, DRAW); // P(match exactly m of P picks)

  const _cache = {};
  function paytable(P, riskKey) {
    const ck = P + ":" + riskKey; if (_cache[ck]) return _cache[ck];
    const R = RISKS.find((r) => r.key === riskKey);
    const tMin = Math.min(P, Math.max(1, Math.round(P * R.tf)));
    const pay = new Array(P + 1).fill(0), capped = new Array(P + 1).fill(false);
    for (let iter = 0; iter < P + 2; iter++) {
      let budget = TARGET, denom = 0;
      for (let m = tMin; m <= P; m++) { if (capped[m]) budget -= hyp(m, P) * CAP; else denom += hyp(m, P) * Math.pow(R.growth, m - tMin); }
      if (denom <= 0) break;
      const base = budget / denom; let newCap = false;
      for (let m = tMin; m <= P; m++) { if (capped[m]) continue; const raw = base * Math.pow(R.growth, m - tMin); if (raw > CAP) { capped[m] = true; pay[m] = CAP; newCap = true; } else pay[m] = raw; }
      if (!newCap) break;
    }
    return (_cache[ck] = pay);
  }
  const round2 = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 100) / 100);

  const HOWTO = `
    <h4>Goal</h4>
    <p>Pick between <b>1 and ${MAX_PICK} numbers</b> on the ${T}-tile board. Ten tiles are then drawn at random and
    you're paid based on <b>how many of your picks were drawn</b>.</p>
    <h4>Risk levels</h4>
    <p>The risk toggle reshapes the paytable — all four return the same fair <b>97%</b>, but spread differently:</p>
    <ul>
      <li><b>Low</b> — pays for even a few matches; small, frequent wins.</li>
      <li><b>Classic / Medium</b> — a balance of hit rate and payout.</li>
      <li><b>High</b> — pays only for near-perfect tickets, but with huge jackpots (up to ${CAP.toLocaleString()}×).</li>
    </ul>
    <h4>Tips</h4>
    <p>Pick more numbers for a shot at bigger multipliers (matching 10/10 is a lottery-sized long shot). Use
    <b>Quick Pick</b> for a random ticket. The live paytable shows exactly what each match count pays.</p>`;

  function render(view) {
    let bet = 0, picks = new Set(), risk = "classic", drawn = [], phase = "idle"; // idle · over

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🔢 Keno</h2>
        <p class="page-sub">Pick up to ${MAX_PICK} numbers, choose your risk, and watch 10 tiles get drawn. Match your numbers for payouts up to ${CAP.toLocaleString()}×.</p>
        ${Casino.helpBtnHTML("knHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="kn-board" id="knBoard"></div>
          <div class="bj-result" id="knMsg" style="margin-top:14px;">Pick your numbers and play.</div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(20)}
          <div class="bet-row" style="margin-top:10px;">
            <button class="btn btn-ghost" id="knRandom">🎲 Quick Pick</button>
            <button class="btn btn-ghost" id="knClear">Clear</button>
          </div>
          <div class="field" style="margin-top:12px;">
            <label>Risk</label>
            <div class="bet-row kn-risk" id="knRisk">
              ${RISKS.map((r) => `<button class="btn btn-ghost ${r.key==="classic"?"sel":""}" data-risk="${r.key}">${r.label}</button>`).join("")}
            </div>
          </div>
          <div class="stat-grid" style="margin-top:12px;">
            <div class="stat"><div class="k">Picks</div><div class="v" id="knPicks">0 / ${MAX_PICK}</div></div>
            <div class="stat"><div class="k">Hits</div><div class="v" id="knHits">—</div></div>
          </div>
          <button class="btn btn-block btn-green" id="knPlay" style="margin-top:14px;font-size:16px;padding:14px;">Play</button>
          <div class="kn-paytable" id="knPay"></div>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const boardEl = view.querySelector("#knBoard");
    const playBtn = view.querySelector("#knPlay");
    const msg = view.querySelector("#knMsg");
    Casino.wireBet(view);
    view.querySelector("#knHelp").addEventListener("click", () => Casino.openHowTo("How to play — Keno", HOWTO));

    function buildBoard() {
      boardEl.innerHTML = Array.from({ length: T }, (_, i) => `<button class="kn-tile" data-n="${i + 1}">${i + 1}</button>`).join("");
      boardEl.querySelectorAll(".kn-tile").forEach((t) => t.addEventListener("click", () => toggle(+t.dataset.n)));
    }
    buildBoard();
    const tileEl = (n) => boardEl.querySelector(`.kn-tile[data-n="${n}"]`);

    function renderPaytable() {
      const P = picks.size, el = view.querySelector("#knPay");
      if (P === 0) { el.innerHTML = `<div class="kn-pay-hint">Pick numbers to see the paytable.</div>`; return; }
      const pay = paytable(P, risk);
      let rows = "";
      for (let m = P; m >= 0; m--) if (pay[m] > 0) rows += `<tr><td>${m} / ${P} hit</td><td>${round2(pay[m])}×</td></tr>`;
      el.innerHTML = `<div class="kn-pay-title">Payout · ${P} pick${P>1?"s":""} · ${RISKS.find(r=>r.key===risk).label}</div><table>${rows}</table>`;
    }
    function updateInfo() {
      view.querySelector("#knPicks").textContent = `${picks.size} / ${MAX_PICK}`;
      view.querySelector("#knHits").textContent = phase === "over" ? `${drawn.filter((n) => picks.has(n)).length} / ${picks.size}` : "—";
      renderPaytable();
    }

    function toggle(n) {
      if (phase === "over") resetBoard();
      const t = tileEl(n);
      if (picks.has(n)) { picks.delete(n); t.classList.remove("picked"); }
      else { if (picks.size >= MAX_PICK) { Casino.toast(`Max ${MAX_PICK} picks.`, "info"); return; } picks.add(n); t.classList.add("picked"); Casino.sound.play("tick"); }
      updateInfo();
    }
    function resetBoard() {
      phase = "idle"; drawn = [];
      boardEl.querySelectorAll(".kn-tile").forEach((t) => { t.className = "kn-tile"; if (picks.has(+t.dataset.n)) t.classList.add("picked"); });
      msg.textContent = "Pick your numbers and play."; msg.style.color = "";
    }

    function play() {
      if (phase === "over") resetBoard();
      if (picks.size === 0) { Casino.toast("Pick at least one number.", "info"); return; }
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      // draw 10 distinct tiles
      const pool = Array.from({ length: T }, (_, i) => i + 1);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      drawn = pool.slice(0, DRAW);
      // 😈 rig: force the draw to include all of the player's picks
      if (Casino.cheat.win()) {
        const pk = [...picks];
        const rest = pool.filter((n) => !picks.has(n));
        drawn = pk.concat(rest).slice(0, DRAW);
      }
      phase = "over";
      const pk = new Set(picks);
      boardEl.querySelectorAll(".kn-tile").forEach((t) => {
        const n = +t.dataset.n; t.className = "kn-tile";
        const isDrawn = drawn.includes(n), isPick = pk.has(n);
        if (isDrawn && isPick) t.classList.add("hit");
        else if (isPick) t.classList.add("picked", "miss");
        else if (isDrawn) t.classList.add("drawn");
      });
      const matches = drawn.filter((n) => pk.has(n)).length;
      const pay = paytable(picks.size, risk)[matches] || 0;
      const ret = Math.round(bet * pay);
      if (ret > 0) Casino.payout(ret);
      const net = ret - bet;
      msg.textContent = `${matches}/${picks.size} hit · ${round2(pay)}× · ${net >= 0 ? "+" + Casino.fmt(net) : "-" + Casino.fmt(-net)}`;
      msg.style.color = net > 0 ? "var(--green)" : "var(--red)";
      Casino.sound.play(net > 0 ? (pay >= 10 ? "bigwin" : "win") : "lose");
      updateInfo();
    }

    view.querySelector("#knRandom").addEventListener("click", () => {
      resetBoard(); picks.clear();
      const pool = Array.from({ length: T }, (_, i) => i + 1);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const count = picks.size || 8;
      pool.slice(0, count).forEach((n) => picks.add(n));
      boardEl.querySelectorAll(".kn-tile").forEach((t) => t.classList.toggle("picked", picks.has(+t.dataset.n)));
      Casino.sound.play("tick"); updateInfo();
    });
    view.querySelector("#knClear").addEventListener("click", () => { resetBoard(); picks.clear(); boardEl.querySelectorAll(".kn-tile").forEach((t) => (t.className = "kn-tile")); updateInfo(); });
    view.querySelectorAll("#knRisk .btn").forEach((b) => b.addEventListener("click", () => {
      risk = b.dataset.risk; view.querySelectorAll("#knRisk .btn").forEach((x) => x.classList.toggle("sel", x === b)); updateInfo();
    }));
    playBtn.addEventListener("click", play);
    updateInfo();

    window.KenoAPI = {
      quickPick: () => view.querySelector("#knRandom").click(),
      setRisk: (r) => { const b = view.querySelector(`#knRisk [data-risk="${r}"]`); if (b) b.click(); },
      pickCount: () => picks.size,
      play: () => play(),
    };
  }

  return { render, _t: { T, DRAW, comb, hyp, paytable } };
})();
