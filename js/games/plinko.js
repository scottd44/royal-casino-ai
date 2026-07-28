/* ============================================================
   Plinko — drop a ball down a peg pyramid into a multiplier slot
   ------------------------------------------------------------
   Physics: a genuine Galton board. The ball free-falls under
   gravity (accelerating vertical velocity) and at every peg row
   caroms left or right on a fair 50/50 coin flip. Because each
   landing slot is reached by an independent binomial path, the
   slot distribution is exactly C(n,k)/2^n — which is what the
   published multiplier tables below are calibrated against, so
   the game carries a ~1% house edge just like Dice/Mines/Crash.
   ============================================================ */
const PlinkoGame = (() => {
  // Stake-style payout tables, one per (rows, risk). Length is always rows+1
  // and each is tuned so Σ P(slot)·multiplier ≈ 0.99 (≈1% house edge).
  const TABLES = {
    8: {
      low:    [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      high:   [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    },
    12: {
      low:    [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      high:   [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    },
    16: {
      low:    [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
      medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      high:   [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    },
  };

  const ROW_OPTIONS = [8, 12, 16];
  const RISK_LABELS = { low: "Low", medium: "Medium", high: "High" };

  /** Color a multiplier by magnitude: cool < 1×, green ~1×, gold mid, red hot. */
  function slotColor(m) {
    if (m < 1) return "#4d8cff";
    if (m < 2) return "#3ecf8e";
    if (m < 10) return "#e6c15a";
    return "#ef4d6a";
  }

  let history = []; // recent { mult, win } results, newest last

  function render(view) {
    let rows = 12;
    let risk = "medium";

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">${Casino.icon("git-fork", "ico-title")} Plinko</h2>
        <p class="page-sub">Drop the ball and let it bounce down the pegs. Edge slots pay huge but are rare;
          the middle pays under 1×. Pick your risk and rows, then drop as many as you like.</p>
        ${Casino.helpBtnHTML("plinkoHelp")}
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="plinko-stage" id="plinkoStage">
            <canvas id="plinkoCanvas" class="plinko-canvas"></canvas>
          </div>
          <div class="divider"></div>
          <div class="history">
            <h4>Recent drops</h4>
            <div class="history-list" id="history"></div>
          </div>
        </div>

        <div class="panel">
          ${Casino.betFieldHTML(20)}

          <div class="field">
            <label>Risk</label>
            <div class="bet-row" id="riskRow">
              <button class="btn btn-ghost" data-risk="low">Low</button>
              <button class="btn btn-ghost" data-risk="medium">Medium</button>
              <button class="btn btn-ghost" data-risk="high">High</button>
            </div>
          </div>

          <div class="field">
            <label>Rows</label>
            <div class="bet-row" id="rowsRow">
              ${ROW_OPTIONS.map((r) => `<button class="btn btn-ghost" data-rows="${r}">${r}</button>`).join("")}
            </div>
          </div>

          <div class="stat-grid">
            <div class="stat"><div class="k">Top slot</div><div class="v" id="maxMult">—</div></div>
            <div class="stat"><div class="k">Balls in play</div><div class="v" id="ballsLive">0</div></div>
            <div class="stat"><div class="k">Last drop</div><div class="v" id="lastMult">—</div></div>
            <div class="stat"><div class="k">Profit on top</div><div class="v" id="topProfit">—</div></div>
          </div>

          <button class="btn btn-block btn-green" id="dropBtn" style="margin-top:16px;font-size:16px;padding:14px;">Drop Ball</button>
        </div>
      </div>`;

    const stage = view.querySelector("#plinkoStage");
    const canvas = view.querySelector("#plinkoCanvas");
    const ctx = canvas.getContext("2d");
    const betInput = view.querySelector("#betInput");
    const dropBtn = view.querySelector("#dropBtn");
    const riskRow = view.querySelector("#riskRow");
    const rowsRow = view.querySelector("#rowsRow");

    // ---- Board geometry (recomputed on resize / row change) ----
    let pegs = [];            // { x, y, glow }
    let slots = [];           // { x0, x1, cx, mult, flash }
    let spacingX = 0, spacingY = 0, topY = 0, bucketY = 0, pegR = 3, ballR = 6, centerX = 0;
    let balls = [];
    let raf = null;
    let lastTs = 0;

    const G_FACTOR = 100;   // gravity (px/s² per px of row spacing) — lower = slower fall
    const HOP_FACTOR = 0.5;  // how high the ball bounces off each peg, as a fraction of row spacing

    function table() { return TABLES[rows][risk]; }

    function layout() {
      // Fit device-pixel canvas to its CSS box for crisp rendering.
      const cssW = canvas.clientWidth || stage.clientWidth;
      const cssH = canvas.clientHeight || stage.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = cssW, h = cssH;
      const sideMargin = 26;               // keep the widest peg row off the walls
      spacingX = (w - sideMargin * 2) / rows;
      const bottomGap = 46;                // room for the slot row
      topY = 30;
      spacingY = (h - bottomGap - topY) / rows; // vertical gap between peg rows
      centerX = w / 2;
      pegR = Math.max(2, Math.min(4.5, spacingX * 0.11));
      ballR = Math.max(4, Math.min(9, spacingX * 0.26));

      // Peg pyramid: row r (0..rows-1) has r+1 pegs, offsets (k - r/2).
      pegs = [];
      for (let r = 0; r < rows; r++) {
        const y = topY + r * spacingY;
        for (let k = 0; k <= r; k++) {
          const off = k - r / 2;
          pegs.push({ x: centerX + off * spacingX, y, glow: 0 });
        }
      }
      bucketY = topY + (rows - 1) * spacingY + spacingY * 0.9; // ball settles here

      // Slots: rows+1 of them, centered under the gaps of the bottom peg row.
      const mults = table();
      slots = mults.map((m, b) => {
        const cx = centerX + (b - rows / 2) * spacingX;
        return { x0: cx - spacingX / 2, x1: cx + spacingX / 2, cx, mult: m, flash: 0 };
      });
    }

    // ---- Build a single ball's precomputed physics path ----
    function makeBall(bet) {
      let decisions = [];
      let sum = 0;
      for (let r = 0; r < rows; r++) {
        const dir = Math.random() < 0.5 ? -1 : 1; // fair coin -> binomial slot
        decisions.push(dir);
        sum += dir;
      }
      let slotIndex = (sum + rows) / 2; // number of rights, 0..rows

      // Rigged odds: steer the ball to a paying (>=1x) slot by choosing the
      // number of right-hops needed to reach it.
      if (Casino.cheat.win()) {
        const mults = table();
        const paying = mults.map((m, i) => (m >= 1 ? i : -1)).filter((i) => i >= 0);
        if (paying.length) {
          const targetSlot = Casino.pick(paying);
          const arr = new Array(rows).fill(-1);
          const idxs = [...Array(rows).keys()];
          for (let m = 0; m < targetSlot; m++) {
            const p = idxs.splice(Casino.randInt(0, idxs.length - 1), 1)[0];
            arr[p] = 1;
          }
          decisions = arr;
          slotIndex = targetSlot;
        }
      }

      // Waypoints: spawn -> each peg row -> slot mouth.
      const path = [{ x: centerX, y: topY - spacingY * 0.8 }];
      let cum = 0;
      for (let r = 0; r < rows; r++) {
        path.push({ x: centerX + (cum / 2) * spacingX, y: topY + r * spacingY });
        cum += decisions[r];
      }
      path.push({ x: centerX + (cum / 2) * spacingX, y: bucketY });

      return {
        bet, slotIndex, path,
        seg: 0,          // index of the segment currently being traversed
        segT: 0,         // elapsed time in this segment (s)
        segDur: 0,       // total time for this segment (s)
        vx: 0,
        vy: 0,           // carried across segments -> accelerating fall
        x: path[0].x, y: path[0].y,
        squash: 0,       // peg-hit squash, decays each frame
        settled: false,
        settleT: 0,
      };
    }

    function beginSegment(ball) {
      const a = ball.path[ball.seg];
      const b = ball.path[ball.seg + 1];
      const g = spacingY * G_FACTOR;
      const dy = b.y - a.y;
      // After the initial drop, the ball bounces UP off each peg before falling on
      // to the next — a genuine hop, not a straight slide. vu is that launch speed,
      // chosen so the apex clears the peg by HOP_FACTOR of a row.
      const vu = ball.seg === 0 ? 0 : Math.sqrt(2 * g * spacingY * HOP_FACTOR);
      // Solve  a.y − vu·T + ½g·T² = b.y  →  T = (vu + √(vu² + 2g·dy)) / g
      const T = (vu + Math.sqrt(vu * vu + 2 * g * dy)) / g;
      ball.segDur = T;
      ball.segT = 0;
      ball.vx = (b.x - a.x) / T;
      ball._ax = a.x; ball._ay = a.y; ball._vu = vu;
    }

    function stepBall(ball, dt) {
      if (ball.settled) { ball.settleT += dt; return; }
      const g = spacingY * G_FACTOR;
      ball.segT += dt;
      const t = Math.min(ball.segT, ball.segDur);
      ball.x = ball._ax + ball.vx * t;
      ball.y = ball._ay - ball._vu * t + 0.5 * g * t * t; // up-then-down arc = a bounce

      if (ball.segT >= ball.segDur) {
        ball.seg++;
        // A peg was struck at the waypoint we just reached (rows 1..rows).
        if (ball.seg >= 1 && ball.seg <= rows) {
          ball.squash = 1;
          pingNearestPeg(ball.x, ball.y);
        }
        if (ball.seg >= ball.path.length - 1) {
          landBall(ball);
          return;
        }
        beginSegment(ball);
      }
      if (ball.squash > 0) ball.squash = Math.max(0, ball.squash - dt * 5);
    }

    function pingNearestPeg(x, y) {
      let best = null, bd = Infinity;
      for (const p of pegs) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd < (spacingX * 0.9) ** 2) best.glow = 1;
    }

    function landBall(ball) {
      ball.settled = true;
      ball.x = slots[ball.slotIndex].cx;
      ball.y = bucketY + ballR;
      const slot = slots[ball.slotIndex];
      slot.flash = 1;
      const mult = slot.mult;
      const won = Math.floor(ball.bet * mult);
      if (won > 0) Casino.payout(won);
      const net = won - ball.bet;
      Casino.sound.play(net > 0 ? (mult >= 10 ? "bigwin" : "win") : "lose");
      history.push({ mult, win: net > 0 });
      if (history.length > 200) history.shift();
      updateHistory();
      view.querySelector("#lastMult").textContent = mult.toFixed(mult < 10 ? 2 : 0) + "×";
      const big = mult >= 5;
      Casino.toast(
        `${mult.toFixed(mult < 10 ? 2 : 0)}× — ${net >= 0 ? "won +" : "lost "}${Casino.money(net)}`,
        net > 0 ? (big ? "win" : "win") : "lose"
      );
    }

    // ---- Rendering ----
    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // pegs
      for (const p of pegs) {
        const glow = p.glow;
        if (glow > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, pegR + 4 * glow, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(246,217,122,${0.35 * glow})`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, pegR, 0, Math.PI * 2);
        ctx.fillStyle = glow > 0 ? "#f6d97a" : "#8a96ad";
        ctx.fill();
        p.glow = Math.max(0, glow - 0.04);
      }

      // slots
      const slotTop = bucketY + ballR + 2;
      const slotH = Math.max(20, Math.min(34, spacingY * 0.9));
      const fontPx = rows >= 16 ? 9 : rows >= 12 ? 10 : 12;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${fontPx}px Inter, sans-serif`;
      for (const s of slots) {
        const col = slotColor(s.mult);
        const y = slotTop + s.flash * -3;
        const pad = 1.5;
        roundRect(ctx, s.x0 + pad, y, s.x1 - s.x0 - pad * 2, slotH, 5);
        const a = 0.16 + 0.6 * s.flash;
        ctx.fillStyle = hexA(col, a);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexA(col, 0.5 + 0.5 * s.flash);
        ctx.stroke();
        ctx.fillStyle = s.flash > 0.2 ? "#0a0e17" : col;
        const label = s.mult >= 100 ? s.mult + "×" : s.mult.toFixed(s.mult < 10 ? (s.mult % 1 ? 1 : 0) : 0) + "×";
        ctx.fillText(label.replace(".0×", "×"), s.cx, y + slotH / 2 + 0.5);
        s.flash = Math.max(0, s.flash - 0.03);
      }

      // balls
      for (const ball of balls) {
        const sq = ball.squash;
        const rx = ballR * (1 + sq * 0.35);
        const ry = ballR * (1 - sq * 0.35);
        const grad = ctx.createRadialGradient(ball.x - rx * 0.3, ball.y - ry * 0.3, ry * 0.2, ball.x, ball.y, rx);
        grad.addColorStop(0, "#fff4cf");
        grad.addColorStop(0.5, "#f6d97a");
        grad.addColorStop(1, "#e6c15a");
        ctx.beginPath();
        ctx.ellipse(ball.x, ball.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.shadowColor = "rgba(230,193,90,0.6)";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function frame(ts) {
      if (!canvas.isConnected) { raf = null; return; } // view was replaced — stop cleanly
      const dt = Math.min(0.032, lastTs ? (ts - lastTs) / 1000 : 0.016);
      lastTs = ts;

      for (const ball of balls) stepBall(ball, dt);
      // Remove balls that have rested in their slot for a beat.
      balls = balls.filter((b) => !(b.settled && b.settleT > 0.35));

      draw();
      view.querySelector("#ballsLive").textContent = String(balls.length);

      const stillAnimating = balls.length > 0 || slots.some((s) => s.flash > 0) || pegs.some((p) => p.glow > 0);
      if (stillAnimating) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = null; lastTs = 0;
        draw(); // final resting frame
      }
    }

    function ensureLoop() {
      if (raf == null) { lastTs = 0; raf = requestAnimationFrame(frame); }
    }

    // ---- Controls ----
    function drop() {
      const bet = Math.floor(Number(betInput.value));
      if (!Casino.bet(bet)) return;
      const ball = makeBall(bet);
      beginSegment(ball);
      balls.push(ball);
      view.querySelector("#ballsLive").textContent = String(balls.length); // sync so callers see it immediately
      ensureLoop();
    }

    function updateHistory() {
      view.querySelector("#history").innerHTML = history.slice(-14).reverse()
        .map((r) => {
          const label = r.mult >= 100 ? r.mult + "×" : r.mult.toFixed(r.mult < 10 ? 2 : 0) + "×";
          return `<span class="pill ${r.win ? "win" : "lose"}">${label}</span>`;
        }).join("");
    }

    function updateInfo() {
      const mults = table();
      const max = Math.max(...mults);
      view.querySelector("#maxMult").textContent = (max >= 100 ? max : max.toFixed(max < 10 ? 1 : 0)) + "×";
      const bet = Math.floor(Number(betInput.value)) || 0;
      view.querySelector("#topProfit").textContent = bet > 0 ? "+" + Casino.fmt(bet * max - bet) : "—";
    }

    function setRisk(r) {
      risk = r;
      riskRow.querySelectorAll("[data-risk]").forEach((b) => {
        const on = b.dataset.risk === r;
        b.classList.toggle("btn-green", on);
        b.classList.toggle("btn-ghost", !on);
      });
      layout(); draw(); updateInfo();
    }

    function setRows(r) {
      rows = r;
      rowsRow.querySelectorAll("[data-rows]").forEach((b) => {
        const on = Number(b.dataset.rows) === r;
        b.classList.toggle("btn-green", on);
        b.classList.toggle("btn-ghost", !on);
      });
      balls = []; // in-flight paths were built for the old geometry
      layout(); draw(); updateInfo();
    }

    Casino.wireBet(view, updateInfo);
    view.querySelector("#plinkoHelp").addEventListener("click", () => Casino.openHowTo("How to play — Plinko", `
      <h4>Goal</h4>
      <p>Drop a ball from the top and watch it bounce off the pegs, landing in one of the slots along the bottom. Whatever <b>multiplier</b> that slot shows is applied to your bet.</p>
      <h4>Where the payouts live</h4>
      <p>The <b>outer</b> slots carry the big multipliers but are rare to reach; the <b>middle</b> slots are the most likely and often pay <b>under 1×</b> (a partial loss). It balances out to a small house edge over many drops.</p>
      <h4>Risk &amp; rows</h4>
      <p><b>Risk</b> (low / medium / high) reshapes the payouts — high risk makes the edges pay more and the middle pay less. More <b>rows</b> means more pegs, more slots, and higher top multipliers. Drop as many balls as you like.</p>`));
    betInput.addEventListener("input", updateInfo);
    riskRow.querySelectorAll("[data-risk]").forEach((b) => b.addEventListener("click", () => setRisk(b.dataset.risk)));
    rowsRow.querySelectorAll("[data-rows]").forEach((b) => b.addEventListener("click", () => setRows(Number(b.dataset.rows))));
    dropBtn.addEventListener("click", drop);
    window.addEventListener("resize", () => { layout(); draw(); });

    // Boot
    setRisk("medium");
    setRows(12);
    layout();
    draw();
    updateInfo();
  }

  // ---- small canvas helpers ----
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  return { render };
})();
