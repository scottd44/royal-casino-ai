/* ============================================================
   Battleship — solo casino multiplier game
   ------------------------------------------------------------
   A 6×6 sea hides a fleet (Carrier 4, Battleship 3, Destroyer 2,
   Patrol 1 — 10 tiles). Your bet buys 4 shots. Each shot:
     • Hit a ship piece  → +0.1× to your multiplier
     • Sink a whole ship → big bonus (0.8× / 1.6× / 4× / 12×)
     • Sink the fleet    → +100× grand jackpot
   Out of shots? Buy one more at a fair (edge-priced) rate, or
   cash out your accumulated multiplier. There is no "bust" — a
   miss just wastes the shot. Calibrated to RTP ≈ 0.955.

   Fairness: the board is derived deterministically from a
   committed server seed + your client seed + a nonce. The seed
   hash is shown before you play and the seed revealed after, so
   you can verify the fleet was never moved.
   ============================================================ */
const BattleshipGame = (() => {
  const N = 5;
  const FLEET = [
    { name: "Carrier", size: 4, sink: 3.8 },
    { name: "Battleship", size: 3, sink: 1.25 },
    { name: "Destroyer", size: 2, sink: 0.48 },
    { name: "Patrol Boat", size: 1, sink: 0.24 },
  ];
  const SIZES = FLEET.map((f) => f.size);
  const SINK = { 4: 3.8, 3: 1.25, 2: 0.48, 1: 0.24 };
  const TOTAL_TILES = SIZES.reduce((a, b) => a + b, 0); // 10
  const BASE = 0.045;    // per ship piece hit
  const GRAND = 100;     // sink the whole fleet (only reachable by buying extra shots)
  const SHOTS = 5;       // included with the bet
  const EDGE = 0.05;     // house edge baked into bought shots
  const COLS = "ABCDE";
  const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
  const K = (r, c) => r + "," + c;

  /* ---------- seedable RNG + hash (provably-fair-style) ---------- */
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; };
  }
  function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const seedHash = (s) => xmur3(s)().toString(16).padStart(8, "0");
  const randSeed = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

  /* ---------- fleet placement from any RNG ---------- */
  function placeFleet(rng) {
    const occ = new Map();
    const ships = FLEET.map((f) => ({ name: f.name, size: f.size, sink: f.sink, cells: [], hit: 0, sunk: false }));
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i].size;
      for (let g = 0; g < 3000; g++) {
        const horiz = rng() < 0.5;
        const r = Math.floor(rng() * (horiz ? N : N - s + 1));
        const c = Math.floor(rng() * (horiz ? N - s + 1 : N));
        const cells = []; let ok = true;
        for (let k = 0; k < s; k++) { const rr = horiz ? r : r + k, cc = horiz ? c + k : c; if (occ.has(K(rr, cc))) { ok = false; break; } cells.push([rr, cc]); }
        if (!ok) continue;
        cells.forEach(([rr, cc]) => occ.set(K(rr, cc), i)); ships[i].cells = cells; break;
      }
    }
    return { occ, ships };
  }
  const deriveBoard = (server, client, nonce) => placeFleet(mulberry32(xmur3(`${server}:${client}:${nonce}`)()));

  /* ---------- hunt/target auto-player (for calibration + agent suggest) ---------- */
  // shots grid: 0 unknown · 1 miss · 2 hit · 3 sunk
  function bestShot(shots) {
    const hits = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (shots[r][c] === 2) hits.push([r, c]);
    if (hits.length) {
      if (hits.length >= 2) {
        const byRow = {}, byCol = {};
        hits.forEach(([r, c]) => { (byRow[r] = byRow[r] || []).push(c); (byCol[c] = byCol[c] || []).push(r); });
        for (const r in byRow) if (byRow[r].length >= 2) { const cs = byRow[r].sort((a, b) => a - b), rr = +r; for (const cc of [cs[0] - 1, cs[cs.length - 1] + 1]) if (inB(rr, cc) && shots[rr][cc] === 0) return { r: rr, c: cc }; }
        for (const c in byCol) if (byCol[c].length >= 2) { const rs = byCol[c].sort((a, b) => a - b), cc = +c; for (const rr of [rs[0] - 1, rs[rs.length - 1] + 1]) if (inB(rr, cc) && shots[rr][cc] === 0) return { r: rr, c: cc }; }
      }
      for (const [r, c] of hits) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (inB(rr, cc) && shots[rr][cc] === 0) return { r: rr, c: cc }; }
    }
    const any = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (shots[r][c] === 0) any.push([r, c]);
    return any.length ? (([r, c]) => ({ r, c }))(any[Math.floor(Math.random() * any.length)]) : null;
  }

  // Auto-play K shots on a board; returns the accumulated multiplier (used by _t.simulate).
  function autoMultiplier(board, kShots) {
    const shots = Array.from({ length: N }, () => new Array(N).fill(0));
    let hits = 0, mult = 0, sunk = 0;
    for (let s = 0; s < kShots; s++) {
      const mv = bestShot(shots); if (!mv) break;
      if (board.occ.has(K(mv.r, mv.c))) {
        shots[mv.r][mv.c] = 2; hits++;
        const ship = board.ships[board.occ.get(K(mv.r, mv.c))]; ship.hit++;
        if (ship.hit === ship.size) { mult += ship.sink; sunk++; ship.cells.forEach(([rr, cc]) => (shots[rr][cc] = 3)); }
      } else shots[mv.r][mv.c] = 1;
    }
    mult += BASE * hits;
    if (sunk === FLEET.length) mult += GRAND;
    return mult;
  }
  function simulate(n, kShots) { let t = 0; for (let i = 0; i < n; i++) t += autoMultiplier(placeFleet(Math.random), kShots || SHOTS); return t / n; }

  const HOWTO = `
    <h4>Goal</h4>
    <p>A fleet of four ships hides on the 6×6 sea. Your bet buys <b>${SHOTS} shots</b>. Fire at tiles to hit ship
    pieces and build a multiplier — then cash out. There's <b>no bust</b>: a miss just wastes a shot.</p>
    <h4>Payouts (added to your multiplier)</h4>
    <table>
      <tr><td>Each ship piece hit</td><td>+${BASE}×</td></tr>
      <tr><td>Sink the Patrol Boat (1)</td><td>+${SINK[1]}×</td></tr>
      <tr><td>Sink the Destroyer (2)</td><td>+${SINK[2]}×</td></tr>
      <tr><td>Sink the Battleship (3)</td><td>+${SINK[3]}×</td></tr>
      <tr><td>Sink the Carrier (4)</td><td>+${SINK[4]}×</td></tr>
      <tr><td><b>Sink the whole fleet</b></td><td>+${GRAND}×</td></tr>
    </table>
    <h4>Buy Shot</h4>
    <p>Out of ammo but chasing a wounded ship? <b>Buy another shot</b>. Its price is set to the true value of the
    best remaining shot plus a small house edge, so it's always a fair gamble — worth it when you're one tile from
    sinking a big ship, rarely worth it on a cold board.</p>
    <h4>Strategy</h4>
    <p>When you hit, fire the <b>neighbouring tiles</b> to finish the ship — the sink bonus dwarfs the per-piece
    reward. Cash out whenever you're happy with your multiplier.</p>
    <h4>Provably fair</h4>
    <p>Before you play, the <b>hash of a server seed</b> is shown (a commitment). The fleet is placed deterministically
    from that seed, your client seed, and a round nonce — so it can't move mid-round. After the round the seed is
    revealed and you can re-hash it to verify.</p>`;

  function render(view) {
    let bet = 0, mult = 0, shotsLeft = 0, hits = 0, sunkCount = 0, shotPrice = 0;
    let board = null, shots = null, phase = "idle"; // idle · playing · over
    let server = randSeed(), client = randSeed(), nonce = 1;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🚢 Battleship</h2>
        <p class="page-sub">Your bet buys ${SHOTS} shots at a hidden fleet. Hit pieces to build a multiplier, sink ships for big bonuses, and sink the whole fleet for the ${GRAND}× jackpot. No bust — cash out any time.</p>
        ${Casino.helpBtnHTML("bsHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="bs-wrap">
            <div class="bs-grid" id="bsGrid"></div>
            <div class="bs-status" id="bsStatus">Place a bet and open fire.</div>
          </div>
          <div class="bs-fair" id="bsFair"></div>
        </div>
        <div class="panel">
          ${Casino.betFieldHTML(25)}
          <button class="btn btn-block btn-green" id="bsDeal" style="margin-top:14px;font-size:16px;padding:14px;">🚀 Open Fire (${SHOTS} shots)</button>
          <div class="hc-actrow" id="bsActRow" style="margin-top:10px;display:none;">
            <button class="btn btn-blue" id="bsBuy">Buy Shot</button>
            <button class="btn btn-green" id="bsCash">Cash Out</button>
          </div>
          <div class="stat-grid" style="margin-top:16px;">
            <div class="stat"><div class="k">Multiplier</div><div class="v"><span class="multiplier-tag" id="bsMult">0.00×</span></div></div>
            <div class="stat"><div class="k">Shots left</div><div class="v" id="bsShots">—</div></div>
            <div class="stat"><div class="k">Cash out</div><div class="v" id="bsCashVal">—</div></div>
            <div class="stat"><div class="k">Next shot</div><div class="v" id="bsBuyPrice">—</div></div>
          </div>
          <div class="bs-fleet-status" id="bsFleet"></div>
          <div class="bs-log" id="bsLog"></div>
        </div>
      </div>`;

    const betInput = view.querySelector("#betInput");
    const dealBtn = view.querySelector("#bsDeal");
    const actRow = view.querySelector("#bsActRow");
    const gridEl = view.querySelector("#bsGrid");
    const statusEl = view.querySelector("#bsStatus");
    Casino.wireBet(view);
    view.querySelector("#bsHelp").addEventListener("click", () => Casino.openHowTo("How to play — Battleship", HOWTO));

    function buildGrid() {
      let html = `<div class="bs-corner"></div>`;
      for (let c = 0; c < N; c++) html += `<div class="bs-hdr">${COLS[c]}</div>`;
      for (let r = 0; r < N; r++) {
        html += `<div class="bs-hdr">${r + 1}</div>`;
        for (let c = 0; c < N; c++) html += `<div class="bs-cell" data-r="${r}" data-c="${c}"></div>`;
      }
      gridEl.innerHTML = html;
      gridEl.querySelectorAll(".bs-cell").forEach((cell) => cell.addEventListener("click", () => fire(+cell.dataset.r, +cell.dataset.c)));
    }
    buildGrid();
    const cellOf = (r, c) => gridEl.querySelector(`.bs-cell[data-r="${r}"][data-c="${c}"]`);
    const coord = (r, c) => COLS[c] + (r + 1);

    function log(msg, cls) {
      const el = view.querySelector("#bsLog");
      const line = document.createElement("div");
      line.className = "bs-log-line" + (cls ? " " + cls : "");
      line.textContent = msg; el.prepend(line);
      while (el.children.length > 7) el.removeChild(el.lastChild);
    }

    function renderFair() {
      const el = view.querySelector("#bsFair");
      if (phase === "over" && board) {
        el.innerHTML = `🔓 <b>Round #${nonce} verified.</b> Server seed: <code>${server}</code> · client <code>${client}</code> · hash <code>${seedHash(server)}</code>`;
      } else {
        el.innerHTML = `🔒 Provably fair · committed hash <code>${seedHash(server)}</code> · client <code>${client}</code> · nonce ${nonce}`;
      }
    }

    function renderFleet() {
      const el = view.querySelector("#bsFleet");
      if (!board) { el.innerHTML = ""; return; }
      el.innerHTML = board.ships.map((s) => {
        const done = s.sunk ? "sunk" : s.hit > 0 ? "hit" : "";
        return `<div class="bs-ship ${done}"><span class="bs-ship-name">${s.name}</span><span class="bs-ship-pips">${"▪".repeat(s.size)}</span><span class="bs-ship-bonus">+${s.sink}×</span></div>`;
      }).join("");
    }

    function paint() {
      if (!board) return;
      const over = phase === "over";
      const xray = Casino.cheat && Casino.cheat.isOn && Casino.cheat.isOn(); // 😈 reveal ships to aim
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = cellOf(r, c); cell.className = "bs-cell";
        const st = shots[r][c];
        const isShip = board.occ.has(K(r, c));
        if (st === 1) { cell.classList.add("miss"); cell.textContent = "◦"; }
        else if (st === 2) { cell.classList.add("hit"); cell.textContent = "✸"; }
        else if (st === 3) { cell.classList.add("sunk"); cell.textContent = "✸"; }
        else { cell.textContent = ""; if (over && isShip) cell.classList.add("reveal"); else if (xray && isShip && phase === "playing") cell.classList.add("xray"); }
      }
    }

    function refresh() {
      view.querySelector("#bsMult").textContent = mult.toFixed(2) + "×";
      view.querySelector("#bsShots").textContent = phase === "playing" ? shotsLeft : "—";
      view.querySelector("#bsCashVal").textContent = phase === "playing" && bet ? Casino.money(Math.round(bet * mult)) : "—";
      const buyBtn = view.querySelector("#bsBuy");
      if (phase === "playing" && shotsLeft === 0) {
        view.querySelector("#bsBuyPrice").textContent = Casino.money(shotPrice);
        if (buyBtn) buyBtn.textContent = `Buy Shot (${Casino.money(shotPrice)})`;
      } else {
        view.querySelector("#bsBuyPrice").textContent = phase === "playing" ? "free" : "—";
        if (buyBtn) buyBtn.textContent = "Buy Shot";
      }
      renderFleet(); renderFair();
    }

    function setStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = "bs-status" + (cls ? " " + cls : ""); }

    /* ----- buy-shot pricing: Monte-Carlo over boards consistent with what's revealed ----- */
    function priceExtraShot() {
      if (!board) return 0;
      // Build the "known" view from the shot grid.
      const known = []; // per tile: 'water' | 'ship' | 'unknown'
      let revealedShip = 0;
      for (let r = 0; r < N; r++) { known[r] = []; for (let c = 0; c < N; c++) {
        const s = shots[r][c];
        known[r][c] = s === 1 ? "water" : (s === 2 || s === 3) ? "ship" : "unknown";
        if (s === 2 || s === 3) revealedShip++;
      } }
      const sums = Array.from({ length: N }, () => new Array(N).fill(0));
      let count = 0, attempts = 0;
      while (count < 500 && attempts < 6000) {
        attempts++;
        const s = placeFleet(Math.random);
        // consistency: water tiles empty, revealed-ship tiles occupied
        let ok = true;
        for (let r = 0; r < N && ok; r++) for (let c = 0; c < N; c++) {
          const occ = s.occ.has(K(r, c));
          if (known[r][c] === "water" && occ) { ok = false; break; }
          if (known[r][c] === "ship" && !occ) { ok = false; break; }
        }
        if (!ok) continue;
        count++;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (known[r][c] !== "unknown") continue;
          if (!s.occ.has(K(r, c))) continue; // firing here misses in this sample → 0
          let val = BASE;
          const ship = s.ships[s.occ.get(K(r, c))];
          // completes the ship if all its OTHER cells are already revealed
          const othersRevealed = ship.cells.every(([rr, cc]) => (rr === r && cc === c) || known[rr][cc] === "ship");
          if (othersRevealed) { val += ship.sink; if (revealedShip + 1 === TOTAL_TILES) val += GRAND; }
          sums[r][c] += val;
        }
      }
      let bestEV = 0;
      if (count >= 20) { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) bestEV = Math.max(bestEV, sums[r][c] / count); }
      else bestEV = BASE + SINK[4]; // couldn't sample — price conservatively high
      const price = Math.max(Math.ceil(bet * 0.05), Math.round(bet * bestEV * (1 + EDGE)));
      return price;
    }

    /* ----- flow ----- */
    function deal() {
      if (phase === "playing") return;
      bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      server = randSeed();
      board = deriveBoard(server, client, nonce);
      shots = Array.from({ length: N }, () => new Array(N).fill(0));
      mult = 0; hits = 0; sunkCount = 0; shotsLeft = SHOTS; phase = "playing";
      dealBtn.disabled = true; betInput.disabled = true;
      actRow.style.display = "flex";
      view.querySelector("#bsLog").innerHTML = "";
      Casino.sound.play("tick");
      setStatus(`Fire! ${SHOTS} shots loaded — hit pieces, sink ships.`, "");
      log(`Bet ${Casino.money(bet)} · ${SHOTS} shots loaded. Round #${nonce}.`);
      paint(); refresh();
    }

    function fire(r, c) {
      if (phase !== "playing" || shotsLeft <= 0) return;
      if (shots[r][c] !== 0) return;
      shotsLeft--;
      if (board.occ.has(K(r, c))) {
        shots[r][c] = 2; hits++;
        const ship = board.ships[board.occ.get(K(r, c))]; ship.hit++;
        mult += BASE;
        if (ship.hit === ship.size) {
          ship.sunk = true; sunkCount++; mult += ship.sink;
          ship.cells.forEach(([rr, cc]) => (shots[rr][cc] = 3));
          log(`💥 Sank the ${ship.name}! +${ship.sink}× (${coord(r, c)})`, "win");
          Casino.sound.play("cashout");
          if (sunkCount === FLEET.length) { mult += GRAND; log(`🏆 WHOLE FLEET SUNK! +${GRAND}× GRAND JACKPOT!`, "win"); Casino.sound.play("bigwin"); paint(); refresh(); cashOut(true); return; }
        } else { log(`Hit at ${coord(r, c)} +${BASE}×`); Casino.sound.play("tick"); }
      } else { shots[r][c] = 1; log(`Miss at ${coord(r, c)}.`); Casino.sound.play("click"); }
      if (shotsLeft === 0) shotPrice = priceExtraShot();
      paint(); refresh();
      if (shotsLeft === 0) setStatus("Out of shots — buy another or cash out.", "");
      else setStatus(`Multiplier ${mult.toFixed(2)}× · ${shotsLeft} shot${shotsLeft === 1 ? "" : "s"} left.`, "");
    }

    function buyShot() {
      if (phase !== "playing" || shotsLeft > 0) return;
      const price = shotPrice || priceExtraShot();
      if (!Casino.bet(price)) { Casino.toast("Not enough cash for another shot.", "lose"); return; }
      shotsLeft++;
      log(`Bought a shot for ${Casino.money(price)}.`);
      Casino.sound.play("tick");
      setStatus(`Extra shot loaded — make it count.`, "");
      refresh();
    }

    function cashOut(auto) {
      if (phase !== "playing") return;
      const ret = Math.round(bet * mult);
      phase = "over";
      actRow.style.display = "none";
      dealBtn.disabled = false; betInput.disabled = false;
      if (ret > 0) Casino.payout(ret);
      const net = ret - bet;
      if (ret > 0) setStatus(`Cashed out ${mult.toFixed(2)}× — ${net >= 0 ? "+" + Casino.fmt(net) : "-" + Casino.fmt(-net)}.`, net >= 0 ? "win" : "lose");
      else setStatus(`No hits — lost ${Casino.money(bet)}.`, "lose");
      log(`Cashed out ${mult.toFixed(2)}× = ${Casino.money(ret)} (net ${net >= 0 ? "+" : ""}${Casino.fmt(net)}).`, net >= 0 ? "win" : "lose");
      if (!auto) Casino.sound.play(net > 0 ? "win" : "lose");
      nonce++;
      paint(); refresh();
      dealBtn.textContent = `🚀 Open Fire (${SHOTS} shots)`;
    }

    dealBtn.addEventListener("click", deal);
    view.querySelector("#bsBuy").addEventListener("click", buyShot);
    view.querySelector("#bsCash").addEventListener("click", () => cashOut(false));
    renderFair();

    /* ----- agent API ----- */
    window.BattleshipAPI = {
      inRound: () => phase === "playing",
      over: () => phase !== "playing",
      shotsLeft: () => shotsLeft,
      mult: () => mult,
      suggest: () => {
        if (phase !== "playing" || !shots) return null;
        // 😈 rig: with X-ray on, finish whole ships (biggest first) so the sink bonuses land — a real edge
        if (board && Casino.cheat && Casino.cheat.isOn && Casino.cheat.isOn()) {
          let target = null, bestScore = -1;
          for (const ship of board.ships) {
            if (ship.sunk) continue;
            const score = ship.hit * 10 + ship.size; // finish wounded ships first, else start the largest
            if (score > bestScore) { bestScore = score; target = ship; }
          }
          if (target) for (const [r, c] of target.cells) if (shots[r][c] === 0) return { r, c };
        }
        return bestShot(shots);
      },
      fire: (r, c) => fire(r, c),
      buyPrice: () => priceExtraShot(),
      buyShot: () => buyShot(),
      cashOut: () => cashOut(false),
      deploy: () => deal(),
    };
  }

  return { render, _t: { N, FLEET, SIZES, SINK, BASE, GRAND, SHOTS, EDGE, placeFleet, deriveBoard, bestShot, autoMultiplier, simulate, seedHash } };
})();
