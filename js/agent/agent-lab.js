/* ============================================================
   Royal Casino — AI Lab drawer (view for the AI controller)
   ------------------------------------------------------------
   Collapsible bottom drawer: aggression/speed sliders, model +
   auto-stop controls, live benchmark stats, a balance chart, and
   a scrolling move-by-move history. Reads/writes RoyalAgent.

   Requires: harness.js + agent-ui.js loaded first.
   ============================================================ */
(() => {
  const R = window.RoyalAgent;
  const view = document.getElementById("view");
  const fmt = (n) => Casino.fmt(n);
  const money = (n) => Casino.money(n);

  /* ---------------- build the drawer once ---------------- */
  const lab = document.createElement("div");
  lab.id = "aiLab";
  lab.className = "ai-lab collapsed hidden";
  lab.innerHTML = `
    <div class="ai-lab-resizer" id="aiLabResizer" title="Drag to resize"></div>
    <div class="ai-lab-handle" id="aiLabHandle">
      <span class="ai-lab-title">🤖 AI Lab</span>
      <span class="ai-lab-badge" id="aiLabLive">idle</span>
      <span class="ai-lab-pnl" id="labPnl">±$0</span>
      <span class="ai-lab-live" id="aiStatus">ready</span>
      <span class="ai-lab-caret" id="aiLabCaret">▲</span>
    </div>
    <div class="ai-lab-body">
      <div class="ai-lab-col">
        <div class="lab-sec">Behavior</div>
        <div class="lab-row">
          <label>Aggression <b id="aggrVal">15%</b> <span class="lab-hint" id="aggrLabel">cautious</span>
            <button class="lab-info" type="button" data-tip="Sets the bet-size hint the AI is fed each round (aggression × current bankroll). Higher = it's nudged to wager a bigger slice of its stack. It's guidance, not a hard rule — a tilted degenerate can still defy it.">ⓘ</button>
          </label>
          <input type="range" id="aggr" min="0" max="100" value="15" class="lab-slider">
        </div>
        <div class="lab-row">
          <label>Move speed <b id="speedVal">700ms delay</b>
            <button class="lab-info" type="button" data-tip="Pure pacing — the pause between the AI's moves so you can watch. It does NOT change how the model thinks or plays; it only slows down or speeds up the action on screen.">ⓘ</button>
          </label>
          <input type="range" id="speed" min="0" max="1500" step="50" value="700" class="lab-slider">
        </div>
        <div class="lab-row">
          <label>Brainpower <b id="brainVal">🃏 Sharp · 224 tokens</b>
            <button class="lab-info" type="button" data-tip="How much the model may think per decision. Left = fewer tokens + hotter sampling → fast, cheap gut calls (may occasionally misfire, the fallback covers it). Right = more tokens + cooler sampling → slower, more deliberate, better reasoning. Same model throughout — you're changing how hard it thinks, not swapping brains.">ⓘ</button>
          </label>
          <input type="range" id="brainSlider" min="0" max="100" value="50" class="lab-slider">
          <div class="lab-scale"><span>🦎 Instinct</span><span>🃏 Sharp</span><span>🧠 Deep</span></div>
        </div>
        <div class="lab-row">
          <label>Compute
            <button class="lab-info" type="button" data-tip="Where inference runs. On Apple Silicon the model uses the GPU (Metal) by default — much faster and cooler; keep it here normally. CPU forces processor-only inference: slower and hotter, but you can watch the CPU cores light up in the System monitor above. Locked while the AI is running — change it, then Start (or restart) to apply.">ⓘ</button>
          </label>
          <div class="lab-seg2" id="computeSeg">
            <button type="button" data-compute="gpu" class="on">⚡ GPU <small>(Metal)</small></button>
            <button type="button" data-compute="cpu">🧮 CPU</button>
          </div>
        </div>
        <div class="lab-row">
          <label class="lab-switch" style="margin:0;">
            <input type="checkbox" id="emotions" checked><span>😤 Emotions (tilt)</span>
            <button class="lab-info" type="button" data-tip="ON: losses build 'tilt' and wins cool it, and that emotion drives how hard it presses and chases — the full degenerate. OFF: cold-blooded, steady bet-sizing with no tilt swings. Either way it still talks plenty of trash in its reasoning.">ⓘ</button>
          </label>
        </div>
        <div class="lab-row-2">
          <div><label>Model
            <button class="lab-info" type="button" data-tip="The Ollama model that makes the decisions. This list is your locally-installed models (auto-detected). qwen2.5:7b is recommended — it's reliable at the structured tool-calls this app needs. Bigger models reason better but use more tokens and run slower; smaller ones are faster but rougher.">ⓘ</button>
            <button class="lab-mini" type="button" id="modelRefresh" title="Re-scan installed Ollama models">⟳</button>
          </label>
          <select class="lab-input" id="modelSelect"></select></div>
          <div><label>Run N (0=∞)</label><input class="lab-input" type="number" id="runN" min="0" value="0"></div>
        </div>
        <div class="lab-sec">Session</div>
        <div class="lab-row-2">
          <div><label>Profit target %</label><input class="lab-input" type="number" id="profit" min="0" value="0"></div>
          <div><label>Stop-loss %</label><input class="lab-input" type="number" id="loss" min="0" value="0"></div>
        </div>
        <div class="lab-row-2">
          <div><label>Session timer (min, 0=∞)</label><input class="lab-input" type="number" id="sessionMin" min="0" value="0"></div>
          <div><label>Break every (min, 0=off)</label><input class="lab-input" type="number" id="breakEvery" min="0" value="0"></div>
        </div>
        <div class="lab-row-2">
          <div><label>Break length (min)</label><input class="lab-input" type="number" id="breakFor" min="1" value="1"></div>
          <div><label>&nbsp;</label><label class="lab-switch" style="margin:0;">
            <input type="checkbox" id="agentic"><span>Agentic</span>
          </label></div>
        </div>
        <div class="lab-sec">Controls</div>
        <div class="lab-btns">
          <button class="btn ai-btn" id="labRun">🤖 Start</button>
          <button class="btn btn-red btn-sm" id="labReport">⏹ Stop &amp; Report</button>
          <button class="btn btn-ghost btn-sm" id="labNewGame" title="Make the roaming AI switch to a different game (Agentic mode)">🔀 New game</button>
          <button class="btn btn-ghost btn-sm" id="labReset">Reset</button>
          <button class="btn btn-ghost btn-sm" id="labClear">Clear log</button>
          <button class="btn btn-ghost btn-sm" id="labJSON">JSON</button>
          <button class="btn btn-ghost btn-sm" id="labCSV">CSV</button>
          <button class="btn btn-ghost btn-sm" data-nav="aiguide" title="Full documentation of how the AI works">📖 Guide</button>
        </div>
      </div>
      <div class="ai-lab-col">
        <div class="lab-sec">Session telemetry</div>
        <div class="lab-stats" id="labStats"></div>
        <div class="lab-games" id="labGames"></div>
        <canvas id="aiChart" class="lab-chart" style="height:156px"></canvas>
        <div class="lab-sec">System monitor <span id="sysDot" class="sys-dot"></span></div>
        <div class="lab-sys" id="labSys"></div>
      </div>
      <div class="ai-lab-col ai-lab-history">
        <div class="lab-hist-head">Move history</div>
        <div class="lab-log" id="labLog"><div class="lab-log-empty">Press Start to watch the AI play.</div></div>
      </div>
    </div>`;
  document.body.appendChild(lab);

  const $ = (id) => document.getElementById(id);

  /* ---------------- wire controls -> settings ---------------- */
  // Keep the page content clear of the drawer: pad the body by the drawer's
  // visible height so nothing is ever hidden behind it (push, not overlay).
  function updateBodyPadding() {
    const collapsed = lab.classList.contains("collapsed");
    document.body.style.paddingBottom = (collapsed ? 52 : lab.offsetHeight) + "px";
  }

  $("aiLabHandle").addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    lab.classList.toggle("collapsed");
    $("aiLabCaret").textContent = lab.classList.contains("collapsed") ? "▲" : "▼";
    updateBodyPadding();
  });
  window.addEventListener("resize", updateBodyPadding);

  const RISK = (a) =>
    a < 8 ? "very cautious" : a < 20 ? "cautious" : a < 45 ? "balanced" : a < 70 ? "aggressive" : "swinging big";

  $("aggr").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    R.settings.aggression = v / 100;
    $("aggrVal").textContent = v + "%";
    $("aggrLabel").textContent = RISK(v);
  });
  $("speed").addEventListener("input", (e) => {
    R.settings.delayMs = Number(e.target.value);
    $("speedVal").textContent = e.target.value + "ms delay";
  });
  // ---- Model dropdown: auto-detect installed Ollama models ----
  function modelBlurb(m) {
    const name = m.name || String(m);
    const ps = (m.details && m.details.parameter_size) || "";
    const b = parseFloat(ps) || parseFloat((name.match(/[:\-](\d+(?:\.\d+)?)b/i) || [])[1]) || 0;
    const size = b >= 27 ? "very capable, heavy & slow"
      : b >= 12 ? "smarter, uses more tokens"
      : b >= 6 ? "balanced smarts & speed"
      : b >= 3 ? "lighter — fewer tokens, faster"
      : "tiny — fastest, least nuance";
    const fam = (((m.details && m.details.family) || name)).toLowerCase();
    const good = /qwen/.test(fam) ? "sharp tool-caller"
      : /llama/.test(fam) ? "solid all-rounder"
      : /mistral|mixtral/.test(fam) ? "fast & capable"
      : /phi/.test(fam) ? "small reasoner"
      : /gemma/.test(fam) ? "efficient"
      : /deepseek/.test(fam) ? "reasoning-focused"
      : /llava|vision|bakllava/.test(fam) ? "vision model — weak at tool calls"
      : "general purpose";
    return `${good}, ${size}`;
  }

  async function refreshModels() {
    const sel = $("modelSelect");
    if (!sel) return;
    let models = [];
    try {
      const res = await fetch("http://localhost:11434/api/tags", { cache: "no-store" });
      const data = await res.json();
      models = Array.isArray(data.models) ? data.models : [];
    } catch { models = []; }

    const cur = R.settings.model || "qwen2.5:7b";
    const names = new Set(models.map((m) => m.name));
    const opts = models.slice();
    if (!names.has("qwen2.5:7b")) opts.push({ name: "qwen2.5:7b", _missing: true });
    if (!names.has(cur) && cur !== "qwen2.5:7b") opts.push({ name: cur, _missing: true });
    // recommended first, then alphabetical
    opts.sort((a, b) =>
      a.name === "qwen2.5:7b" ? -1 : b.name === "qwen2.5:7b" ? 1 : a.name.localeCompare(b.name));

    sel.innerHTML = opts.map((m) => {
      const rec = m.name === "qwen2.5:7b";
      const desc = rec ? "best tool-calling balance" : modelBlurb(m);
      const missing = m._missing ? " · not installed" : "";
      const label = `${m.name}${rec ? " (recommended)" : ""} — ${desc}${missing}`;
      return `<option value="${m.name}"${m.name === cur ? " selected" : ""}>${label}</option>`;
    }).join("");
    if (![...sel.options].some((o) => o.value === cur)) sel.value = "qwen2.5:7b";
  }

  $("modelSelect").addEventListener("change", (e) => R.setModel(e.target.value || "qwen2.5:7b"));
  $("modelRefresh").addEventListener("click", refreshModels);

  $("emotions").addEventListener("change", (e) => {
    R.setEmotions(e.target.checked);
    Casino.toast(e.target.checked ? "Emotions on — full tilt degenerate." : "Emotions off — cold-blooded mode (still profane).", "info");
  });
  $("computeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-compute]");
    if (!b) return;
    if (R.isRunning()) { Casino.toast("Stop the AI first — compute can only change between sessions.", "info"); return; }
    R.setCompute(b.dataset.compute);
    $("computeSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    Casino.toast(b.dataset.compute === "cpu"
      ? "Set to CPU — slower & hotter; watch the CPU bars. Applies when you Start."
      : "Set to GPU (Metal) — the fast default.", "info");
  });
  // Brainpower dial: 0-100 -> 64-768 tokens (exponential) with matching temperature.
  // Low = fast gut calls (hot sampling); high = slow deliberate reads (cool sampling).
  function brainFromDial(v) {
    const tokens = Math.round(64 * Math.pow(12, v / 100));
    const temp = +(0.8 - 0.45 * (v / 100)).toFixed(2);
    const zone = v < 33 ? "🦎 Instinct" : v < 67 ? "🃏 Sharp" : "🧠 Deep";
    return { tokens, temp, zone };
  }
  $("brainSlider").addEventListener("input", (e) => {
    const b = brainFromDial(Number(e.target.value));
    $("brainVal").textContent = `${b.zone} · ${b.tokens} tokens`;
    R.setBrain(b.tokens, b.temp, b.zone.replace(/^\S+\s/, ""));
  });

  // Info-button popovers explaining what each dial does.
  const labTip = document.createElement("div");
  labTip.className = "lab-tip";
  document.body.appendChild(labTip);
  const hideTip = () => labTip.classList.remove("show");
  lab.addEventListener("click", (e) => {
    const btn = e.target.closest(".lab-info");
    if (!btn) return;
    e.stopPropagation();
    if (labTip.classList.contains("show") && labTip.dataset.for === btn.dataset.tip) { hideTip(); return; }
    labTip.textContent = btn.dataset.tip;
    labTip.dataset.for = btn.dataset.tip;
    labTip.classList.add("show");
    const r = btn.getBoundingClientRect();
    const tw = labTip.offsetWidth;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tw - 12));
    labTip.style.left = left + "px";
    labTip.style.top = Math.max(12, r.top - labTip.offsetHeight - 10) + "px";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".lab-info") && !e.target.closest(".lab-tip")) hideTip();
  });
  window.addEventListener("scroll", hideTip, true);
  $("runN").addEventListener("change", (e) => (R.settings.runN = Math.max(0, Number(e.target.value) || 0)));
  $("profit").addEventListener("change", (e) => (R.settings.profitTargetPct = Math.max(0, Number(e.target.value) || 0)));
  $("loss").addEventListener("change", (e) => (R.settings.stopLossPct = Math.max(0, Number(e.target.value) || 0)));
  $("agentic").addEventListener("change", (e) => { R.settings.agentic = e.target.checked; renderButtons(); });
  $("sessionMin").addEventListener("change", (e) => (R.settings.sessionMinutes = Math.max(0, Number(e.target.value) || 0)));
  $("breakEvery").addEventListener("change", (e) => (R.settings.breakEvery = Math.max(0, Number(e.target.value) || 0)));
  $("breakFor").addEventListener("change", (e) => (R.settings.breakFor = Math.max(1, Number(e.target.value) || 1)));
  $("labReport").addEventListener("click", () => { R.stopAndReport(); openDrawer(); });
  $("labNewGame").addEventListener("click", () => R.forceNewGame());

  $("labRun").addEventListener("click", () => {
    if (R.isRunning()) { R.stop(); return; }
    const id = R.currentGameId();
    if (R.settings.agentic || R.hasAdapter(id)) { R.play(id); openDrawer(); }
    else Casino.toast("Open a game first, or turn on Agentic mode.", "info");
  });
  $("labReset").addEventListener("click", () => R.resetStats());
  $("labClear").addEventListener("click", () => R.clearSessionLog());
  $("labJSON").addEventListener("click", () => R.exportJSON());
  $("labCSV").addEventListener("click", () => R.exportCSV());

  // Drag the top edge to resize the drawer.
  const resizer = $("aiLabResizer");
  let dragging = false;
  resizer.addEventListener("pointerdown", (e) => {
    dragging = true;
    resizer.setPointerCapture(e.pointerId);
    lab.classList.remove("collapsed");
    $("aiLabCaret").textContent = "▼";
    document.body.style.userSelect = "none";
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const body = lab.querySelector(".ai-lab-body");
    const h = Math.max(120, Math.min(window.innerHeight * 0.85, window.innerHeight - e.clientY - 52));
    body.style.maxHeight = h + "px";
    body.style.height = h + "px";
    updateBodyPadding();
  });
  window.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
    updateBodyPadding();
  });

  function openDrawer() {
    lab.classList.remove("collapsed");
    $("aiLabCaret").textContent = "▼";
    updateBodyPadding();
    refreshModels(); // re-scan in case Ollama started after page load
  }

  /* ---------------- render ---------------- */
  function statChip(k, v, cls = "") {
    return `<div class="lab-stat"><div class="lab-stat-k">${k}</div><div class="lab-stat-v ${cls}">${v}</div></div>`;
  }

  function renderStats() {
    const s = R.getStats();
    const netCls = s.net > 0 ? "pos" : s.net < 0 ? "neg" : "";
    const roiCls = s.roi > 0 ? "pos" : s.roi < 0 ? "neg" : "";
    const chips = [
      statChip("Rounds", s.rounds),
      statChip("W / L", `${s.wins} / ${s.losses}`),
      statChip("Win rate", (s.winRate * 100).toFixed(0) + "%"),
      statChip("Net", (s.net >= 0 ? "+" : "-") + money(s.net), netCls),
      statChip("ROI", (s.roi * 100).toFixed(1) + "%", roiCls),
      statChip("Avg bet", money(s.avgBet)),
      statChip("Peak", money(s.peak)),
      statChip("Streak W/L", `${s.maxWinStreak}/${s.maxLossStreak}`),
      statChip("Avg latency", s.avgLatency ? Math.round(s.avgLatency) + "ms" : "—"),
      statChip("Tool reliab.", s.decisions ? (100 - s.fallbackRate * 100).toFixed(0) + "%" : "—"),
      statChip("Tilt", `${s.tiltEmoji} ${s.tiltShort}`, s.tilt >= 45 ? "neg" : ""),
    ];
    if (s.borrowed > 0) chips.push(statChip("Borrowed", money(s.borrowed), "neg"));
    $("labStats").innerHTML = chips.join("");

    // Per-game win/loss strip
    const games = Object.entries(s.perGame || {});
    $("labGames").innerHTML = games.length
      ? games.map(([g, r]) =>
          `<span><b>${g}</b> ${r.w}W/${r.l}L <span class="${r.net > 0 ? "g-pos" : r.net < 0 ? "g-neg" : ""}">${r.net >= 0 ? "+" : "-"}${money(r.net)}</span></span>`
        ).join("")
      : "";
  }

  /* ---- P&L chart: DPI-crisp area chart with grid, baseline & hover ---- */
  let chartHoverX = null;

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
  function fmtShort(v) {
    return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(v));
  }

  function renderChart() {
    const c = $("aiChart");
    if (!c) return;
    const rounds = R.getRounds();
    const s = R.getStats();
    const cssW = c.clientWidth || 280, cssH = 156;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (rounds.length < 2) {
      ctx.fillStyle = "rgba(139,150,172,0.55)";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("P&L — start a session to chart the bankroll", cssW / 2, cssH / 2 + 4);
      return;
    }

    const padL = 42, padR = 10, padT = 12, padB = 8;
    const vals = [s.start, ...rounds.map((r) => r.balance)];
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 1) { max += 1; min -= 1; }
    const span = max - min;
    min -= span * 0.1; max += span * 0.1;
    const x = (i) => padL + (i / (vals.length - 1)) * (cssW - padL - padR);
    const y = (v) => padT + (1 - (v - min) / (max - min)) * (cssH - padT - padB);

    // horizontal grid with $ labels
    const step = niceStep((max - min) / 3);
    ctx.font = "9.5px Inter, sans-serif";
    ctx.textAlign = "left";
    for (let gv = Math.ceil(min / step) * step; gv <= max; gv += step) {
      ctx.strokeStyle = "rgba(35,46,70,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y(gv)); ctx.lineTo(cssW - padR, y(gv)); ctx.stroke();
      ctx.fillStyle = "#5c6880";
      ctx.fillText("$" + fmtShort(gv), 4, y(gv) + 3);
    }

    // starting-balance baseline (gold, dashed)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(230,193,90,0.5)";
    ctx.beginPath(); ctx.moveTo(padL, y(s.start)); ctx.lineTo(cssW - padR, y(s.start)); ctx.stroke();
    ctx.setLineDash([]);

    const up = s.net >= 0;
    const col = up ? "#3ecf8e" : "#ef4d6a";

    // gradient area fill under the line
    const grad = ctx.createLinearGradient(0, padT, 0, cssH - padB);
    grad.addColorStop(0, up ? "rgba(62,207,142,0.26)" : "rgba(239,77,106,0.26)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.lineTo(x(vals.length - 1), cssH - padB);
    ctx.lineTo(x(0), cssH - padB);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // the line itself
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke();

    // endpoint dot + current balance tag
    const li = vals.length - 1, lx = x(li), ly = y(vals[li]);
    ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    const tag = "$" + fmt(vals[li]);
    ctx.font = "700 10px Inter, sans-serif";
    const tw = ctx.measureText(tag).width + 10;
    const tx = Math.min(lx + 6, cssW - padR - tw), ty = Math.max(padT, ly - 18);
    ctx.fillStyle = "rgba(8,11,18,0.85)";
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, 15, 4); ctx.fill();
    ctx.fillStyle = col; ctx.textAlign = "left";
    ctx.fillText(tag, tx + 5, ty + 11);

    // hover crosshair with round + balance readout
    if (chartHoverX != null && chartHoverX >= padL && chartHoverX <= cssW - padR) {
      const i = Math.max(0, Math.min(vals.length - 1,
        Math.round(((chartHoverX - padL) / (cssW - padL - padR)) * (vals.length - 1))));
      const hx = x(i), hy = y(vals[i]);
      ctx.strokeStyle = "rgba(139,150,172,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, cssH - padB); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#eaeef7"; ctx.fill();
      const label = (i === 0 ? "start" : "round " + i) + " · $" + fmt(vals[i]);
      ctx.font = "10px Inter, sans-serif";
      const lw = ctx.measureText(label).width + 12;
      const bx = Math.max(padL, Math.min(hx - lw / 2, cssW - padR - lw));
      ctx.fillStyle = "rgba(8,11,18,0.92)";
      ctx.beginPath(); ctx.roundRect(bx, 1, lw, 16, 4); ctx.fill();
      ctx.fillStyle = "#eaeef7"; ctx.textAlign = "left";
      ctx.fillText(label, bx + 6, 12.5);
    }
  }

  function renderLog() {
    const log = R.getLog();
    const box = $("labLog");
    if (!log.length) { box.innerHTML = `<div class="lab-log-empty">Press Start to watch the AI play.</div>`; return; }
    const rows = [];
    for (let i = log.length - 1; i >= 0 && rows.length < 70; i--) {
      const e = log[i];
      if (e.kind === "result") {
        const cls = e.delta > 0 ? "win" : e.delta < 0 ? "lose" : "";
        rows.push(`<div class="lab-log-row result ${cls}">— round ${e.round}: ${e.delta >= 0 ? "+" : "-"}${money(e.delta)} → ${money(e.balance)}</div>`);
      } else if (e.kind === "loan") {
        rows.push(`<div class="lab-log-row sys loan">💸 ${e.label} +${money(e.amount)}${e.reason ? ` — “${e.reason}”` : ""}</div>`);
      } else if (e.kind === "break") {
        rows.push(`<div class="lab-log-row sys">☕ Break ${e.phase}${e.actualMs ? ` (${Math.round(e.actualMs / 1000)}s)` : ""}</div>`);
      } else if (e.kind === "session") {
        rows.push(`<div class="lab-log-row sys">${e.phase === "start" ? "▶ Session started" : `⏹ Session stopped — ${e.trigger}`}</div>`);
      } else { // move
        const betStr = e.bets
          ? e.bets.map((b) => `${b.spot}:${b.amount}`).join(" ")
          : Object.entries(e.detail || {}).map(([k, v]) => `${k}:${v}`).join(" ");
        const lat = e.fallback ? `<span class="lab-badge fb">fallback</span>` : (e.latencyMs ? `<span class="lab-badge">${e.latencyMs}ms</span>` : "");
        rows.push(
          `<div class="lab-log-row move">
             <span class="lab-log-a">#${e.round} ${e.game} · <b>${e.action}</b> ${betStr}</span> ${lat}
             ${e.reason ? `<span class="lab-log-r">“${e.reason}”</span>` : ""}
           </div>`
        );
      }
    }
    box.innerHTML = rows.join("");
  }

  function renderButtons() {
    const running = R.isRunning();
    const labRun = $("labRun");
    labRun.textContent = running ? "⏹ Stop" : "🤖 Start";
    labRun.classList.toggle("ai-running", running);
    const badge = $("aiLabLive");
    badge.textContent = running ? "live" : "idle";
    badge.classList.toggle("live", running);
    // Live P&L pill in the handle
    const s = R.getStats();
    const pnl = $("labPnl");
    pnl.textContent = (s.net >= 0 ? "+" : "-") + money(s.net);
    pnl.className = "ai-lab-pnl " + (s.net > 0 ? "pos" : s.net < 0 ? "neg" : "");
    // "New game" only applies while the AI is roaming (running + agentic).
    const newGameBtn = $("labNewGame");
    if (newGameBtn) newGameBtn.disabled = !(running && R.settings.agentic);
    // Compute (CPU/GPU) is locked while running — only changeable between sessions.
    const seg = $("computeSeg");
    if (seg) {
      seg.classList.toggle("locked", running);
      seg.querySelectorAll("button").forEach((b) => (b.disabled = running));
    }
    const panelBtn = document.getElementById("aiPlayBtn");
    if (panelBtn) {
      panelBtn.textContent = running ? "⏹ Stop AI" : "🤖 Let AI play";
      panelBtn.classList.toggle("ai-running", running);
    }
  }

  // ---- Embedded system monitor (polls the local /api/sysmon from serve.py) ----
  function gb(bytes) { return (bytes / 1073741824); }
  function bar(label, frac, color) {
    const pct = Math.max(0, Math.min(100, frac * 100));
    return `<div class="sys-row">
      <span class="sys-k">${label}</span>
      <div class="sys-bar"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></div>
      <span class="sys-v">${pct.toFixed(0)}%</span>
    </div>`;
  }
  function renderSys(d) {
    const box = $("labSys");
    const dot = $("sysDot");
    if (!box) return;
    if (!d || !d.available) {
      if (dot) dot.className = "sys-dot";
      box.innerHTML = `<div class="sys-off">Live CPU / GPU / power shows here when the monitor is running.
        Launch via <code>START-HERE.command</code>, or if you serve the site yourself just double-click
        <code>MONITOR.command</code>.</div>`;
      return;
    }
    if (dot) dot.className = "sys-dot on";
    const ramU = gb(d.ram_used), ramT = gb(d.ram_total);
    const toF = (c) => Math.round(c * 9 / 5 + 32);
    box.innerHTML =
      bar("CPU", d.cpu, "var(--blue)") +
      bar("GPU", d.gpu, "var(--purple)") +
      `<div class="sys-tiles">
        <div><b>${d.power.toFixed(1)}<small>W</small></b><span>package</span></div>
        <div><b>${ramU.toFixed(1)}<small>/${ramT.toFixed(0)}G</small></b><span>RAM</span></div>
        <div><b>${toF(d.cpu_temp)}<small>°F</small></b><span>CPU temp</span></div>
        <div><b>${toF(d.gpu_temp)}<small>°F</small></b><span>GPU temp</span></div>
      </div>`;
  }
  async function tryFetchSys(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch (e) { /* endpoint not there */ }
    return null;
  }
  async function fetchSys() {
    // Same-origin (serve.py) first, then the dedicated monitor port (MONITOR.command).
    let d = await tryFetchSys("/api/sysmon");
    if (!d || !d.available) {
      const alt = await tryFetchSys("http://localhost:11435/api/sysmon");
      if (alt) d = alt;
    }
    renderSys(d || { available: false });
  }
  fetchSys();
  setInterval(() => { if (!document.hidden) fetchSys(); }, 2000);

  // chart hover crosshair
  const chartEl = $("aiChart");
  chartEl.addEventListener("mousemove", (e) => {
    chartHoverX = e.clientX - chartEl.getBoundingClientRect().left;
    renderChart();
  });
  chartEl.addEventListener("mouseleave", () => { chartHoverX = null; renderChart(); });

  function render() {
    renderStats(); renderChart(); renderLog(); renderButtons();
    if (!lab.classList.contains("collapsed")) updateBodyPadding();
  }
  R.setOnUpdate(render);

  /* ---------------- per-game panel button + drawer visibility ---------------- */
  function injectPanelButton(id) {
    const panels = view.querySelectorAll(".panel");
    if (panels.length < 2) return;
    const controls = panels[1];
    if (controls.querySelector("#aiPlayBar")) return;
    const bar = Casino.el("div", "ai-bar");
    bar.id = "aiPlayBar";
    bar.innerHTML = `<button class="btn ai-btn" id="aiPlayBtn">🤖 Let AI play</button>
      <div class="ai-status">Opens the AI Lab below · model set there</div>`;
    controls.appendChild(bar);
    bar.querySelector("#aiPlayBtn").addEventListener("click", () => { R.toggle(id); openDrawer(); });
    renderButtons();
  }

  function injectHeroButton() {
    const actions = view.querySelector(".hero-actions");
    if (!actions || document.getElementById("aiHeroBtn")) return;
    const b = Casino.el("button", "btn ai-btn");
    b.id = "aiHeroBtn";
    b.textContent = "🤖 Let AI free-roam";
    b.style.flex = "0 0 auto";
    b.addEventListener("click", () => {
      R.settings.agentic = true;
      $("agentic").checked = true;
      if (!R.isRunning()) R.play(null);
      openDrawer();
    });
    actions.appendChild(b);
  }

  function syncVisibility() {
    lab.classList.remove("hidden"); // AI Lab is a global control — visible everywhere
    const id = R.currentGameId();
    if (R.hasAdapter(id)) injectPanelButton(id);
    else injectHeroButton(); // lobby
  }

  const observer = new MutationObserver(syncVisibility);
  observer.observe(view, { childList: true, subtree: true });
  window.addEventListener("hashchange", syncVisibility);
  syncVisibility();
  render();
  updateBodyPadding();
  refreshModels();
})();
