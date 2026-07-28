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
  const fx = Casino.fx;

  /* agent-ui.js expresses tilt as an emoji in its stats. We never change that
     (it is agent state), we just translate it for display. */
  const TILT_ICON = {
    "\u{1F60E}": "snowflake",   // ice cold
    "\u{1F642}": "smile",       // steady
    "\u{1F624}": "flame",       // tilted
    "\u{1F92C}": "triangle-alert", // full tilt
    "\u{1F9CA}": "snowflake",   // emotions off
  };

  /* Tilt/emotions meter. Rendered in two places (control deck + HUD) with
     an id prefix so both can be updated from the same state. */
  function tiltMeterHTML(p) {
    return `
      <div class="tilt-meter" id="${p}Tilt">
        <div class="tilt-head">
          <span class="tilt-face" id="${p}TiltFace">${Casino.icon("snowflake")}</span>
          <span class="tilt-name" id="${p}TiltName">Ice cold</span>
          <span class="tilt-num" id="${p}TiltNum">0</span>
        </div>
        <div class="tilt-bar" id="${p}TiltBar"><i id="${p}TiltFill"></i></div>
        <div class="tilt-scale"><span>Ice</span><span>Steady</span><span>Tilted</span><span>Full</span></div>
      </div>`;
  }

  /* Telemetry deck. Built ONCE so CountUp.js owns stable value nodes —
     rebuilding innerHTML every tick would kill the counter animation. */
  const STATS = [
    { k: "rounds",   label: "Rounds",      num: true,  get: (s) => s.rounds,                  f: (v) => fmt(v) },
    { k: "wl",       label: "W / L",       num: false, get: (s) => `${s.wins} / ${s.losses}` },
    { k: "winrate",  label: "Win rate",    num: true,  get: (s) => s.winRate * 100,           f: (v) => v.toFixed(0) + "%" },
    { k: "net",      label: "Net",         num: true,  get: (s) => s.net,                     f: (v) => (v >= 0 ? "+" : "-") + money(v),
      cls: (s) => (s.net > 0 ? "pos" : s.net < 0 ? "neg" : "") },
    { k: "roi",      label: "ROI",         num: true,  get: (s) => s.roi * 100,               f: (v) => v.toFixed(1) + "%",
      cls: (s) => (s.roi > 0 ? "pos" : s.roi < 0 ? "neg" : "") },
    { k: "avgbet",   label: "Avg bet",     num: true,  get: (s) => s.avgBet,                  f: (v) => money(v) },
    { k: "peak",     label: "Peak",        num: true,  get: (s) => s.peak,                    f: (v) => money(v) },
    { k: "streak",   label: "Streak W/L",  num: false, get: (s) => `${s.maxWinStreak}/${s.maxLossStreak}` },
    { k: "latency",  label: "Avg latency", num: true,  get: (s) => s.avgLatency || 0,         f: (v) => (v ? Math.round(v) + "ms" : "—") },
    { k: "tool",     label: "Tool reliab.",num: true,  get: (s) => (s.decisions ? 100 - s.fallbackRate * 100 : -1),
      f: (v) => (v < 0 ? "—" : v.toFixed(0) + "%") },
    { k: "tilt",     label: "Tilt",        num: false, get: (s) => s.tiltShort,
      cls: (s) => (s.tilt >= 45 ? "neg" : "") },
    { k: "borrowed", label: "Borrowed",    num: true,  get: (s) => s.borrowed,                f: (v) => money(v),
      cls: () => "neg", hide: (s) => !(s.borrowed > 0) },
  ];

  /* ---------------- build the drawer once ---------------- */
  const lab = document.createElement("div");
  lab.id = "aiLab";
  lab.className = "ai-lab collapsed hidden";
  lab.innerHTML = `
    <div class="ai-lab-resizer" id="aiLabResizer" title="Drag to resize"></div>
    <div class="ai-lab-handle" id="aiLabHandle">
      <span class="ai-lab-title">${Casino.icon("bot")} AI Lab</span>
      <span class="ai-lab-badge" id="aiLabLive">idle</span>
      <span class="ai-lab-pnl" id="labPnl">±$0</span>
      <span class="ai-lab-live" id="aiStatus">ready</span>
      <span class="ai-lab-caret" id="aiLabCaret">${Casino.icon("chevron-up")}</span>
    </div>
    <div class="ai-lab-body">
      <div class="ai-lab-col">
        <div class="lab-sec">Behavior</div>
        <div class="lab-row">
          <label>Aggression <b id="aggrVal">15%</b> <span class="lab-hint" id="aggrLabel">cautious</span>
            <button class="lab-info" type="button" data-tip="Sets the bet-size hint the AI is fed each round (aggression × current bankroll). Higher = it's nudged to wager a bigger slice of its stack. It's guidance, not a hard rule — a tilted degenerate can still defy it.">${Casino.icon("info")}</button>
          </label>
          <input type="range" id="aggr" min="0" max="100" value="15" class="lab-slider">
        </div>
        <div class="lab-row">
          <label>Move speed <b id="speedVal">700ms delay</b>
            <button class="lab-info" type="button" data-tip="Pure pacing — the pause between the AI's moves so you can watch. It does NOT change how the model thinks or plays; it only slows down or speeds up the action on screen.">${Casino.icon("info")}</button>
          </label>
          <input type="range" id="speed" min="0" max="1500" step="50" value="700" class="lab-slider">
        </div>
        <div class="lab-row brain-dial">
          <label>Brainpower <b id="brainVal">Sharp · 224 tokens</b>
            <button class="lab-info" type="button" data-tip="How much the model may think per decision. Left = fewer tokens + hotter sampling → fast, cheap gut calls (may occasionally misfire, the fallback covers it). Right = more tokens + cooler sampling → slower, more deliberate, better reasoning. Same model throughout — you're changing how hard it thinks, not swapping brains.">${Casino.icon("info")}</button>
          </label>
          <div class="brain-track"><i></i><i></i><i></i></div>
          <input type="range" id="brainSlider" min="0" max="100" value="50" class="lab-slider">
          <div class="brain-stages" id="brainStages">
            <button type="button" class="brain-stage" data-brain="0">${Casino.icon("rabbit")} Instinct<small>64 tok</small></button>
            <button type="button" class="brain-stage on" data-brain="50">${Casino.icon("gauge")} Sharp<small>224 tok</small></button>
            <button type="button" class="brain-stage" data-brain="100">${Casino.icon("brain")} Deep<small>768 tok</small></button>
          </div>
        </div>
        <div class="lab-row">
          <label>Compute
            <button class="lab-info" type="button" data-tip="Where inference runs. On Apple Silicon the model uses the GPU (Metal) by default — much faster and cooler; keep it here normally. CPU forces processor-only inference: slower and hotter, but you can watch the CPU cores light up in the System monitor above. Locked while the AI is running — change it, then Start (or restart) to apply.">${Casino.icon("info")}</button>
          </label>
          <div class="lab-seg2" id="computeSeg">
            <button type="button" data-compute="gpu" class="on">${Casino.icon("zap")} GPU <small>(Metal)</small></button>
            <button type="button" data-compute="cpu">${Casino.icon("cpu")} CPU</button>
          </div>
        </div>
        <div class="lab-row">
          <label class="lab-switch" style="margin:0;">
            <input type="checkbox" id="emotions" checked><span>${Casino.icon("flame")} Emotions (tilt)</span>
            <button class="lab-info" type="button" data-tip="ON: losses build 'tilt' and wins cool it, and that emotion drives how hard it presses and chases — the full degenerate. OFF: cold-blooded, steady bet-sizing with no tilt swings. Either way it still talks plenty of trash in its reasoning.">${Casino.icon("info")}</button>
          </label>
          ${tiltMeterHTML("lab")}
        </div>
        <div class="lab-row-2">
          <div><label>Model
            <button class="lab-info" type="button" data-tip="The Ollama model that makes the decisions. This list is your locally-installed models (auto-detected). qwen2.5:7b is recommended — it's reliable at the structured tool-calls this app needs. Bigger models reason better but use more tokens and run slower; smaller ones are faster but rougher.">${Casino.icon("info")}</button>
            <button class="lab-mini" type="button" id="modelRefresh" title="Re-scan installed Ollama models">${Casino.icon("refresh-cw")}</button>
          </label>
          <span class="lab-select"><select class="lab-input" id="modelSelect"></select></span></div>
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
          <button class="btn ai-btn" id="labRun">${Casino.icon("play")} Start</button>
          <button class="btn btn-red btn-sm" id="labReport">${Casino.icon("square")} Stop &amp; Report</button>
          <button class="btn btn-ghost btn-sm" id="labNewGame" title="Make the roaming AI switch to a different game (Agentic mode)">${Casino.icon("shuffle")} New game</button>
          <button class="btn btn-ghost btn-sm" id="labReset">Reset</button>
          <button class="btn btn-ghost btn-sm" id="labClear">Clear log</button>
          <button class="btn btn-ghost btn-sm" id="labJSON">JSON</button>
          <button class="btn btn-ghost btn-sm" id="labCSV">CSV</button>
          <button class="btn btn-ghost btn-sm" data-nav="aiguide" title="Full documentation of how the AI works">${Casino.icon("book-open")} Guide</button>
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
    syncHudVisibility(); // the HUD floats just above the dock — keep it clear
  }

  $("aiLabHandle").addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    lab.classList.toggle("collapsed");
    $("aiLabCaret").innerHTML = Casino.icon(lab.classList.contains("collapsed") ? "chevron-up" : "chevron-down");
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
    const s = R.getStats();
    renderTilt("lab", s); renderTilt("hud", s);
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
    const zone = v < 33 ? "Instinct" : v < 67 ? "Sharp" : "Deep";
    return { tokens, temp, zone };
  }
  /* One source of truth for the dial: the range input still drives
     R.setBrain() exactly as before; the three stage buttons are just a
     nicer way to hit 0 / 50 / 100 on the same input. */
  function applyBrain(v) {
    const b = brainFromDial(v);
    $("brainVal").textContent = `${b.zone} · ${b.tokens} tokens`;
    $("brainStages").querySelectorAll("[data-brain]").forEach((btn) => {
      const stage = v < 33 ? 0 : v < 67 ? 50 : 100;
      btn.classList.toggle("on", Number(btn.dataset.brain) === stage);
    });
    R.setBrain(b.tokens, b.temp, b.zone);
  }
  $("brainSlider").addEventListener("input", (e) => applyBrain(Number(e.target.value)));
  $("brainStages").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-brain]");
    if (!btn) return;
    const v = Number(btn.dataset.brain);
    $("brainSlider").value = v;
    applyBrain(v);
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
  /* Shared control functions — the drawer buttons AND the in-game HUD's
     Quick Actions both call these, so there is exactly one code path. */
  function toggleRun() {
    if (R.isRunning()) { R.stop(); return; }
    const id = R.currentGameId();
    if (R.settings.agentic || R.hasAdapter(id)) { R.play(id); openDrawer(); }
    else Casino.toast("Open a game first, or turn on Agentic mode.", "info");
  }
  function newGame() { R.forceNewGame(); }
  function stopAndReport() { R.stopAndReport(); openDrawer(); }

  $("labReport").addEventListener("click", stopAndReport);
  $("labNewGame").addEventListener("click", newGame);
  $("labRun").addEventListener("click", toggleRun);
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
    $("aiLabCaret").innerHTML = Casino.icon("chevron-down");
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
    $("aiLabCaret").innerHTML = Casino.icon("chevron-down");
    updateBodyPadding();
    refreshModels(); // re-scan in case Ollama started after page load
  }
  function toggleDrawer() {
    if (lab.classList.contains("collapsed")) openDrawer();
    else { lab.classList.add("collapsed"); $("aiLabCaret").innerHTML = Casino.icon("chevron-up"); updateBodyPadding(); }
  }
  // Let the sidebar (app.js) open the Lab without knowing anything about it.
  window.RoyalLab = { open: openDrawer, toggle: toggleDrawer, showHud: () => { hudDismissed = false; renderHud(); } };

  /* ============================================================
     Live Agent HUD — glassmorphic in-game overlay
     ------------------------------------------------------------
     Presentation only. It renders RoyalAgent's existing state
     (log / stats / settings) and its Quick Actions call the SAME
     control functions as the drawer. It adds no decision logic and
     never touches the elements the game adapters read.
     ============================================================ */
  const hud = document.createElement("div");
  hud.className = "agent-hud";
  hud.id = "agentHud";
  hud.innerHTML = `
    <div class="hud-head">
      <span class="hud-orb"></span>
      <span class="hud-title">AI is playing</span>
      <span class="hud-game" id="hudGame">—</span>
      <button class="hud-x" id="hudHide" title="Hide the HUD for this run">${Casino.icon("x")}</button>
    </div>
    <div class="hud-think">
      <div class="hud-think-k"><i></i> AI thinking</div>
      <div id="hudLines"><div class="hud-empty">Waiting for the first decision…</div></div>
    </div>
    <div class="hud-metrics">
      <div class="hud-metric"><span>Latency</span><b id="hudLat">—</b></div>
      <div class="hud-metric"><span>Tool ok</span><b id="hudTool">—</b></div>
      <div class="hud-metric"><span>Net</span><b id="hudNet">$0</b></div>
    </div>
    <div class="hud-tilt">${tiltMeterHTML("hud")}</div>
    <div class="hud-actions">
      <button class="btn ai-btn btn-sm" id="hudRun">${Casino.icon("square")} Stop</button>
      <button class="btn btn-ghost btn-sm" id="hudNew" title="Roam to a different table">${Casino.icon("shuffle")} New</button>
      <button class="btn btn-ghost btn-sm" id="hudDeck" title="Open the control deck">${Casino.icon("settings-2")} Deck</button>
    </div>`;
  document.body.appendChild(hud);

  let hudDismissed = false;
  let hudWasRunning = false;

  $("hudHide").addEventListener("click", () => { hudDismissed = true; renderHud(); });
  $("hudRun").addEventListener("click", toggleRun);
  $("hudNew").addEventListener("click", newGame);
  $("hudDeck").addEventListener("click", openDrawer);

  const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

  /* Keep the HUD sitting just above the dock — the dock is resizable, so this
     is recomputed rather than hard-coded. If the dock is opened so tall that
     the HUD no longer fits on screen, stand down: the deck shows everything
     the HUD does, so there's nothing to lose. */
  function positionHud() {
    const dockH = lab.classList.contains("hidden") ? 0
      : lab.classList.contains("collapsed") ? 52 : lab.offsetHeight;
    hud.style.bottom = (dockH + 14) + "px";
    return window.innerHeight - dockH - 14 >= 300;
  }

  /* Cheap enough to call on every resize/drag frame — no DOM rebuilding. */
  function syncHudVisibility() {
    const fits = positionHud();
    hud.classList.toggle("show", R.isRunning() && !hudDismissed && fits);
  }

  function renderHud() {
    const running = R.isRunning();
    if (running && !hudWasRunning) hudDismissed = false; // a new run always shows it
    hudWasRunning = running;
    syncHudVisibility();
    if (!running && hudDismissed) return;

    const s = R.getStats();
    $("hudGame").textContent = titleCase(R.currentGameId()) || "Lobby";

    // Reasoning stream — the 4 most recent decisions, newest first.
    const moves = R.getLog().filter((e) => e.kind !== "result" && e.kind !== "session" && e.kind !== "break" && e.action);
    const recent = moves.slice(-4).reverse();
    $("hudLines").innerHTML = recent.length
      ? recent.map((e, i) =>
          `<div class="hud-line ${i === 0 ? "now" : ""}">
             <b>${e.action}</b>${e.game ? ` · ${e.game}` : ""}
             ${e.reason ? `<em>“${e.reason}”</em>` : ""}
           </div>`).join("")
      : `<div class="hud-empty">Waiting for the first decision…</div>`;

    const last = recent[0];
    $("hudLat").textContent = last && last.latencyMs ? last.latencyMs + "ms"
      : s.avgLatency ? Math.round(s.avgLatency) + "ms" : "—";
    $("hudTool").textContent = s.decisions ? (100 - s.fallbackRate * 100).toFixed(0) + "%" : "—";
    const net = $("hudNet");
    net.textContent = (s.net >= 0 ? "+" : "-") + money(s.net);
    net.className = s.net > 0 ? "pos" : s.net < 0 ? "neg" : "";

    const runBtn = $("hudRun");
    runBtn.innerHTML = Casino.icon(running ? "square" : "play") + (running ? " Stop" : " Start");
    runBtn.classList.toggle("ai-running", running);
    $("hudNew").disabled = !(running && R.settings.agentic);
  }

  /* ---------------- render ---------------- */
  /* Telemetry tiles are created once; values are then animated in place with
     CountUp.js (via Casino.fx.countTo), which needs a stable element. */
  const statNodes = {};
  const statPrev = {};

  function buildStats() {
    const box = $("labStats");
    if (!box || box.dataset.built) return;
    box.dataset.built = "1";
    box.innerHTML = STATS.map((d) =>
      `<div class="lab-stat" data-stat="${d.k}">
         <div class="lab-stat-k">${d.label}</div>
         <div class="lab-stat-v">—</div>
       </div>`).join("");
    STATS.forEach((d) => {
      const tile = box.querySelector(`[data-stat="${d.k}"]`);
      statNodes[d.k] = { tile, val: tile.querySelector(".lab-stat-v") };
    });
  }

  function renderStats() {
    buildStats();
    const s = R.getStats();

    STATS.forEach((d) => {
      const n = statNodes[d.k];
      if (!n) return;
      const hidden = d.hide ? d.hide(s) : false;
      n.tile.classList.toggle("hide", hidden);
      if (hidden) return;

      const cls = d.cls ? d.cls(s) : "";
      n.val.className = "lab-stat-v " + cls;
      n.tile.classList.remove("pos", "neg");
      if (cls) n.tile.classList.add(cls);

      const raw = d.get(s);
      if (d.num) {
        const to = Number(raw) || 0;
        const from = statPrev[d.k] === undefined ? to : statPrev[d.k];
        statPrev[d.k] = to;
        fx.countTo(n.val, from, to, d.f);
      } else {
        n.val.textContent = raw;
      }
    });

    renderTilt("lab", s);
    renderTilt("hud", s);

    // Per-game win/loss strip
    const games = Object.entries(s.perGame || {});
    $("labGames").innerHTML = games.length
      ? games.map(([g, r]) =>
          `<span><b>${g}</b> ${r.w}W/${r.l}L <span class="${r.net > 0 ? "g-pos" : r.net < 0 ? "g-neg" : ""}">${r.net >= 0 ? "+" : "-"}${money(r.net)}</span></span>`
        ).join("")
      : "";
  }

  /* Animated tilt/emotions bar — Ice Cold -> Steady -> Tilted -> Full Tilt.
     Reads the same tilt value the agent feeds into every prompt. */
  function renderTilt(p, s) {
    const wrap = $(p + "Tilt");
    if (!wrap) return;
    const on = R.settings.emotions !== false;
    const t = Math.max(0, Math.min(100, Number(s.tilt) || 0));
    wrap.classList.toggle("off", !on);
    // agent-ui reports tilt as an emoji; map it to an icon here so the
    // agent's own state stays untouched but the chrome stays emoji-free.
    $(p + "TiltFace").innerHTML = Casino.icon(on ? TILT_ICON[s.tiltEmoji] || "snowflake" : "snowflake");
    $(p + "TiltName").textContent = on ? (s.tiltShort || "Ice cold") : "Cold-blooded";
    $(p + "TiltNum").textContent = on ? t.toFixed(0) : "off";
    $(p + "TiltFill").style.width = (on ? t : 0) + "%";
    $(p + "TiltBar").classList.toggle("hot", on && t >= 70);
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
      ctx.fillStyle = "rgba(135,146,168,0.55)";
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
      ctx.strokeStyle = "rgba(35,45,64,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y(gv)); ctx.lineTo(cssW - padR, y(gv)); ctx.stroke();
      ctx.fillStyle = "#58627a";
      ctx.fillText("$" + fmtShort(gv), 4, y(gv) + 3);
    }

    // starting-balance baseline (gold, dashed)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(240,194,79,0.5)";
    ctx.beginPath(); ctx.moveTo(padL, y(s.start)); ctx.lineTo(cssW - padR, y(s.start)); ctx.stroke();
    ctx.setLineDash([]);

    const up = s.net >= 0;
    const col = up ? "#22e59a" : "#ff4d6d";

    // gradient area fill under the line
    const grad = ctx.createLinearGradient(0, padT, 0, cssH - padB);
    grad.addColorStop(0, up ? "rgba(34,229,154,0.30)" : "rgba(255,77,109,0.30)");
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
    ctx.fillStyle = "rgba(5,7,12,0.88)";
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, 15, 4); ctx.fill();
    ctx.fillStyle = col; ctx.textAlign = "left";
    ctx.fillText(tag, tx + 5, ty + 11);

    // hover crosshair with round + balance readout
    if (chartHoverX != null && chartHoverX >= padL && chartHoverX <= cssW - padR) {
      const i = Math.max(0, Math.min(vals.length - 1,
        Math.round(((chartHoverX - padL) / (cssW - padL - padR)) * (vals.length - 1))));
      const hx = x(i), hy = y(vals[i]);
      ctx.strokeStyle = "rgba(135,146,168,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, cssH - padB); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#eaf0fa"; ctx.fill();
      const label = (i === 0 ? "start" : "round " + i) + " · $" + fmt(vals[i]);
      ctx.font = "10px Inter, sans-serif";
      const lw = ctx.measureText(label).width + 12;
      const bx = Math.max(padL, Math.min(hx - lw / 2, cssW - padR - lw));
      ctx.fillStyle = "rgba(5,7,12,0.94)";
      ctx.beginPath(); ctx.roundRect(bx, 1, lw, 16, 4); ctx.fill();
      ctx.fillStyle = "#eaf0fa"; ctx.textAlign = "left";
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
        rows.push(`<div class="lab-log-row sys loan">${Casino.icon("banknote")} ${e.label} +${money(e.amount)}${e.reason ? ` — “${e.reason}”` : ""}</div>`);
      } else if (e.kind === "break") {
        rows.push(`<div class="lab-log-row sys">${Casino.icon("coffee")} Break ${e.phase}${e.actualMs ? ` (${Math.round(e.actualMs / 1000)}s)` : ""}</div>`);
      } else if (e.kind === "session") {
        rows.push(`<div class="lab-log-row sys">${e.phase === "start" ? Casino.icon("play") + " Session started" : Casino.icon("square") + ` Session stopped — ${e.trigger}`}</div>`);
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
    labRun.innerHTML = Casino.icon(running ? "square" : "play") + (running ? " Stop" : " Start");
    labRun.classList.toggle("ai-running", running);
    lab.classList.toggle("running", running);
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
      panelBtn.innerHTML = Casino.icon(running ? "square" : "bot") + (running ? " Stop AI" : " Let AI play");
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
    renderStats(); renderChart(); renderLog(); renderButtons(); renderHud();
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
    bar.innerHTML = `<button class="btn ai-btn" id="aiPlayBtn">${Casino.icon("bot")} Let AI play</button>
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
    b.innerHTML = Casino.icon("bot") + " Let AI free-roam";
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
