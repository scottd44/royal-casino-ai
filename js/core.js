/* ============================================================
   Royal Casino — Core (wallet, navigation, helpers)
   ============================================================ */
const Casino = (() => {
  const STORAGE_KEY = "royal_casino_balance_v1";
  const STARTING_BALANCE = 1000;

  let balance = load();

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : STARTING_BALANCE;
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, String(balance));
  }

  function getBalance() { return balance; }

  let shownBalance = balance; // what the wallet is currently displaying

  function renderBalance(dir) {
    const el = document.getElementById("walletAmount");
    if (!el) return;
    // Tick the wallet up/down instead of snapping (CountUp when available).
    fx.countTo(el, shownBalance, balance, fmt);
    shownBalance = balance;

    const pm = document.getElementById("pmBalance");
    if (pm) pm.textContent = fmt(balance);

    if (dir) {
      const chip = document.getElementById("walletChip");
      el.classList.remove("flash-up", "flash-down");
      if (chip) chip.classList.remove("pulse-up", "pulse-down");
      // force reflow so re-adding the class re-triggers the transition
      void el.offsetWidth;
      el.classList.add(dir > 0 ? "flash-up" : "flash-down");
      if (chip) chip.classList.add(dir > 0 ? "pulse-up" : "pulse-down");
      setTimeout(() => {
        el.classList.remove("flash-up", "flash-down");
        if (chip) chip.classList.remove("pulse-up", "pulse-down");
      }, 650);
    }
  }

  /* Attempt to place a bet. Returns true if funds available & deducted. */
  function bet(amount) {
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Enter a valid bet amount.", "info");
      return false;
    }
    if (amount > balance) {
      toast("Not enough cash for that bet.", "lose");
      return false;
    }
    balance -= amount;
    save();
    renderBalance(-1);
    return true;
  }

  /* Pay credits into the wallet (winnings, refunds, cash-out).
     Every game funnels its winnings through here, so this is also where a
     big score triggers a particle burst — no game module needs to know.
     "Big" is judged against the bankroll the win landed on, so it scales
     with the player instead of being a fixed dollar threshold. */
  function payout(amount) {
    amount = Math.round(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const before = balance;
    balance += amount;
    save();
    renderBalance(1);

    const ratio = amount / Math.max(before, 1);
    if (ratio >= 1.5 || amount >= 20000) fx.burst("jackpot");
    else if (ratio >= 0.4 || amount >= 4000) fx.burst("big");
    else if (ratio >= 0.15) fx.burst("cashout");
  }

  /* Direct adjustment without validation (used for add-funds / reset). */
  function setBalance(amount) {
    balance = Math.max(0, Math.round(amount));
    save();
    renderBalance();
  }

  function addFunds(amount) {
    balance += amount;
    save();
    renderBalance(1);
    toast(`+${money(amount)} added (simulated).`, "info");
  }

  function reset() {
    setBalance(STARTING_BALANCE);
    toast("Balance reset to " + money(STARTING_BALANCE) + ".", "info");
  }

  /* ---------- Helpers ---------- */
  function fmt(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  /** Format as dollars, e.g. "$1,250". */
  function money(n) {
    return "$" + fmt(Math.abs(n));
  }

  function randInt(min, max) {
    // inclusive integer in [min, max]
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  /* ---------- Shared "How to play" modal ----------
     Any game can call Casino.openHowTo(title, html) to pop a rules window,
     or drop Casino.helpBtnHTML(id) in its markup and wire the click. */
  let howToOverlay = null;
  function openHowTo(title, html) {
    if (!howToOverlay) {
      howToOverlay = document.createElement("div");
      howToOverlay.className = "report-overlay howto-overlay";
      document.body.appendChild(howToOverlay);
      howToOverlay.addEventListener("click", (e) => { if (e.target === howToOverlay) howToOverlay.classList.remove("show"); });
    }
    howToOverlay.innerHTML =
      `<div class="report-card howto-card">
        <div class="report-head"><h2 class="report-title">${title}</h2>
          <button class="btn btn-ghost btn-sm" data-howto-close>${icon("x")}</button></div>
        <div class="howto-body">${html}</div>
        <div class="report-actions"><button class="btn" data-howto-close>Got it</button></div>
      </div>`;
    howToOverlay.querySelectorAll("[data-howto-close]").forEach((b) => (b.onclick = () => howToOverlay.classList.remove("show")));
    howToOverlay.classList.add("show");
  }
  /** Markup for a small "How to play" button; wire it to openHowTo(...). */
  function helpBtnHTML(id) {
    return `<button class="btn btn-ghost btn-sm howto-btn" id="${id}">${icon("circle-help")} How to play</button>`;
  }

  /* ---------- Icons (Lucide) ----------
     No emoji anywhere in the chrome: emoji are OS-dependent bitmaps that
     can't take our palette and render differently on every machine. Lucide
     ships stroke SVGs that inherit `currentColor`, so an icon is just text
     as far as the design system is concerned.

     `icon(name)` returns a placeholder; Lucide swaps it for an <svg>. Since
     the app rewrites #view with innerHTML constantly, a MutationObserver
     re-runs the swap for markup injected after load. */
  /* Raw inline SVGs for marks no icon set carries. Lucide has no snake and no
     "rock", and guessing the closest name gives you a swimmer and a coffee
     mug — so these are drawn explicitly. Keys are namespaced `rc:` and go
     through the same icon() call sites, so GAMES entries, page titles and the
     sidebar all pick them up with no special casing. */
  const RAW_SVG = {
    "rc:snake": `<svg class="ico %CLS%" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 18c3.4 0 3.4-4.5 6.8-4.5S13.2 18 16.6 18 20 13.5 20 11.5 18.4 8 16.6 8h-4"/>
        <path d="M12.6 8a3 3 0 1 1 3-3"/><circle cx="15.6" cy="4.4" r=".9" fill="currentColor"/></svg>`,
    // Heavy faceted stone — an octagon with interior facets reads as mass
    "rc:rock": `<svg class="ico %CLS%" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 3h8l5 6-9 12L3 9z"/><path d="M8 3 7 9l5 12M16 3l1 6-5 12M3 9h18"/></svg>`,
    "rc:paper": `<svg class="ico %CLS%" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>`,
    "rc:scissors": `<svg class="ico %CLS%" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="18" r="2.6"/>
        <path d="M7.8 16.2 18 3M16.2 16.2 6 3"/></svg>`,
  };

  function icon(name, cls = "") {
    const raw = RAW_SVG[name];
    if (raw) return raw.replace("%CLS%", cls);
    return `<i data-lucide="${name}" class="ico ${cls}"></i>`;
  }

  const icons = (() => {
    let running = false;   // createIcons() mutates the DOM — don't re-enter
    let queued = false;

    function paint() {
      if (!window.lucide || !window.lucide.createIcons || running) return;
      running = true;
      try { window.lucide.createIcons(); } catch (e) { /* icons are cosmetic */ }
      running = false;
    }

    function schedule() {
      if (running || queued) return;
      queued = true;
      // setTimeout, not rAF: rAF can be suspended in a background tab, which
      // would leave placeholders unrendered.
      setTimeout(() => { queued = false; paint(); }, 0);
    }

    if (typeof MutationObserver === "function") {
      new MutationObserver(schedule).observe(document.documentElement, {
        childList: true, subtree: true,
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", paint, { once: true });
    } else paint();

    return paint;
  })();

  /* ---------- Shared bet control ----------
     One standardized bet field used by every game: $-prefixed input with
     attached ½ / 2× / Max segment buttons. Keeps #betInput and [data-bet]
     so the AI adapters and the global click-sound handler keep working. */
  function betFieldHTML(value = 20, label = "Bet amount") {
    return `
      <div class="field">
        <label>${label}</label>
        <div class="bet-group">
          <span class="bet-prefix">$</span>
          <input class="bet-input" id="betInput" type="number" min="1" value="${value}" />
          <div class="bet-seg">
            <button type="button" data-bet="0.5">½</button>
            <button type="button" data-bet="2">2×</button>
            <button type="button" data-bet="max">Max</button>
          </div>
        </div>
      </div>`;
  }

  /* Wire the ½/2×/Max buttons inside `root`. Respects a disabled input
     (games lock the field mid-round). `onChange` runs after a change. */
  function wireBet(root, onChange) {
    root.querySelectorAll("[data-bet]").forEach((b) => {
      b.addEventListener("click", () => {
        const input = root.querySelector("#betInput");
        if (!input || input.disabled) return;
        const m = b.dataset.bet;
        let v = Number(input.value) || 0;
        if (m === "max") v = balance;
        else v = Math.max(1, Math.floor(v * Number(m)));
        input.value = v;
        if (onChange) onChange(v);
      });
    });
  }

  /* ---------- Sound ----------
     Tiny Web Audio synth — no external files (CSP-safe). Generates the kind of
     blips, chimes and thuds you'd hear on an online casino. Muted state persists. */
  const sound = (() => {
    const MUTE_KEY = "royal_casino_muted_v1";
    let ctx = null;
    let muted = localStorage.getItem(MUTE_KEY) === "1";

    function audio() {
      if (muted) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch { return null; }
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    // One shaped tone. Times are seconds relative to now.
    function tone(freq, start, dur, type = "sine", gain = 0.18) {
      const c = audio();
      if (!c) return;
      const t0 = c.currentTime + start;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    // C-major-ish note set for pleasant chimes.
    const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
    const library = {
      click:   () => tone(430, 0, 0.06, "triangle", 0.10),
      tick:    () => tone(880, 0, 0.028, "square", 0.045),
      win:     () => { tone(C5, 0, 0.12, "triangle", 0.16); tone(E5, 0.09, 0.12, "triangle", 0.16); tone(G5, 0.18, 0.22, "triangle", 0.18); },
      bigwin:  () => { [C5, E5, G5, C6].forEach((f, i) => tone(f, i * 0.085, 0.26, "triangle", 0.19)); tone(C6, 0.42, 0.4, "sine", 0.14); },
      cashout: () => { tone(E5, 0, 0.1, "triangle", 0.16); tone(C6, 0.08, 0.2, "triangle", 0.16); },
      lose:    () => { tone(220, 0, 0.18, "sawtooth", 0.12); tone(155, 0.13, 0.32, "sawtooth", 0.12); },
    };

    // Second confetti trigger: games that announce a jackpot or a cash-out via
    // sound get a burst even when the dollar amount is modest (e.g. a small
    // stake on a huge multiplier). fx.burst() throttles the two paths together.
    function celebrate(name) {
      const kind = name === "bigwin" ? "big" : name === "cashout" ? "cashout" : null;
      if (kind) fx.burst(kind);
    }

    function play(name) {
      celebrate(name); // fires even when muted — it's a visual, not a sound
      const fn = library[name];
      if (fn) { try { fn(); } catch (e) { /* audio not available — silent */ } }
    }
    function toggleMute() {
      muted = !muted;
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      return muted;
    }
    return { play, toggleMute, isMuted: () => muted };
  })();

  /* ---------- Cheat / rigged odds (play-money sandbox) ----------
     A global switch that biases game outcomes in the PLAYER's favor so the
     bankroll (and the AI) climbs. `cheat.win()` returns true when a game
     should force a favorable result this outcome; `strength` is the chance of
     that per outcome (persisted). Off by default. */
  const cheat = (() => {
    const ON_KEY = "royal_casino_cheat_v1";
    const STR_KEY = "royal_casino_cheat_strength_v1";
    let enabled = localStorage.getItem(ON_KEY) === "1";
    let strength = 0.62; // recommended default (see setStrength)
    const saved = Number(localStorage.getItem(STR_KEY));
    if (Number.isFinite(saved) && saved > 0 && saved <= 1) strength = saved;
    return {
      isOn: () => enabled,
      getStrength: () => strength,
      setStrength(v) {
        strength = Math.max(0, Math.min(1, Number(v) || 0));
        localStorage.setItem(STR_KEY, String(strength));
      },
      set(on) { enabled = !!on; localStorage.setItem(ON_KEY, enabled ? "1" : "0"); },
      toggle() { enabled = !enabled; localStorage.setItem(ON_KEY, enabled ? "1" : "0"); return enabled; },
      /** True when this outcome should be forced in the player's favor. */
      win() { return enabled && Math.random() < strength; },
    };
  })();

  /* ---------- FX ----------
     Thin, defensive wrappers over the vendored libraries in js/vendor/
     (GSAP, CountUp.js, canvas-confetti). Every helper degrades to a
     no-op / instant value if its library isn't present, so the app still
     runs with the vendor <script> tags removed. Honours the OS
     "reduce motion" setting. See DEVELOPMENT_GUIDE.md. */
  const fx = (() => {
    const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => !!(mq && mq.matches);
    const CountUpCtor = () => (window.countUp && window.countUp.CountUp) || null;

    /* Every countTo stamps the element with a token. A later countTo on the
       same element bumps it, so a stale watchdog can never overwrite a newer
       animation's target. */
    let countToken = 0;

    /** Tick `el` from `from` to `to`. `format` renders the number. */
    function countTo(el, from, to, format = fmt) {
      if (!el) return;
      const C = CountUpCtor();
      const diff = Math.abs(to - from);
      const mine = (el.__fxCount = ++countToken);

      if (!C || reduced() || diff < 1 || diff > 5_000_000) {
        el.textContent = format(to);
        return;
      }
      const duration = Math.min(1.1, 0.28 + Math.log10(diff + 1) * 0.22);
      let cu;
      try {
        cu = new C(el, to, {
          startVal: from,
          duration,
          useEasing: true,
          separator: ",",
          formattingFn: format,
        });
        if (cu.error) { el.textContent = format(to); return; }
        cu.start();
      } catch { el.textContent = format(to); return; }

      /* A stalled counter would leave a WRONG number on screen (e.g. "+$89"
         for a $750 result), so this is a correctness guarantee, not polish:
         once the animation should be over, snap to the true value.
         The pending frame must be cancelled first — otherwise CountUp's next
         tick simply overwrites whatever we just wrote. */
      setTimeout(() => {
        if (el.__fxCount !== mine) return; // superseded by a newer count
        const target = format(to);
        if (el.textContent === target) return;
        try { if (cu.rAF) cancelAnimationFrame(cu.rAF); } catch (e) { /* older build */ }
        el.textContent = target;
      }, duration * 1000 + 350);
    }

    /** Confetti burst. kind: "big" | "cashout" | "jackpot".
        Throttled here rather than at the call sites, because both payout()
        and the celebration sounds can fire for the same win. */
    let lastBurst = 0;
    function burst(kind = "cashout") {
      if (typeof window.confetti !== "function" || reduced()) return;
      const now = Date.now();
      if (now - lastBurst < 700) return;
      lastBurst = now;
      const gold = ["#f0c24f", "#ffdc86", "#ab7f16"];
      const neon = ["#22e59a", "#a97bff", "#4d8cff", "#f0c24f"];
      try {
        if (kind === "jackpot") {
          window.confetti({ particleCount: 160, spread: 100, startVelocity: 52, origin: { y: 0.62 }, colors: neon, disableForReducedMotion: true });
          setTimeout(() => window.confetti({ particleCount: 90, angle: 60, spread: 66, origin: { x: 0, y: 0.7 }, colors: gold, disableForReducedMotion: true }), 130);
          setTimeout(() => window.confetti({ particleCount: 90, angle: 120, spread: 66, origin: { x: 1, y: 0.7 }, colors: gold, disableForReducedMotion: true }), 200);
        } else if (kind === "big") {
          window.confetti({ particleCount: 110, spread: 78, startVelocity: 44, origin: { y: 0.65 }, colors: neon, disableForReducedMotion: true });
        } else {
          window.confetti({ particleCount: 46, spread: 58, startVelocity: 34, scalar: 0.85, origin: { y: 0.68 }, colors: gold, disableForReducedMotion: true });
        }
      } catch { /* confetti unavailable — cosmetic only */ }
    }

    /* An entrance animation hides its targets first, so a tween that never
       finishes would leave the UI blank. Every reveal therefore arms a
       watchdog that strips the inline styles once the tween should be done —
       a no-op in the normal case, a safety net if rAF is throttled, the tab
       is backgrounded mid-tween, or GSAP is missing. */
    function unhide(list) {
      list.forEach((n) => { n.style.opacity = ""; n.style.transform = ""; });
    }

    /** Longest a staggered cascade may take, in seconds. Sized so the lobby's
        25 cards can run the full 0.05s stagger as one visible wave. */
    const MAX_STAGGER_TOTAL = 1.3;
    /** Grace period after a tween's expected end before we force it visible. */
    const WATCHDOG_GRACE_MS = 250;

    function armWatchdog(list, expectedSeconds) {
      setTimeout(() => unhide(list), expectedSeconds * 1000 + WATCHDOG_GRACE_MS);
    }

    /** Staggered entrance for a NodeList/array. Returns the GSAP tween or null. */
    function reveal(nodes, opts = {}) {
      const list = Array.from(nodes || []);
      if (!list.length) return null;
      if (!window.gsap || reduced()) { unhide(list); return null; }

      const duration = opts.duration ?? 0.42;
      const delay = opts.delay ?? 0;
      // Cap the cascade so a big grid can never keep content hidden for long —
      // 25 cards at a fixed stagger would run for well over a second.
      const stagger = Math.min(opts.stagger ?? 0.035, MAX_STAGGER_TOTAL / list.length);
      const tween = window.gsap.fromTo(list,
        { opacity: 0, y: opts.y ?? 16, scale: opts.scale ?? 1 },
        {
          opacity: 1, y: 0, scale: 1,
          duration, ease: opts.ease || "power2.out", stagger, delay,
          clearProps: "opacity,transform",
          overwrite: true,
        });
      armWatchdog(list, delay + duration + stagger * list.length);
      return tween;
    }

    /* Hard reset a persistent mount point (e.g. #view).
       NEVER animate the mount itself — it is never replaced, so a tween that
       stalls or is interrupted leaves inline opacity/transform on it forever
       and the whole app renders invisible. Call this before every route render
       so the container is guaranteed visible no matter what ran before. */
    function resetMount(el) {
      if (!el) return;
      if (window.gsap) {
        window.gsap.killTweensOf(el);
        // kill anything still running on the outgoing children too
        window.gsap.killTweensOf(el.children);
      }
      el.style.opacity = "";
      el.style.transform = "";
      el.style.translate = "";
      el.style.rotate = "";
      el.style.scale = "";
    }

    /** Route-transition entrance. Animates the container's CHILDREN, never the
        container — children get replaced on the next render, so a stalled tween
        is always self-healing. */
    function enter(el, opts = {}) {
      if (!el) return null;
      resetMount(el);
      const kids = Array.from(el.children);
      if (!kids.length) return null;
      if (!window.gsap || reduced()) { unhide(kids); return null; }
      const duration = opts.duration ?? 0.3;
      const stagger = Math.min(opts.stagger ?? 0.04, MAX_STAGGER_TOTAL / kids.length);
      const tween = window.gsap.fromTo(kids,
        { opacity: 0, y: opts.y ?? 10 },
        {
          opacity: 1, y: 0, duration, ease: "power2.out", stagger,
          clearProps: "opacity,transform", overwrite: true,
        });
      armWatchdog(kids, duration + stagger * kids.length);
      return tween;
    }

    /* Tactile click-down. Overshoots very slightly on the way back so the
       control feels sprung rather than merely resized. clearProps hands the
       transform back to CSS so the :hover lift keeps working afterwards. */
    function press(el) {
      if (!el || !window.gsap || reduced()) return;
      /* A single fromTo(0.95 -> 1) is back at ~0.999 within 60ms, which the eye
         never catches. Two stages give it an actual down-stroke: a fast bite
         in, then a sprung release. */
      return window.gsap.timeline({ overwrite: "auto" })
        .to(el, { scale: 0.95, duration: 0.09, ease: "power2.out" })
        .to(el, { scale: 1, duration: 0.34, ease: "back.out(2.6)", clearProps: "scale,transform" });
    }

    return { reduced, countTo, burst, reveal, enter, resetMount, press, hasGsap: () => !!window.gsap };
  })();

  function toast(msg, type = "info", ms = 2600) {
    const wrap = document.getElementById("toastWrap");
    if (!wrap) return;
    const t = el("div", `toast ${type}`, msg);
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity 0.3s, transform 0.3s";
      t.style.opacity = "0";
      t.style.transform = "translateX(30px)";
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  return {
    getBalance, bet, payout, setBalance, addFunds, reset,
    renderBalance, fmt, money, randInt, pick, el, toast, sound, cheat, fx,
    betFieldHTML, wireBet, openHowTo, helpBtnHTML, icon, icons,
    STARTING_BALANCE,
  };
})();
