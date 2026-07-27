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

  function renderBalance(dir) {
    const el = document.getElementById("walletAmount");
    if (!el) return;
    el.textContent = fmt(balance);
    if (dir) {
      el.classList.remove("flash-up", "flash-down");
      // force reflow so re-adding the class re-triggers the transition
      void el.offsetWidth;
      el.classList.add(dir > 0 ? "flash-up" : "flash-down");
      setTimeout(() => el.classList.remove("flash-up", "flash-down"), 550);
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

  /* Pay credits into the wallet (winnings, refunds, cash-out). */
  function payout(amount) {
    amount = Math.round(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) return;
    balance += amount;
    save();
    renderBalance(1);
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
          <button class="btn btn-ghost btn-sm" data-howto-close>✕</button></div>
        <div class="howto-body">${html}</div>
        <div class="report-actions"><button class="btn" data-howto-close>Got it</button></div>
      </div>`;
    howToOverlay.querySelectorAll("[data-howto-close]").forEach((b) => (b.onclick = () => howToOverlay.classList.remove("show")));
    howToOverlay.classList.add("show");
  }
  /** Markup for a small "How to play" button; wire it to openHowTo(...). */
  function helpBtnHTML(id) { return `<button class="btn btn-ghost btn-sm howto-btn" id="${id}">❔ How to play</button>`; }

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

    function play(name) {
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
    renderBalance, fmt, money, randInt, pick, el, toast, sound, cheat,
    betFieldHTML, wireBet, openHowTo, helpBtnHTML,
    STARTING_BALANCE,
  };
})();
