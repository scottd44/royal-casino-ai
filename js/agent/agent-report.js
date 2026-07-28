/* ============================================================
   Royal Casino — Session Report modal
   ------------------------------------------------------------
   Renders the AI-generated end-of-session report: summary stats,
   a PNL chart over the whole session, notable up/down swings,
   logged breaks, and the model's performance narrative.

   Requires: agent-ui.js (RoyalAgent) loaded first.
   ============================================================ */
(() => {
  const R = window.RoyalAgent;
  const fmt = (n) => Casino.fmt(n);
  const money = (n) => Casino.money(n);
  let current = null;

  const overlay = document.createElement("div");
  overlay.className = "report-overlay";
  overlay.id = "reportOverlay";
  overlay.innerHTML = `
    <div class="report-card">
      <div class="report-head">
        <div>
          <h2 class="report-title">📊 Session Report</h2>
          <div class="report-sub" id="rSub"></div>
        </div>
        <button class="btn btn-ghost btn-sm" id="rClose">✕</button>
      </div>
      <div class="report-stats" id="rStats"></div>
      <div class="report-section">
        <h4>Balance over the session (PNL)</h4>
        <canvas id="rChart" height="170"></canvas>
      </div>
      <div class="report-swings">
        <div class="report-swing up" id="rUp"></div>
        <div class="report-swing down" id="rDown"></div>
      </div>
      <div class="report-section" id="rDesperateWrap">
        <h4>💸 Desperate measures</h4>
        <div id="rDesperate" class="report-desperate"></div>
      </div>
      <div class="report-section" id="rBreaksWrap">
        <h4>Breaks</h4>
        <div id="rBreaks" class="report-breaks"></div>
      </div>
      <div class="report-section">
        <h4>Performance narrative <span class="report-model" id="rModel"></span></h4>
        <div class="report-narrative" id="rNarr"></div>
      </div>
      <div class="report-actions">
        <button class="btn" id="rExport">⬇ Download report (JSON)</button>
        <button class="btn btn-ghost" id="rClose2">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (id) => document.getElementById(id);
  const close = () => overlay.classList.remove("show");
  $("rClose").addEventListener("click", close);
  $("rClose2").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  $("rExport").addEventListener("click", () => {
    if (!current) return;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `royal-casino-report-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  function fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`;
  }
  function chip(k, v, cls = "") { return `<div class="lab-stat"><div class="lab-stat-k">${k}</div><div class="lab-stat-v ${cls}">${v}</div></div>`; }

  /* Numeric report chips tick up from zero with CountUp.js when the modal
     opens. `pending` is filled while the markup is built, then played back
     once the nodes are actually in the DOM. */
  let pending = [];
  function numChip(k, value, format, cls = "") {
    const id = "rNum" + pending.length;
    pending.push({ id, to: Number(value) || 0, format });
    return `<div class="lab-stat"><div class="lab-stat-k">${k}</div>
      <div class="lab-stat-v ${cls}" id="${id}">${format(0)}</div></div>`;
  }
  /* Started synchronously, NOT inside requestAnimationFrame: rAF can be
     suspended indefinitely (background tab), which would leave every figure
     in the report reading zero. Casino.fx.countTo animates when it can and
     snaps to the true value either way. */
  function playCounters() {
    const list = pending;
    pending = [];
    list.forEach((p) => {
      const el = $(p.id);
      if (el) Casino.fx.countTo(el, 0, p.to, p.format);
    });
  }

  function renderChart(report) {
    const c = $("rChart");
    const rounds = report.rounds || [];
    const w = (c.width = c.clientWidth || 600);
    const h = c.height;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const start = report.startCredits;
    const series = [start, ...rounds.map((r) => r.balance)];
    if (series.length < 2) return;
    const min = Math.min(...series), max = Math.max(...series);
    const pad = 8;
    const x = (i) => pad + (i / (series.length - 1)) * (w - 2 * pad);
    const y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);

    // baseline (starting bankroll)
    ctx.strokeStyle = "rgba(135,146,168,0.4)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad, y(start)); ctx.lineTo(w - pad, y(start)); ctx.stroke();
    ctx.setLineDash([]);

    // area fill
    const up = report.net >= 0;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, up ? "rgba(34,229,154,0.32)" : "rgba(255,77,109,0.32)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    series.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.lineTo(x(series.length - 1), h - pad);
    ctx.lineTo(x(0), h - pad);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // line
    ctx.strokeStyle = up ? "#22e59a" : "#ff4d6d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke();
  }

  function show(report) {
    current = report;
    const s = report.stats;
    $("rSub").innerHTML =
      `Trigger: <b>${report.trigger}</b> · ${fmtDuration(report.durationMs)} · ` +
      `${report.gamesPlayed.join(", ") || "—"}`;
    $("rModel").textContent = report.model ? `· ${report.model}` : "";

    const netCls = report.net > 0 ? "pos" : report.net < 0 ? "neg" : "";
    const perGame = Object.entries(report.perGameNet)
      .map(([k, v]) => `${k} ${v >= 0 ? "+" : "-"}${money(v)}`).join(" · ") || "—";
    const signed = (n) => (n >= 0 ? "+" : "-") + money(n);
    const chips = [numChip("Wallet net", report.net, signed, netCls)];
    if (report.borrowed > 0) {
      chips.push(numChip("Borrowed (debt)", report.borrowed, money, "neg"));
      chips.push(numChip("Real result", report.netWithDebt, signed, report.netWithDebt < 0 ? "neg" : "pos"));
    }
    chips.push(
      chip("Start → End", `${money(report.startCredits)} → ${money(report.endCredits)}`),
      numChip("Rounds", s.rounds, (v) => fmt(v)),
      numChip("Win rate", s.winRate * 100, (v) => v.toFixed(0) + "%"),
      chip("W / L", `${s.wins} / ${s.losses}`),
      numChip("Biggest win", report.biggestWin, (v) => "+" + money(v), "pos"),
      numChip("Biggest loss", report.biggestLoss, money, report.biggestLoss < 0 ? "neg" : ""),
      chip("Longest W/L", `${s.maxWinStreak}/${s.maxLossStreak}`),
      numChip("Total wagered", s.totalWagered, money),
      chip("Per game", perGame),
    );
    $("rStats").innerHTML = chips.join("");
    playCounters();

    const u = report.swings.upswing, d = report.swings.downswing;
    $("rUp").innerHTML = u.amount > 0
      ? `<div class="swing-k">📈 Biggest upswing</div><div class="swing-v pos">+${fmt(u.amount)}</div>
         <div class="swing-d">rounds ${u.from}–${u.to}${u.game ? ` · mostly ${u.game}` : ""}</div>`
      : `<div class="swing-k">📈 Biggest upswing</div><div class="swing-d">—</div>`;
    $("rDown").innerHTML = d.amount > 0
      ? `<div class="swing-k">📉 Biggest downswing</div><div class="swing-v neg">-${fmt(d.amount)}</div>
         <div class="swing-d">rounds ${d.from}–${d.to}${d.game ? ` · mostly ${d.game}` : ""}</div>`
      : `<div class="swing-k">📉 Biggest downswing</div><div class="swing-d">—</div>`;

    if (report.desperateMeasures && report.desperateMeasures.length) {
      $("rDesperateWrap").style.display = "";
      $("rDesperate").innerHTML =
        `<div class="desperate-summary">Went broke and borrowed <b>${money(report.borrowed)}</b> across ` +
        `${report.desperateMeasures.length} desperate move(s) to keep playing — leaving a real result of ` +
        `<b class="${report.netWithDebt < 0 ? "neg" : "pos"}">${report.netWithDebt >= 0 ? "+" : "-"}${money(report.netWithDebt)}</b>.</div>` +
        report.desperateMeasures.map((d) =>
          `<div class="desperate-row">
             <div class="desperate-top"><span>${d.n}. ${d.label}</span><span class="neg">+${money(d.amount)}</span></div>
             ${d.reason ? `<div class="desperate-reason">“${d.reason}”</div>` : ""}
           </div>`).join("");
    } else {
      $("rDesperateWrap").style.display = "none";
    }

    if (report.breaks.length) {
      $("rBreaksWrap").style.display = "";
      $("rBreaks").innerHTML = report.breaks.map((b, i) =>
        `<span class="pill">Break ${i + 1}: ${fmtDuration(b.durationMs)}</span>`).join("");
    } else {
      $("rBreaksWrap").style.display = "none";
    }

    $("rNarr").textContent = report.narrative || "(no narrative)";

    overlay.classList.add("show");
    renderChart(report);
  }

  window.addEventListener("resize", () => { if (overlay.classList.contains("show") && current) renderChart(current); });

  R.setOnReport(show);
  window.RoyalReport = { show };
})();
