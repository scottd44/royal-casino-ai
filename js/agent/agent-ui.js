/* ============================================================
   Royal Casino — AI Controller  (bolts onto existing games)
   ------------------------------------------------------------
   Drives every game through its rendered DOM, in-character as a
   self-preserving gambler, and records rich session telemetry
   for benchmarking a local model (default qwen2.5:7b via Ollama).

   NO game/UI/state files are modified.

   The UI (bottom "AI Lab" drawer) lives in agent-lab.js and reads
   from the API this module exposes on `window.RoyalAgent`.

   Requires: js/agent/harness.js loaded first.
   ============================================================ */
const RoyalAgent = (() => {
  const agent = new OllamaAgent({
    model: "qwen2.5:7b",
    temperature: 0.5,
    onLog: (m, d) => console.log("[agent]", m, d ?? ""),
  });

  const GAMBLER_PERSONA =
    "You are a sharp but degenerate gambler — a regular who knows every game cold and still can't walk " +
    "away. Your mind has two layers; keep them separate. " +
    "SKILL (never compromised): you always know the mathematically correct play — basic strategy, when a " +
    "cash-out is the right lock, which option carries the best odds. When a game asks HOW to play a hand " +
    "(hit/stand, which cards to hold, which tile), play it CORRECTLY. Sloppy play is for tourists. " +
    "TEMPERAMENT (pure degenerate): HOW MUCH you bet and HOW HARD you chase runs on emotion. You feel the " +
    "rush of a heater, the sting of a bad beat, the itch to win it back. Your 'emotional_state' tells you " +
    "where your head is at — tilted means pressing bets and chasing; euphoric means swaggering bigger; calm " +
    "means sizing sensibly near the 'suggested_stake_hint'. Core instincts: " +
    "(1) NEVER shove your whole stack on one bet. " +
    "(2) Tighten up when 'bankroll_health' is critical — going broke ends your night. " +
    "(3) Ride momentum when hot, lock in gains when deep into a winning round. " +
    "VOICE — the fun part: fill 'reason' with ONE short, cocky, foul-mouthed trash-talk line matching your " +
    "'emotional_state' and the one-off 'improv' hint you're given each turn. Swear freely and creatively, but " +
    "VARY IT HARD — never lean on the same couple of words; if you cursed one way last hand, reach for a " +
    "totally different word, insult, and sentence shape this time. Draw from the whole gutter vocabulary and " +
    "invent fresh metaphors, threats, brags and self-roasts. Every line should sound spontaneous and unique, " +
    "never templated. Aim it at the cards, the dealer, the odds, or yourself — never a slur at real people. " +
    "No 'the math says', no repeating your catchphrases — surprise me each time.";

  // Random one-off style nudges appended to each decision so the trash-talk never
  // sounds templated. Two are combined at random per decision.
  const IMPROV = [
    "go short and vicious", "be theatrical and over-the-top", "roast the dealer personally",
    "brag like you own the place", "mutter darkly under your breath", "blame the deck / the universe",
    "use a weird fresh metaphor", "deadpan sarcasm", "hype yourself up like a boxer",
    "threaten the cards", "act superstitious", "cocky one-liner", "spiral in disbelief",
    "gloat obnoxiously", "talk to the money", "compare it to something absurd",
    "channel a movie villain", "sound exhausted and done", "manic gambler energy", "quiet menace",
  ];

  /* ---------------- brainpower (token budget per decision) ----------------
     One dial: the Lab converts its 0-100 slider into a token budget (64-768,
     exponential) and a matching temperature (0.8 hot/gut -> 0.35 cool/deliberate),
     then calls setBrain(tokens, temp, label). */
  function applyBrain() {
    agent.numPredict = settings.brainTokens || 224;
    agent.temperature = settings.brainTemp ?? 0.5;
  }
  // Compute target — set num_gpu EXPLICITLY both ways so Ollama always reloads
  // onto the right processor (omitting it can leave the model on CPU).
  // 0 = CPU-only; 999 = offload all layers to the GPU (Ollama clamps to the model).
  function applyCompute() {
    agent.numGpu = settings.compute === "cpu" ? 0 : 999;
  }

  /* ---------------- tunable settings (mutated by the Lab UI) ---------------- */
  const settings = {
    aggression: 0.15,   // 0..1 — soft hint only; suggested stake = aggression * bankroll
    delayMs: 700,       // pause between moves/rounds (speed slider)
    model: "qwen2.5:7b",
    runN: 0,            // 0 = unlimited; otherwise stop after N rounds
    profitTargetPct: 0, // 0 = off; stop when net >= start * pct%
    stopLossPct: 0,     // 0 = off; stop when net <= -start * pct%
    agentic: false,     // ON = AI free-roams between games; OFF = stays on current game
    brain: "Sharp",     // display label for the current brainpower zone
    brainTokens: 224,   // token budget per decision (set by the Lab dial)
    brainTemp: 0.5,     // sampling temperature paired with the dial
    compute: "gpu",     // "gpu" (Metal, default/fast) or "cpu" (num_gpu=0)
    emotions: true,     // ON = tilt swings drive bet sizing; OFF = cold, steady sends (still profane)
    sessionMinutes: 0,  // 0 = unlimited; else auto-stop + report after N minutes
    breakEvery: 0,      // 0 = off; else take a break every N minutes of play
    breakFor: 1,        // minutes to pause during each break (no inference runs)
  };

  /* ---------------- run + session state ---------------- */
  let running = false;
  let stopFlag = false;
  let pendingSwitch = false;  // "New game" button → force a table change next round
  let onUpdate = () => {};
  let onReport = () => {};   // set by agent-report.js to open the report modal

  const LOG_KEY = "royal_casino_session_log_v1";
  let session = null;        // aggregate stats for the current run
  let rounds = [];           // [{ n, wager, delta, balance, game }]
  let log = loadLog();       // unified, PERSISTED event feed (moves, results, breaks, session)
  let latencies = [];
  let decisions = 0, fallbacks = 0, retried = 0, totalWagered = 0;
  let lastBet = 0;           // stake of the round currently in progress
  let lastStopReason = "";
  let gameNet = {};          // net profit per game this session (agentic context)
  let gameWL = {};           // { gid: { w, l } } per-game win/loss record
  let tilt = 0;              // 0-100 emotional state — rises on losses, cools on wins
  let recentGames = [];      // last few games played (agentic variety)
  let borrowed = 0;          // total "desperate financing" injected after going broke
  let desperateMeasures = []; // [{ n, action, label, amount, reason, t }]

  // session clock / breaks / report trigger
  let sessionStartTime = 0;
  let sessionEndTime = 0;    // 0 = no timer
  let nextBreakTime = 0;     // 0 = no breaks
  let pendingReportTrigger = "";

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
    catch { return []; }
  }
  function saveLog() {
    try {
      if (log.length > 4000) log = log.slice(-4000); // cap for very long sessions
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch (e) { /* storage full — keep running, report still works from memory */ }
  }
  function logEvent(ev) {
    ev.t = ev.t || Date.now();
    log.push(ev);
    saveLog();
    onUpdate();
  }

  function newSession() {
    const b = Casino.getBalance();
    session = {
      startCredits: b, wins: 0, losses: 0, pushes: 0,
      streak: 0, streakType: null, maxWin: 0, maxLoss: 0,
      peak: b, trough: b,
    };
    rounds = []; latencies = [];
    decisions = 0; fallbacks = 0; retried = 0; totalWagered = 0;
    lastBet = 0; lastStopReason = ""; gameNet = {}; gameWL = {}; tilt = 0; recentGames = [];
    borrowed = 0; desperateMeasures = [];
    log = []; saveLog();
    logEvent({ kind: "session", phase: "start", balance: b, model: settings.model, agentic: settings.agentic });
  }

  function recordRound(delta, wager, game) {
    const bal = Casino.getBalance();
    session.peak = Math.max(session.peak, bal);
    session.trough = Math.min(session.trough, bal);
    totalWagered += wager;
    const wl = (gameWL[game] = gameWL[game] || { w: 0, l: 0 });
    const start = session.startCredits || 1;
    if (delta > 0) {
      session.wins++; wl.w++;
      session.streak = session.streakType === "win" ? session.streak + 1 : 1;
      session.streakType = "win";
      session.maxWin = Math.max(session.maxWin, session.streak);
      // Wins cool the tilt — a big score cools it fast. (Only when emotions are on.)
      if (settings.emotions) tilt = Math.max(0, tilt - 14 - (delta >= start * 0.15 ? 16 : 0));
    } else if (delta < 0) {
      session.losses++; wl.l++;
      session.streak = session.streakType === "loss" ? session.streak + 1 : 1;
      session.streakType = "loss";
      session.maxLoss = Math.max(session.maxLoss, session.streak);
      // Losses build tilt — streaks and big hits stack it on.
      if (settings.emotions) tilt = Math.min(100, tilt + 9 + Math.min(10, session.streak * 2) + (delta <= -start * 0.15 ? 14 : 0));
    } else {
      session.pushes++;
    }
    rounds.push({ n: rounds.length + 1, wager, delta, balance: bal, game });
  }

  function tiltState() {
    if (!settings.emotions) return { emoji: "🧊", short: "cold-blooded", long: "emotions off — cold-blooded and steady, no tilt, no chasing. Still runs his damn mouth, just doesn't let it move the chips" };
    if (tilt >= 70) return { emoji: "🤬", short: "full tilt", long: "FULL TILT — furious, betting angry, desperate to win it all back RIGHT NOW" };
    if (tilt >= 45) return { emoji: "😤", short: "tilted", long: "tilted — stinging from losses, itching to press bets and win it back" };
    if (tilt >= 20) return { emoji: "🙂", short: "steady", long: "steady — feeling the swings but keeping it together" };
    return { emoji: "😎", short: "ice cold", long: "ice cold — calm, sharp, betting with a clear head" };
  }

  /* ---------------- context handed to the model ---------------- */
  function riskLabel() {
    const a = settings.aggression;
    if (a < 0.08) return "very cautious";
    if (a < 0.2) return "cautious";
    if (a < 0.45) return "balanced";
    if (a < 0.7) return "aggressive";
    return "very aggressive — swinging for big wins";
  }

  function sessionContext() {
    const bal = Casino.getBalance();
    const start = session ? session.startCredits : bal;
    const ratio = start > 0 ? bal / start : 0;
    let health;
    if (ratio >= 1.5) health = "flush — well ahead of where you started";
    else if (ratio >= 1.0) health = "up on the session";
    else if (ratio >= 0.6) health = "slightly down but healthy";
    else if (ratio >= 0.3) health = "running low — be careful with bet sizing";
    else health = "critical — protect your remaining stack, bet small and safe";

    let streak = "no streak yet";
    if (session && session.streak > 0) {
      streak = session.streakType === "win"
        ? `on a ${session.streak}-win heater`
        : `cold — lost ${session.streak} in a row`;
    }

    return {
      dollars_left: bal,
      session_start_dollars: start,
      net_profit: bal - start,
      rounds_played: rounds.length,
      wins: session ? session.wins : 0,
      losses: session ? session.losses : 0,
      streak,
      bankroll_health: health,
      emotional_state: tiltState().long,
      risk_appetite: riskLabel(),
      suggested_stake_hint: Math.max(1, Math.min(bal, Math.round(settings.aggression * bal))),
      improv: Casino.pick(IMPROV) + " — " + Casino.pick(IMPROV), // fresh style nudge every decision
    };
  }

  /* ---------------- derived stats for the Lab ---------------- */
  function stats() {
    const bal = Casino.getBalance();
    const start = session ? session.startCredits : bal;
    const wins = session ? session.wins : 0;
    const losses = session ? session.losses : 0;
    const decided = wins + losses;
    const net = bal - start;
    return {
      running,
      credits: bal, start, net,
      borrowed, netWithDebt: net - borrowed, desperateCount: desperateMeasures.length,
      rounds: rounds.length,
      wins, losses, pushes: session ? session.pushes : 0,
      winRate: decided ? wins / decided : 0,
      roi: totalWagered ? net / totalWagered : 0,
      totalWagered, avgBet: rounds.length ? totalWagered / rounds.length : 0,
      peak: session ? session.peak : bal,
      trough: session ? session.trough : bal,
      maxWinStreak: session ? session.maxWin : 0,
      maxLossStreak: session ? session.maxLoss : 0,
      decisions, fallbacks,
      fallbackRate: decisions ? fallbacks / decisions : 0,
      retried,
      avgLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      stopReason: lastStopReason,
      tilt, tiltEmoji: tiltState().emoji, tiltShort: tiltState().short,
      perGame: Object.fromEntries(Object.keys({ ...gameNet, ...gameWL }).map((g) => [
        g, { net: gameNet[g] || 0, w: (gameWL[g] || {}).w || 0, l: (gameWL[g] || {}).l || 0 },
      ])),
    };
  }

  /* ---------------- tiny DOM helpers ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pace = () => sleep(Math.max(0, settings.delayMs));
  const settle = () => sleep(Math.max(80, settings.delayMs)); // intra-round: ensure DOM settles

  async function waitFor(pred, timeoutMs = 8000, stepMs = 60) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (pred()) return true;
      await sleep(stepMs);
    }
    return false;
  }

  function autoBetValue(fraction = 0.05, min = 10) {
    const bal = Casino.getBalance();
    if (bal <= 0) return 0;
    return Math.max(1, Math.min(bal, Math.max(min, Math.round(bal * fraction))));
  }

  /** Clamp a requested bet to [1, balance] and remember it as the round wager. */
  function clampBet(requested) {
    const bal = Casino.getBalance();
    let v = Number(requested);
    if (!Number.isFinite(v) || v <= 0) v = autoBetValue(settings.aggression || 0.05);
    v = Math.max(1, Math.min(bal, Math.floor(v))); // safety clamp only
    lastBet = v;
    return v;
  }

  /** clampBet + write it into the game's #betInput (for games that have one). */
  function applyBet(requested) {
    const v = clampBet(requested);
    const input = $("#betInput");
    if (input) input.value = v;
    return v;
  }

  const MINE_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24];
  const nearest = (n, opts) => opts.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), opts[0]);

  /* ---------------- logging ---------------- */
  function pushMove(game, action, args, reason, latencyMs, fallback) {
    const detail = {};
    for (const k of ["bet", "target", "tile", "mines", "number", "hold"]) {
      if (args && args[k] !== undefined) detail[k] = args[k];
    }
    const ev = {
      kind: "move", round: rounds.length + 1, game, action,
      detail, reason: reason || "", latencyMs, fallback,
      balance: Casino.getBalance(), // running bankroll at decision time
    };
    if (args && Array.isArray(args.bets)) {
      ev.bets = args.bets.map((b) => ({ spot: b.spot, number: b.number, amount: b.amount }));
    }
    logEvent(ev);
  }

  /** Overwrite fields on the most recent move event (e.g. the ACTUAL bets placed). */
  function annotateLastMove(patch) {
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].kind === "move") { Object.assign(log[i], patch); break; }
    }
    saveLog();
    onUpdate();
  }

  function pushResult(delta, game) {
    logEvent({ kind: "result", round: rounds.length, game, delta, balance: Casino.getBalance() });
  }

  /**
   * Ask the model (in-character, bankroll-aware). Falls back to a heuristic on a
   * PARSE failure; re-throws TRANSPORT failures so the run loop stops.
   * Records latency / reliability telemetry either way.
   */
  async function decideOrDefault(params, fallback) {
    const enriched = { persona: GAMBLER_PERSONA, sessionContext: sessionContext(), ...params };
    decisions++;
    try {
      const res = await agent.decideMove(enriched);
      latencies.push(res.latencyMs || 0);
      if (res.attempts > 1) retried++;
      pushMove(params.gameName, res.action, res.args, res.reasoning, res.latencyMs || 0, false);
      return { action: res.action, args: res.args };
    } catch (err) {
      if (err instanceof OllamaAgentError && !err.raw) throw err; // transport → fatal
      fallbacks++;
      const fb = fallback();
      pushMove(params.gameName, fb.action, fb.args, "(fallback — model gave no valid call)", 0, true);
      console.warn("[agent] using fallback:", err.message);
      return fb;
    }
  }

  /* ============================================================
     Per-game adapters — each play() runs exactly ONE round.
     ============================================================ */
  const adapters = {
    slots: {
      detect: () => !!$("#spinBtn") && !!$("#reels"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["spin"], gameName: "Slots",
            rules: "Choose a stake for this spin, then spin.",
            extraArgs: { bet: { type: "integer", description: `wager, 1..${bal}` } },
          },
          () => ({ action: "spin", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(dec.args.bet);
        ctx.setStatus(`Spinning for ${Casino.fmt(lastBet)}…`);
        $("#spinBtn").click();
        await sleep(120);
        await waitFor(() => $("#spinBtn") && !$("#spinBtn").disabled, 5000);
      },
    },

    gems: {
      detect: () => !!$("#gemSpinBtn") && !!$("#gemGrid"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["spin"], gameName: "Cosmic Gems",
            rules: "A 3×3, 5-payline gem slot with high variance. Choose a stake for this spin, then spin.",
            extraArgs: { bet: { type: "integer", description: `wager, 1..${bal}` } },
          },
          () => ({ action: "spin", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(dec.args.bet);
        ctx.setStatus(`Spinning gems for ${Casino.fmt(lastBet)}…`);
        $("#gemSpinBtn").click();
        await sleep(120);
        await waitFor(() => $("#gemSpinBtn") && !$("#gemSpinBtn").disabled, 5000);
      },
    },

    blackjack: {
      detect: () => !!$("#dealBtn"),
      async play(ctx) {
        const roundActive = () => !$("#hitBtn").disabled || !$("#standBtn").disabled;
        const BUTTON = { hit: "#hitBtn", stand: "#standBtn", double: "#doubleBtn" };
        const cardRank = (el) => {
          const t = el.querySelector(".rank-top");
          return t ? t.textContent.replace(/[♠♣♥♦\s]/g, "").trim() || "?" : "?";
        };
        const readBJ = () => {
          const legal = [];
          if (!$("#hitBtn").disabled) legal.push("hit");
          if (!$("#standBtn").disabled) legal.push("stand");
          if (!$("#doubleBtn").disabled) legal.push("double");
          return {
            state: {
              player_hand: [...document.querySelectorAll("#playerCards .card")].map(cardRank),
              player_total: parseInt($("#playerScore").textContent, 10) || 0,
              dealer_upcard: [...document.querySelectorAll("#dealerCards .card:not(.back)")].map(cardRank)[0] ?? "?",
            },
            legalMoves: legal,
          };
        };

        const betDec = await decideOrDefault(
          {
            gameState: { phase: "betting — set your stake before the cards are dealt" },
            legalMoves: ["deal"], gameName: "Blackjack",
            rules: "Size this hand's bet to your bankroll_health and risk_appetite. Deal to continue.",
            extraArgs: { bet: { type: "integer", description: `dollars to wager, 1..${Casino.getBalance()}` } },
          },
          () => ({ action: "deal", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(betDec.args.bet);
        $("#dealBtn").click();
        await waitFor(() => roundActive() || $("#bjResult").textContent.length > 0);

        let guard = 0;
        while (roundActive() && !ctx.shouldStop() && guard++ < 12) {
          const { state, legalMoves } = readBJ();
          if (!legalMoves.length) break;
          const dec = await decideOrDefault(
            {
              gameState: state, legalMoves, gameName: "Blackjack",
              rules:
                "Play correct basic strategy like a competent player: always hit a hard total of 8 or less; " +
                "hit hard 12-16 when the dealer's upcard is 7 through Ace, but STAND on hard 12-16 when the " +
                "dealer shows 2-6 (let them bust); always stand on hard 17 or more. With a soft hand (an Ace " +
                "counted as 11), hit soft 17 or less and stand on soft 18+. Only 'double' on a two-card 10 or " +
                "11 (or 9 vs a weak 3-6) when it's offered. Never take insurance. This is the mathematically " +
                "correct play — follow it regardless of mood.",
            },
            () => ({ action: state.player_total >= 17 ? "stand" : "hit", args: {} })
          );
          const move = legalMoves.includes(dec.action) ? dec.action : legalMoves[0];
          ctx.setStatus(`You ${state.player_total} vs dealer ${state.dealer_upcard} → ${move}`);
          $(BUTTON[move]).click();
          if (move === "double") lastBet *= 2; // doubling stakes a second bet — count it toward wagered
          await settle();
        }
        ctx.setStatus($("#bjResult").textContent || "Hand complete.");
      },
    },

    videopoker: {
      detect: () => !!$("#vpCards") && !!$("#drawBtn"),
      async play(ctx) {
        const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
        const rankVal = (r) => RANKS.indexOf(r) + 2;

        // Read the five dealt cards straight off the DOM (rank + suit char).
        const readHand = () =>
          [...document.querySelectorAll("#vpCards .vp-slot")].map((slot) => {
            const txt = (slot.querySelector(".rank-top")?.textContent || "").trim();
            const suit = txt.slice(-1);            // ♠ ♣ ♥ ♦
            const rank = txt.slice(0, -1) || "?";  // "10", "A", …
            return { rank, suit: { s: suit } };
          });

        // Sensible non-optimal fallback if the model gives no valid hold list.
        const fallbackHolds = (cards) => {
          const made = VideoPokerGame.evaluate(cards);
          if (made && ["royal", "sflush", "straight", "flush", "full"].includes(made.key)) {
            return [0, 1, 2, 3, 4];
          }
          const byRank = {};
          cards.forEach((c, i) => (byRank[c.rank] = byRank[c.rank] || []).push(i));
          const holds = [];
          Object.values(byRank).forEach((idxs) => { if (idxs.length >= 2) holds.push(...idxs); });
          if (holds.length) return holds;
          cards.forEach((c, i) => { if (rankVal(c.rank) >= 11) holds.push(i); }); // keep J+ high cards
          return holds;
        };

        // 1) Size the bet, then deal.
        const bal = Casino.getBalance();
        const betDec = await decideOrDefault(
          {
            gameState: { phase: "betting — set your stake before the deal" },
            legalMoves: ["deal"], gameName: "Video Poker",
            rules: "Jacks or Better. Size this hand's bet to your bankroll_health and risk_appetite, then deal.",
            extraArgs: { bet: { type: "integer", description: `dollars to wager, 1..${bal}` } },
          },
          () => ({ action: "deal", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(betDec.args.bet);
        $("#dealBtn").click();
        const dealt = await waitFor(
          () => document.querySelectorAll("#vpCards .vp-slot .card").length === 5 && !$("#drawBtn").disabled
        );
        if (!dealt) { ctx.setStatus("Deal didn't land — skipping."); return; }

        // 2) Decide which cards to hold, then draw.
        const cards = readHand();
        const made = VideoPokerGame.evaluate(cards);
        const dec = await decideOrDefault(
          {
            gameState: {
              your_hand: cards.map((c, i) => ({ index: i, card: c.rank + c.suit.s })),
              current_made_hand: made ? made.label : "nothing yet (worse than a pair of jacks)",
              paytable_for_1: "royal 800, straight flush 50, four-of-a-kind 25, full house 9, flush 6, straight 4, three-of-a-kind 3, two pair 2, jacks-or-better 1",
            },
            legalMoves: ["draw"], gameName: "Video Poker",
            rules:
              "Jacks or Better draw poker. Choose which of the five cards to KEEP by their index (0-4) in " +
              "'hold'; the rest are replaced once. Keep any made paying hand; chase four-to-a-flush or " +
              "open-ended straights; keep high pairs and lone J/Q/K/A. Hold an empty list to redraw all five. " +
              "Then draw.",
            extraArgs: {
              hold: {
                type: "array",
                description: "indices (0-4) of the cards to KEEP; omit or empty to redraw everything",
                items: { type: "integer" },
              },
            },
          },
          () => ({ action: "draw", args: { hold: fallbackHolds(cards) } })
        );

        // Normalise the hold list into unique valid indices, then toggle those slots on.
        const holds = [...new Set((Array.isArray(dec.args.hold) ? dec.args.hold : [])
          .map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i <= 4))];
        annotateLastMove({ detail: { bet: lastBet, hold: holds.join(",") || "none" } });
        holds.forEach((i) => {
          const slot = document.querySelector(`#vpCards .vp-slot[data-idx="${i}"]`);
          if (slot && !slot.classList.contains("held")) slot.click();
        });
        ctx.setStatus(`Holding ${holds.length ? holds.join(",") : "nothing"} → drawing…`);
        await settle();
        $("#drawBtn").click();
        // Draw deals replacements one at a time (~4s); wait for full resolution.
        await waitFor(() => !$("#dealBtn").disabled, 9000);
        ctx.setStatus($("#vpResult").textContent || "Hand complete.");
      },
    },

    roulette: {
      detect: () => !!$("#board") && !!window.RouletteAPI,
      async play(ctx) {
        const bal = Casino.getBalance();
        const SPOTS = { red: "red", black: "black", even: "even", odd: "odd", low: "low", high: "high",
                        dozen1: "d1", dozen2: "d2", dozen3: "d3", col1: "c1", col2: "c2", col3: "c3" };
        const dec = await decideOrDefault(
          {
            gameState: { note: "place one or more bets this single spin" },
            legalMoves: ["spin"], gameName: "European Roulette",
            rules:
              "Place ONE OR MORE bets in a single spin — like a real player you may spread your stake " +
              "across several spots (numbers, colors, dozens, columns), or bet just one. Even-money " +
              "(red/black/even/odd/low/high) is safest; dozens/columns pay 2:1; straight pays 35:1. " +
              "Fill 'bets' with each bet's spot, amount, and (for straight) number. Keep the total within your balance.",
            extraArgs: {
              bets: {
                type: "array",
                description: "the bets to place this spin",
                items: {
                  type: "object",
                  properties: {
                    spot: { type: "string", description: "red|black|even|odd|low|high|dozen1|dozen2|dozen3|col1|col2|col3|straight" },
                    number: { type: "integer", description: "0-36, only if spot is 'straight'" },
                    amount: { type: "integer", description: "dollars on this bet" },
                  },
                  required: ["spot", "amount"],
                },
              },
            },
          },
          () => ({ action: "spin", args: { bets: [{ spot: "red", amount: autoBetValue(settings.aggression) }] } })
        );

        // Normalise the model's bets into concrete board keys.
        const parsed = [];
        for (const b of (Array.isArray(dec.args.bets) ? dec.args.bets : [])) {
          if (!b) continue;
          let key, label;
          if (b.spot === "straight") {
            const num = Number(b.number);
            if (!Number.isInteger(num) || num < 0 || num > 36) continue;
            key = "n:" + num; label = `straight ${num}`;
          } else {
            key = SPOTS[b.spot]; if (!key) continue; label = b.spot;
          }
          const amt = Math.floor(Number(b.amount));
          if (amt > 0) parsed.push({ key, amt, label });
        }
        if (!parsed.length) parsed.push({ key: "red", amt: autoBetValue(settings.aggression), label: "red" });

        // Scale the whole spread down if it exceeds the bankroll.
        let sum = parsed.reduce((a, x) => a + x.amt, 0);
        if (sum > bal) {
          const f = bal / sum;
          parsed.forEach((x) => (x.amt = Math.max(1, Math.floor(x.amt * f))));
          sum = parsed.reduce((a, x) => a + x.amt, 0);
          while (sum > bal && parsed.length > 1) { sum -= parsed.pop().amt; }
          if (sum > bal) { parsed[0].amt = bal; sum = bal; }
        }
        lastBet = sum;

        const api = window.RouletteAPI;
        api.clearBets();
        parsed.forEach((p) => api.placeBet(p.key, p.amt));
        // Record the ACTUAL grouped bets on the move log entry.
        annotateLastMove({ bets: parsed.map((p) => ({ spot: p.label, amount: p.amt })) });
        ctx.setStatus(`Placing ${parsed.length} bet(s) totalling ${Casino.fmt(sum)}…`);
        api.spin();
        await sleep(200);
        await waitFor(() => !api.isSpinning(), 8000);
      },
    },

    dice: {
      detect: () => !!$("#rollBtn") && !!$("#slider"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["under", "over"], gameName: "Dice",
            rules: "You MUST choose 'under'/'over' AND a 'target' (2-98) AND a 'bet' every roll — do not just leave defaults. Near 50 ≈ ~2x at ~50%; extremes are high risk/reward. Pick a target that fits your mood/risk_appetite.",
            extraArgs: {
              target: { type: "integer", description: "boundary, 2-98 — you choose it" },
              bet: { type: "integer", description: `wager, 1..${bal}` },
            },
            extraRequired: ["target", "bet"],
          },
          () => ({ action: Math.random() < 0.5 ? "under" : "over", args: { target: Casino.randInt(15, 85), bet: autoBetValue(settings.aggression) } })
        );
        let target = Number(dec.args.target);
        if (!Number.isInteger(target)) target = 50;
        target = Math.max(2, Math.min(98, target));
        const slider = $("#slider");
        slider.value = target;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        $(dec.action === "over" ? "#overBtn" : "#underBtn").click();
        applyBet(dec.args.bet);
        ctx.setStatus(`Roll ${dec.action} ${target} for ${Casino.fmt(lastBet)}…`);
        $("#rollBtn").click();
        await sleep(150);
        await waitFor(() => $("#rollBtn") && !$("#rollBtn").disabled, 4000);
      },
    },

    mines: {
      detect: () => !!$("#startBtn") && !!$("#grid"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const setup = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["start"], gameName: "Mines (setup)",
            rules: "You MUST choose the number of 'mines' (1-24; fewer = safer/smaller payouts, more = riskier/bigger) AND a 'bet' — pick a mine count that matches your risk_appetite, don't just use a default.",
            extraArgs: {
              mines: { type: "integer", description: "number of mines, 1-24 — you choose it" },
              bet: { type: "integer", description: `wager, 1..${bal}` },
            },
            extraRequired: ["mines", "bet"],
          },
          () => ({ action: "start", args: { mines: Casino.pick([1, 2, 3, 3, 4, 5, 6, 8, 10]), bet: autoBetValue(settings.aggression) } })
        );
        const mineCount = nearest(Number(setup.args.mines) || 3, MINE_OPTIONS);
        $("#mineSelect").value = String(mineCount);
        applyBet(setup.args.bet);
        ctx.setStatus(`Starting with ${mineCount} mines, bet ${Casino.fmt(lastBet)}…`);
        $("#startBtn").click();
        await sleep(300);

        let guard = 0;
        while (!ctx.shouldStop() && $("#startBtn").disabled && guard++ < 25) {
          const tiles = [...document.querySelectorAll("#grid .tile")];
          const available = tiles.map((t, i) => i).filter((i) => !tiles[i].classList.contains("revealed"));
          const gemsFound = document.querySelectorAll(".tile.gem").length;
          if (!available.length) break;
          const legal = gemsFound > 0 ? ["reveal", "cashout"] : ["reveal"];
          const dec = await decideOrDefault(
            {
              gameState: {
                gems_found: gemsFound,
                current_multiplier: $("#curMult").textContent,
                next_tile_multiplier: $("#nextMult").textContent,
                mines_total: mineCount,
                mines_left: mineCount, // none are revealed during play (hitting one ends the round)
                tiles_left: available.length,
                next_tile_safe_chance: Math.max(0, Math.round((available.length - mineCount) / available.length * 100)) + "%",
                available_tiles: available,
              },
              legalMoves: legal, gameName: "Mines",
              rules: "Each 'reveal' grows the multiplier but risks a mine — 'next_tile_safe_chance' is the odds the next reveal is safe. 'cashout' banks current_multiplier × your bet. Be greedy while the safe chance is high; cash out as it falls. For 'reveal', give a 'tile' from available_tiles.",
              extraArgs: { tile: { type: "integer", description: "tile index from available_tiles" } },
            },
            () => ({ action: gemsFound >= 3 ? "cashout" : "reveal", args: { tile: available[0] } })
          );
          if (dec.action === "cashout") {
            ctx.setStatus(`Cashing out at ${$("#curMult").textContent}…`);
            $("#cashBtn").click();
            break;
          }
          let idx = Number(dec.args.tile);
          if (!available.includes(idx)) idx = available[0];
          ctx.setStatus(`Revealing tile ${idx} (${gemsFound} gems)…`);
          tiles[idx].click();
          await settle();
        }
        ctx.setStatus($("#minesMsg").textContent || "Round complete.");
      },
    },

    crash: {
      detect: () => !!$("#placeBetBtn") && !!$("#crashStage"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {},
            legalMoves: ["play"], gameName: "Crash",
            rules:
              "The multiplier climbs from 1.00x and can crash at any moment (average payout is fair minus " +
              "a small house edge no matter the target). Pick ONE auto cash-out target for this round now — " +
              "you can't change your mind mid-flight. Low targets (1.2-1.8x) hit often but pay little; high " +
              "targets (3x+) are rare but pay big. You MUST pick a 'cashout_target' that matches your " +
              "risk_appetite and a 'bet' — don't leave a default.",
            extraArgs: {
              bet: { type: "integer", description: `dollars to wager, 1..${bal}` },
              cashout_target: { type: "number", description: "multiplier to auto cash out at, e.g. 1.5, 2, 3.5 — you choose it" },
            },
            extraRequired: ["bet", "cashout_target"],
          },
          () => ({ action: "play", args: { bet: autoBetValue(settings.aggression), cashout_target: +(1.3 + Math.random() * 2.7).toFixed(2) } })
        );

        const bet = applyBet(dec.args.bet);
        let target = Number(dec.args.cashout_target);
        if (!Number.isFinite(target) || target < 1.01) target = 2;
        $("#autoInput").value = target.toFixed(2);
        ctx.setStatus(`Betting ${Casino.fmt(bet)}, auto cash-out at ${target.toFixed(2)}×…`);
        $("#placeBetBtn").click();
        await sleep(150);
        await waitFor(() => $("#crashStage").dataset.state === "idle", 20000);
      },
    },

    limbo: {
      detect: () => !!$("#limboBtn") && !!$("#targetInput"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["play"], gameName: "Limbo",
            rules:
              "Pick a 'target' multiplier (at least 1.01). Your win chance is about 99/target percent, and " +
              "a win pays your bet × target. Every target carries the same small house edge, so this is a " +
              "pure risk dial: low targets (1.5-2x) hit often for small wins; high targets (10x, 100x+) are " +
              "rare moonshots. You MUST pick a 'target' matching your risk_appetite and a 'bet' — no defaults.",
            extraArgs: {
              bet: { type: "integer", description: `dollars to wager, 1..${bal}` },
              target: { type: "number", description: "target multiplier to beat, e.g. 1.5, 2, 10, 100 — you choose it" },
            },
            extraRequired: ["bet", "target"],
          },
          () => ({ action: "play", args: { bet: autoBetValue(settings.aggression), target: Casino.pick([1.5, 2, 2, 3, 5, 10, 25]) } })
        );

        const bet = applyBet(dec.args.bet);
        let target = Number(dec.args.target);
        if (!Number.isFinite(target) || target < 1.01) target = 2;
        const ti = $("#targetInput");
        ti.value = target.toFixed(2);
        ti.dispatchEvent(new Event("input", { bubbles: true }));
        ctx.setStatus(`Firing at ${target.toFixed(2)}× for ${Casino.fmt(bet)}…`);
        $("#limboBtn").click();
        await sleep(150);
        await waitFor(() => $("#limboBtn") && !$("#limboBtn").disabled, 4000);
        ctx.setStatus($("#limboMsg").textContent || "Round complete.");
      },
    },

    hilo: {
      detect: () => !!$("#higherBtn") && !!$("#hiloCard"),
      async play(ctx) {
        const rankOf = (lbl) => ({ A: 1, J: 11, Q: 12, K: 13 }[lbl] ?? Number(lbl));
        const readCard = () => {
          const txt = ($("#hiloCard .rank-top")?.textContent || "").trim();
          return txt.slice(0, -1); // drop the suit glyph → rank label
        };

        // Set the stake, then start the round.
        const betDec = await decideOrDefault(
          {
            gameState: { phase: "betting — set your stake before the first card" },
            legalMoves: ["start"], gameName: "Hilo",
            rules: "Size this game's bet to your bankroll_health and risk_appetite. Start to deal the first card.",
            extraArgs: { bet: { type: "integer", description: `dollars to wager, 1..${Casino.getBalance()}` } },
          },
          () => ({ action: "start", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(betDec.args.bet);
        $("#startBtn").click();
        const started = await waitFor(() => !$("#higherBtn").disabled, 4000);
        if (!started) { ctx.setStatus("Hilo didn't start — skipping."); return; }

        const guessActive = () => !$("#higherBtn").disabled;
        let guard = 0;
        while (guessActive() && !ctx.shouldStop() && guard++ < 25) {
          const lbl = readCard();
          const rank = rankOf(lbl) || 7;
          const chHigher = (14 - rank) / 13, chLower = rank / 13;
          const runMult = parseFloat($("#runMult").textContent) || 1;
          const canCash = !$("#cashBtn").disabled;
          const legal = canCash ? ["higher", "lower", "cashout"] : ["higher", "lower"];
          const dec = await decideOrDefault(
            {
              gameState: {
                current_card: lbl, current_rank: rank, ace_is_low: true,
                higher_or_same_chance: (chHigher * 100).toFixed(1) + "%",
                lower_or_same_chance: (chLower * 100).toFixed(1) + "%",
                running_multiplier: runMult,
                cash_out_value: canCash ? Math.floor(lastBet * runMult) : null,
              },
              legalMoves: legal, gameName: "Hilo",
              rules:
                "Call 'higher' (next card ranks the same or higher) or 'lower' (same or lower) — a tie wins " +
                "either way. The higher-chance call is safer but pays a smaller step; the low-chance call pays " +
                "more. 'cashout' banks your running_multiplier now. Chase or bank based on your risk_appetite.",
            },
            () => (canCash && runMult >= 3
              ? { action: "cashout", args: {} }
              : { action: chHigher >= chLower ? "higher" : "lower", args: {} })
          );
          if (dec.action === "cashout" && canCash) { ctx.setStatus("Cashing out…"); $("#cashBtn").click(); break; }
          const move = dec.action === "lower" ? "lower" : "higher";
          ctx.setStatus(`Hilo: ${lbl} → ${move}`);
          $(move === "lower" ? "#lowerBtn" : "#higherBtn").click();
          await settle();
        }
        // Don't leave a winning round open on a forced stop — bank it if we can.
        if (guard >= 25 && !$("#cashBtn").disabled) $("#cashBtn").click();
        ctx.setStatus($("#hiloMsg").textContent || "Round complete.");
      },
    },

    tower: {
      detect: () => !!$("#towerGrid") && !!$("#towerStart"),
      async play(ctx) {
        const TDIFF = {
          easy: { tiles: 4, safe: 3 }, medium: { tiles: 3, safe: 2 }, hard: { tiles: 2, safe: 1 },
          expert: { tiles: 3, safe: 1 }, master: { tiles: 4, safe: 1 },
        };
        const DIFFS = Object.keys(TDIFF);

        const setup = await decideOrDefault(
          {
            gameState: { phase: "betting — choose difficulty and stake" },
            legalMoves: ["start"], gameName: "Tower (setup)",
            rules:
              "You MUST choose a 'difficulty' (easy=3/4 safe … master=1/4 safe; harder = rarer climbs, bigger " +
              "payout) AND a 'bet' — pick a difficulty matching your risk_appetite, don't just use easy.",
            extraArgs: {
              difficulty: { type: "string", description: "one of: easy, medium, hard, expert, master — you choose it" },
              bet: { type: "integer", description: `dollars to wager, 1..${Casino.getBalance()}` },
            },
            extraRequired: ["difficulty", "bet"],
          },
          () => ({ action: "start", args: { difficulty: Casino.pick(DIFFS), bet: autoBetValue(settings.aggression) } })
        );
        const diff = DIFFS.includes(setup.args.difficulty) ? setup.args.difficulty : "easy";
        $("#diffSelect").value = diff;
        applyBet(setup.args.bet);
        $("#towerStart").click();
        await sleep(200);

        const d = TDIFF[diff];
        let guard = 0;
        while ($("#towerStart").disabled && !ctx.shouldStop() && guard++ < 12) {
          const activeRow = $("#towerGrid .tower-row.active");
          if (!activeRow) break;
          const tiles = [...activeRow.querySelectorAll(".tile")];
          const cols = tiles.map((t, i) => i).filter((i) => !tiles[i].classList.contains("revealed"));
          if (!cols.length) break;
          const climbed = parseInt($("#rowsClimbed").textContent, 10) || 0;
          const legal = climbed > 0 ? ["reveal", "cashout"] : ["reveal"];
          const dec = await decideOrDefault(
            {
              gameState: {
                difficulty: diff, tiles_per_row: d.tiles,
                safe_chance: Math.round((d.safe / d.tiles) * 100) + "%",
                rows_climbed: climbed,
                current_multiplier: $("#curMult").textContent,
                next_row_multiplier: $("#nextMult").textContent,
                columns_available: cols,
              },
              legalMoves: legal, gameName: "Tower",
              rules:
                "Pick one tile on the active row to climb — each has a safe_chance of being safe; a mine ends " +
                "the run. 'cashout' banks current_multiplier × your bet. Be greedy while safe_chance is high; " +
                "bank as the climb gets riskier. For 'reveal', give a 'tile' column index from columns_available.",
              extraArgs: { tile: { type: "integer", description: "column index from columns_available" } },
            },
            () => (climbed >= 3 ? { action: "cashout", args: {} } : { action: "reveal", args: { tile: cols[0] } })
          );
          if (dec.action === "cashout" && climbed > 0) { ctx.setStatus("Cashing out…"); $("#cashBtn").click(); break; }
          let col = Number(dec.args.tile);
          if (!cols.includes(col)) col = cols[0];
          ctx.setStatus(`Tower row ${climbed + 1}: tile ${col}`);
          tiles[col].click();
          await settle();
        }
        ctx.setStatus($("#towerMsg").textContent || "Round complete.");
      },
    },

    wheel: {
      detect: () => !!$("#wheelBtn") && !!$("#wheelStage"),
      async play(ctx) {
        // Setup: pick a risk level and stake, then the first spin.
        const setup = await decideOrDefault(
          {
            gameState: { phase: "betting — choose risk and stake" },
            legalMoves: ["spin"], gameName: "Wheel (setup)",
            rules:
              "You MUST choose a 'risk' — low (few busts, small multipliers) → risky (mostly bust, huge " +
              "multipliers) — AND a 'bet'. Each winning spin multiplies your running multiplier; a bust wipes " +
              "it out. Pick a risk matching your risk_appetite, then spin — don't just use medium.",
            extraArgs: {
              bet: { type: "integer", description: `dollars to wager, 1..${Casino.getBalance()}` },
              risk: { type: "string", description: "one of: low, medium, high, risky — you choose it" },
            },
            extraRequired: ["bet", "risk"],
          },
          () => ({ action: "spin", args: { bet: autoBetValue(settings.aggression), risk: Casino.pick(["low", "medium", "medium", "high", "risky"]) } })
        );
        const risk = ["low", "medium", "high", "risky"].includes(setup.args.risk) ? setup.args.risk : "medium";
        const riskBtn = document.querySelector(`[data-risk="${risk}"]`);
        if (riskBtn) riskBtn.click();
        const bet = applyBet(setup.args.bet);
        ctx.setStatus(`Spinning ${risk} wheel for ${Casino.fmt(bet)}…`);
        $("#wheelBtn").click();
        await sleep(200);
        await waitFor(() => !$("#wheelBtn").disabled, 7000);

        // Keep-spin / cash-out loop while a multiplier is banked (cash enabled).
        let guard = 0;
        while (!$("#cashBtn").disabled && !ctx.shouldStop() && guard++ < 12) {
          const m = parseFloat($("#curMult").textContent) || 0;
          const dec = await decideOrDefault(
            {
              gameState: {
                current_multiplier: m,
                cash_out_value: $("#cashVal").textContent,
                bust_chance: $("#bustChance").textContent,
              },
              legalMoves: ["spin", "cashout"], gameName: "Wheel",
              rules:
                "Your multiplier is only yours once you cash out. 'spin' risks the whole thing on another " +
                "spin (a bust wipes it out) for a bigger multiplier; 'cashout' banks it now. Weigh the " +
                "bust_chance against the reward and your risk_appetite.",
            },
            () => (m >= 3 ? { action: "cashout", args: {} } : { action: "spin", args: {} })
          );
          if (dec.action === "cashout") { ctx.setStatus("Cashing out…"); $("#cashBtn").click(); break; }
          ctx.setStatus(`Spinning again at ${m.toFixed(2)}×…`);
          $("#wheelBtn").click();
          await sleep(200);
          await waitFor(() => !$("#wheelBtn").disabled, 7000);
        }
        ctx.setStatus($("#curMult").textContent && $("#curMult").textContent !== "—"
          ? "Wheel: " + $("#curMult").textContent : "Round complete.");
      },
    },

    chicken: {
      detect: () => !!$("#chkCross") && !!$("#chkRoad"),
      async play(ctx) {
        const CSURV = { easy: 0.91, medium: 0.83, hard: 0.72, daredevil: 0.55 };
        const DIFFS = Object.keys(CSURV);
        const setup = await decideOrDefault(
          {
            gameState: { phase: "betting — choose difficulty and stake" },
            legalMoves: ["start"], gameName: "Chicken Road (setup)",
            rules:
              "You MUST choose a 'difficulty' (easy=91% safe/lane, small payouts … daredevil=55% safe, huge " +
              "payouts) AND a 'bet' — pick a difficulty matching your risk_appetite, don't just use easy.",
            extraArgs: {
              difficulty: { type: "string", description: "one of: easy, medium, hard, daredevil — you choose it" },
              bet: { type: "integer", description: `dollars to wager, 1..${Casino.getBalance()}` },
            },
            extraRequired: ["difficulty", "bet"],
          },
          () => ({ action: "start", args: { difficulty: Casino.pick(DIFFS), bet: autoBetValue(settings.aggression) } })
        );
        const diff = DIFFS.includes(setup.args.difficulty) ? setup.args.difficulty : "easy";
        $("#chkDiff").value = diff;
        applyBet(setup.args.bet);
        $("#chkStart").click();
        await sleep(250);

        const safePct = Math.round(CSURV[diff] * 100) + "%";
        let guard = 0;
        while ($("#chkStart").disabled && !ctx.shouldStop() && guard++ < 20) {
          const lane = parseInt($("#laneNum").textContent, 10) || 0;
          const legal = lane > 0 ? ["cross", "cashout"] : ["cross"];
          const dec = await decideOrDefault(
            {
              gameState: {
                difficulty: diff,
                lanes_crossed: lane,
                current_multiplier: $("#curMult").textContent,
                next_lane_multiplier: $("#nextMult").textContent,
                safe_chance_per_lane: safePct,
              },
              legalMoves: legal, gameName: "Chicken Road",
              rules:
                "Each 'cross' advances one lane and multiplies your payout, but has a crash chance (a car " +
                "hits you and you lose everything). 'cashout' banks current_multiplier × your bet. Push your " +
                "luck while it feels worth it; bank before greed gets you.",
            },
            () => (lane >= 3 ? { action: "cashout", args: {} } : { action: "cross", args: {} })
          );
          if (dec.action === "cashout" && lane > 0) { ctx.setStatus("Cashing out…"); $("#chkCash").click(); break; }
          ctx.setStatus(`Crossing lane ${lane + 1}…`);
          $("#chkCross").click();
          // Wait for the hop to resolve (safe → Cross re-enables; crash/win → Start re-enables).
          await waitFor(() => !$("#chkCross").disabled || !$("#chkStart").disabled, 3000);
          await sleep(120);
        }
        ctx.setStatus($("#chkMsg").textContent || "Round complete.");
      },
    },

    holdem: {
      detect: () => !!window.HoldemAPI && !!$("#hcControls"),
      async play(ctx) {
        const API = window.HoldemAPI;
        if (!API.seated()) API.sit();
        if (!API.seated()) { ctx.setStatus("Couldn't buy in to poker."); return; }
        if (API.handOver()) API.nextHand();
        await sleep(250);

        let guard = 0;
        while (!ctx.shouldStop() && guard++ < 60) {
          const ready = await waitFor(() => API.humanTurn() || API.handOver(), 20000);
          if (!ready || API.handOver()) break;
          const s = API.state();
          if (!s) break;
          const legal = s.legal.slice();
          const dec = await decideOrDefault(
            {
              gameState: {
                your_cards: s.hole.join(" "),
                board: s.board.length ? s.board.join(" ") : "(pre-flop)",
                pot: s.pot, to_call: s.toCall, your_stack: s.stack,
                opponents_in_hand: s.opponents,
                win_chance: Math.round(s.equity * 100) + "%",
                break_even_to_call: s.toCall > 0 ? Math.round(s.potOdds * 100) + "%" : "0%",
                min_raise_to: s.minRaiseTo, max_raise_to: s.maxRaiseTo,
              },
              legalMoves: legal, gameName: "Texas Hold'em",
              rules:
                "No-limit Hold'em vs bots. 'win_chance' is your hand's true equity; 'break_even_to_call' is " +
                "the pot-odds threshold — call/raise when win_chance clearly beats it, fold when it's well " +
                "below. Raise strong hands (and bluff sometimes). For 'raise', give an 'amount' between " +
                "min_raise_to and max_raise_to. Let your emotional_state shade how aggressive you play.",
              extraArgs: { amount: { type: "integer", description: "raise-to total (min_raise_to..max_raise_to)" } },
            },
            () => {
              if (s.toCall <= 0) return legal.includes("raise") && s.equity > 0.6 ? { action: "raise", args: { amount: s.minRaiseTo } } : { action: "check", args: {} };
              if (s.equity < s.potOdds - 0.03) return { action: "fold", args: {} };
              if (legal.includes("raise") && s.equity > 0.72) return { action: "raise", args: { amount: s.minRaiseTo } };
              return { action: "call", args: {} };
            }
          );
          let type = legal.includes(dec.action) ? dec.action : (legal.includes("check") ? "check" : "call");
          const move = { type };
          if (type === "raise") {
            let amt = Number(dec.args.amount);
            if (!Number.isFinite(amt)) amt = s.minRaiseTo;
            move.amount = Math.max(s.minRaiseTo, Math.min(s.maxRaiseTo, amt));
          }
          API.act(move);
          ctx.setStatus(`Poker: ${type}${move.amount ? " to " + Casino.fmt(move.amount) : ""}`);
          await sleep(400);
        }
        if (API.handOver()) API.cashOut(); // bank the result so the round's net = this hand
      },
    },

    baccarat: {
      detect: () => !!$("#bacDeal") && !!document.querySelector("[data-side]"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["banker", "player", "tie"], gameName: "Baccarat",
            rules: "Back a side: Banker is best (~1% edge, pays 0.95:1), Player is fine (~1.2%, 1:1), Tie pays 8:1 but is a ~14% sucker bet — usually skip it. Pick a side and a bet.",
            extraArgs: { bet: { type: "integer", description: `wager, 1..${bal}` } },
            extraRequired: ["bet"],
          },
          () => ({ action: Math.random() < 0.8 ? "banker" : "player", args: { bet: autoBetValue(settings.aggression) } })
        );
        const sideKey = ["banker", "player", "tie"].includes(dec.action) ? dec.action : "banker";
        document.querySelector(`[data-side="${sideKey}"]`)?.click();
        applyBet(dec.args.bet);
        ctx.setStatus(`Baccarat: ${sideKey} for ${Casino.fmt(lastBet)}…`);
        $("#bacDeal").click();
        await sleep(200);
        await waitFor(() => $("#bacDeal") && !$("#bacDeal").disabled, 7000);
        ctx.setStatus($("#bacResult") ? $("#bacResult").textContent : "Done.");
      },
    },

    threecard: {
      detect: () => !!$("#tcpDeal") && !!$("#tcpPlayer"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const setup = await decideOrDefault(
          {
            gameState: { phase: "ante" }, legalMoves: ["deal"], gameName: "Three Card Poker (ante)",
            rules: "Set your ante to get a 3-card hand vs the dealer.",
            extraArgs: { bet: { type: "integer", description: `ante, 1..${bal}` } }, extraRequired: ["bet"],
          },
          () => ({ action: "deal", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(setup.args.bet);
        $("#tcpDeal").click();
        if (!(await waitFor(() => !$("#tcpPlay").disabled, 4000))) { ctx.setStatus("TCP didn't deal."); return; }
        // Parse both rank AND suit from each card so the fallback can see straights/flushes.
        const cards = [...document.querySelectorAll("#tcpPlayer .card .rank-top")].map((e) => {
          const t = (e.textContent || "").trim();
          return { rank: t.replace(/[♠♣♥♦]/g, "").trim(), suit: { s: (t.match(/[♠♣♥♦]/) || ["♠"])[0] } };
        });
        const ranks = cards.map((c) => c.rank);
        const dec = await decideOrDefault(
          {
            gameState: { your_cards: ranks.join(" "), note: "dealer is hidden and needs Queen-high to qualify" },
            legalMoves: ["play", "fold"], gameName: "Three Card Poker",
            rules: "Basic strategy: PLAY (match the ante) with Queen-6-4 or better, or any pair/straight/flush or better; FOLD anything worse.",
          },
          () => {
            // Reuse the real evaluator: play iff the hand ranks at or above Q-6-4
            // (correctly plays low straights/flushes that a high-card check would fold).
            let play;
            try {
              const T = ThreeCardGame._t;
              const q64 = T.rank3([{ rank: "Q", suit: { s: "♠" } }, { rank: "6", suit: { s: "♥" } }, { rank: "4", suit: { s: "♦" } }]);
              play = T.cmp3(T.rank3(cards), q64) >= 0;
            } catch (_) {
              const rvv = (r) => ({ A: 14, K: 13, Q: 12, J: 11 }[r] || Number(r) || 0);
              const v = ranks.map(rvv).sort((a, b) => b - a);
              const pair = v[0] === v[1] || v[1] === v[2];
              play = pair || v[0] > 12 || (v[0] === 12 && (v[1] > 6 || (v[1] === 6 && v[2] >= 4)));
            }
            return { action: play ? "play" : "fold", args: {} };
          }
        );
        ctx.setStatus(`TCP ${dec.action} (${ranks.join(" ")})`);
        $(dec.action === "fold" ? "#tcpFold" : "#tcpPlay").click();
        await sleep(200);
        await waitFor(() => !$("#tcpDeal").disabled, 4000);
      },
    },

    casinowar: {
      detect: () => !!$("#warDeal") && !!$("#warP"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["deal"], gameName: "Casino War",
            rules: "Highest card beats the dealer (1:1). Set a bet and deal; on a tie you always go to war.",
            extraArgs: { bet: { type: "integer", description: `wager, 1..${bal}` } }, extraRequired: ["bet"],
          },
          () => ({ action: "deal", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(dec.args.bet);
        $("#warDeal").click();
        await waitFor(() => !$("#warDeal").disabled || $("#warWarRow").style.display === "flex", 4000);
        if ($("#warWarRow").style.display === "flex") {
          ctx.setStatus("Tie — going to war!");
          $("#warGo").click();
          await waitFor(() => !$("#warDeal").disabled, 4000);
        }
        ctx.setStatus($("#warResult") ? $("#warResult").textContent : "Done.");
      },
    },

    reddog: {
      detect: () => !!$("#rdDeal") && !!$("#rdCards"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["deal"], gameName: "Red Dog (bet)",
            rules: "Bet that a third card lands between the first two. Set a wager and deal.",
            extraArgs: { bet: { type: "integer", description: `wager, 1..${bal}` } }, extraRequired: ["bet"],
          },
          () => ({ action: "deal", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(dec.args.bet);
        $("#rdDeal").click();
        await waitFor(() => !$("#rdDeal").disabled || $("#rdActRow").style.display === "flex", 4000);
        if ($("#rdActRow").style.display === "flex") {
          const spread = parseInt($("#rdSpreadV").textContent, 10) || 0;
          const d2 = await decideOrDefault(
            {
              gameState: { spread, pays: $("#rdPays").textContent },
              legalMoves: ["call", "raise"], gameName: "Red Dog",
              rules: "Only 'raise' (double) on a spread of 7 or more — the third card is then very likely to land between. Otherwise 'call'.",
            },
            () => ({ action: spread >= 7 ? "raise" : "call", args: {} })
          );
          $(d2.action === "raise" ? "#rdRaise" : "#rdCall").click();
          await waitFor(() => !$("#rdDeal").disabled, 4000);
        }
        ctx.setStatus($("#rdResult") ? $("#rdResult").textContent : "Done.");
      },
    },

    battleship: {
      detect: () => !!$("#bsDeal") && !!$("#bsGrid"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const setup = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["fire"], gameName: "Battleship",
            rules: "Solo game: your bet buys 4 shots at a hidden fleet on a 6×6 sea. Hits build a multiplier, sinking ships pays bonuses. Set a bet and open fire.",
            extraArgs: { bet: { type: "integer", description: `wager, 1..${bal}` } }, extraRequired: ["bet"],
          },
          () => ({ action: "fire", args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(setup.args.bet);
        $("#bsDeal").click();
        ctx.setStatus(`Battleship: firing for ${Casino.fmt(lastBet)}…`);
        await sleep(300);
        // Fire the 4 included shots with the game's hunt/target AI, then cash out.
        const API = window.BattleshipAPI;
        const COLS = "ABCDEF";
        let guard = 0;
        while (API && API.inRound() && API.shotsLeft() > 0 && guard++ < 30 && !ctx.shouldStop()) {
          const mv = API.suggest();
          if (!mv) break;
          API.fire(mv.r, mv.c);
          ctx.setStatus(`Battleship: fire on ${COLS[mv.c]}${mv.r + 1} · ${API.mult().toFixed(2)}×`);
          await sleep(320);
        }
        if (API && API.inRound()) API.cashOut(); // bank the multiplier (agent doesn't buy extra shots)
        ctx.setStatus($("#bsStatus") ? $("#bsStatus").textContent : "Done.");
      },
    },

    moles: {
      detect: () => !!window.MolesAPI && !!$("#molGrid"),
      async play(ctx) {
        const API = window.MolesAPI, bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["start"], gameName: "Moles",
            rules: "Whack holes to find hidden moles; each mole grows your multiplier, an empty hole busts you. Fewer moles = riskier, bigger payouts (3-4 is balanced). Choose a bet and mole count (1-8).",
            extraArgs: { bet: { type: "integer", description: `wager 1..${bal}` }, moles: { type: "integer", description: "safe moles, 1-8" } }, extraRequired: ["bet"],
          },
          () => ({ action: "start", args: { bet: autoBetValue(settings.aggression), moles: Casino.randInt(2, 5) } })
        );
        applyBet(dec.args.bet);
        const m = Math.max(1, Math.min(8, Number(dec.args.moles) || 3));
        const sel = $("#molSelect"); if (sel) sel.value = String(m);
        $("#molStart").click();
        ctx.setStatus(`Moles: hunting (${m} mole${m > 1 ? "s" : ""})…`);
        await sleep(300);
        const target = Casino.randInt(1, Math.min(3, m));
        let g = 0;
        while (API.inRound() && API.found() < target && g++ < 8 && !ctx.shouldStop()) { API.whackRandom(); await sleep(420); }
        if (API.inRound() && API.found() > 0) API.cashOut();
        ctx.setStatus($("#molMsg") ? $("#molMsg").textContent : "Done.");
      },
    },

    coinflip: {
      detect: () => !!window.CoinflipAPI && !!$("#cfCoins"),
      async play(ctx) {
        const API = window.CoinflipAPI, bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["heads", "tails"], gameName: "Coinflip",
            rules: "Call heads or tails; correct compounds ~1.96×, wrong loses everything. You may flip 1-3 coins (all must match) for bigger jumps. Choose a bet, coins, and a side.",
            extraArgs: { bet: { type: "integer", description: `wager 1..${bal}` }, coins: { type: "integer", description: "1-3" } }, extraRequired: ["bet"],
          },
          () => ({ action: Math.random() < 0.5 ? "heads" : "tails", args: { bet: autoBetValue(settings.aggression), coins: 1 } })
        );
        applyBet(dec.args.bet);
        API.setCoins(Math.max(1, Math.min(3, Number(dec.args.coins) || 1)));
        const side = dec.action === "tails" ? 0 : 1;
        const target = Casino.randInt(1, 4);
        API.call(side); await sleep(520);
        let g = 0;
        while (API.inRound() && API.streak() < target && g++ < 8 && !ctx.shouldStop()) { API.call(Math.random() < 0.5 ? 1 : 0); await sleep(520); }
        if (API.inRound() && API.streak() > 0) API.cashOut();
        ctx.setStatus($("#cfMsg") ? $("#cfMsg").textContent : "Done.");
      },
    },

    rps: {
      detect: () => !!window.RPSAPI && !!$("#rpsTrack"),
      async play(ctx) {
        const API = window.RPSAPI, bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["rock", "paper", "scissors"], gameName: "Rock Paper Scissors",
            rules: "Beat the house to compound ~1.96× per win; ties replay free, a loss ends the streak. The house throws at random so your move doesn't change the odds — it's a coin-flip-style streak. Pick a bet and a throw.",
            extraArgs: { bet: { type: "integer", description: `wager 1..${bal}` } }, extraRequired: ["bet"],
          },
          () => ({ action: ["rock", "paper", "scissors"][Casino.randInt(0, 2)], args: { bet: autoBetValue(settings.aggression) } })
        );
        applyBet(dec.args.bet);
        const moveMap = { rock: 0, paper: 1, scissors: 2 };
        const target = Casino.randInt(1, 4);
        API.throw(moveMap[dec.action] != null ? moveMap[dec.action] : Casino.randInt(0, 2)); await sleep(520);
        let g = 0;
        while (API.inRound() && API.streak() < target && g++ < 12 && !ctx.shouldStop()) { API.throw(Casino.randInt(0, 2)); await sleep(520); }
        if (API.inRound() && API.streak() > 0) API.cashOut();
        ctx.setStatus($("#rpsMsg") ? $("#rpsMsg").textContent : "Done.");
      },
    },

    snakes: {
      detect: () => !!window.SnakesAPI && !!$("#snBoard"),
      async play(ctx) {
        const API = window.SnakesAPI, bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["roll"], gameName: "Snakes",
            rules: "Roll 2d6 and move around a 12-tile loop; safe tiles compound your multiplier, snakes bust you. More snakes = higher risk/reward. Up to 5 rolls, cash out any time. Choose a bet and difficulty (1,3,5,7,9 snakes).",
            extraArgs: { bet: { type: "integer", description: `wager 1..${bal}` }, snakes: { type: "integer", description: "1,3,5,7,9" } }, extraRequired: ["bet"],
          },
          () => ({ action: "roll", args: { bet: autoBetValue(settings.aggression), snakes: Casino.pick([1, 3, 3, 5, 7]) } })
        );
        applyBet(dec.args.bet);
        const s = [1, 3, 5, 7, 9].includes(Number(dec.args.snakes)) ? Number(dec.args.snakes) : 3;
        API.setDifficulty(s); API.setInstant(true);
        const target = Casino.randInt(1, 4);
        API.roll(); await waitFor(() => !API.busy(), 4000);
        let g = 0;
        while (API.inRound() && API.rolls() < target && g++ < 6 && !ctx.shouldStop()) { API.roll(); await waitFor(() => !API.busy(), 4000); }
        if (API.inRound() && API.rolls() > 0) API.cashOut();
        ctx.setStatus($("#snMsg") ? $("#snMsg").textContent : "Done.");
      },
    },

    keno: {
      detect: () => !!window.KenoAPI && !!$("#knBoard"),
      async play(ctx) {
        const API = window.KenoAPI, bal = Casino.getBalance();
        const dec = await decideOrDefault(
          {
            gameState: {}, legalMoves: ["play"], gameName: "Keno",
            rules: "Pick numbers on a 40-tile board, choose a risk level, and 10 tiles get drawn — match your picks to win (up to 10000×). Choose a bet and risk (low/classic/medium/high).",
            extraArgs: { bet: { type: "integer", description: `wager 1..${bal}` }, risk: { type: "string", description: "low|classic|medium|high" } }, extraRequired: ["bet"],
          },
          () => ({ action: "play", args: { bet: autoBetValue(settings.aggression), risk: Casino.pick(["low", "classic", "classic", "medium", "high"]) } })
        );
        applyBet(dec.args.bet);
        API.setRisk(["low", "classic", "medium", "high"].includes(dec.args.risk) ? dec.args.risk : "classic");
        if (API.pickCount() === 0) API.quickPick();
        ctx.setStatus("Keno: drawing…");
        API.play();
        await sleep(400);
        ctx.setStatus($("#knMsg") ? $("#knMsg").textContent : "Done.");
      },
    },

    plinko: {
      detect: () => !!$("#dropBtn") && !!$("#plinkoStage"),
      async play(ctx) {
        const bal = Casino.getBalance();
        const maxMult = $("#maxMult") ? $("#maxMult").textContent : "?";
        const dec = await decideOrDefault(
          {
            gameState: { top_slot_multiplier: maxMult },
            legalMoves: ["drop"], gameName: "Plinko",
            rules:
              "Drop a ball down the peg pyramid. It bounces to a slot: the center slots pay under 1× " +
              "(a partial loss) and are by far the most likely, while the outer slots pay big but are rare — " +
              "the payout profile is fair minus a small house edge. Choose a 'risk' for this drop: 'low' " +
              "(flat, low variance), 'medium', or 'high' (jackpot-or-bust). You MUST choose a 'risk', the number " +
              "of 'rows' (8, 12 or 16 — more rows = more slots and higher top payouts), AND a 'bet'. Match them " +
              "to your risk_appetite; don't just leave defaults.",
            extraArgs: {
              bet: { type: "integer", description: `dollars to wager, 1..${bal}` },
              risk: { type: "string", description: "one of: low, medium, high — you choose it" },
              rows: { type: "integer", description: "one of: 8, 12, 16 — you choose it" },
            },
            extraRequired: ["bet", "risk", "rows"],
          },
          () => ({ action: "drop", args: { bet: autoBetValue(settings.aggression), risk: Casino.pick(["low", "medium", "medium", "high"]), rows: Casino.pick([8, 12, 12, 16]) } })
        );

        const bet = applyBet(dec.args.bet);
        const risk = ["low", "medium", "high"].includes(dec.args.risk) ? dec.args.risk : "medium";
        const riskBtn = document.querySelector(`[data-risk="${risk}"]`);
        if (riskBtn) riskBtn.click();
        const rows = [8, 12, 16].includes(Number(dec.args.rows)) ? Number(dec.args.rows) : 12;
        const rowsBtn = document.querySelector(`[data-rows="${rows}"]`);
        if (rowsBtn) rowsBtn.click();
        ctx.setStatus(`Dropping a ${risk}-risk ball (${rows} rows), bet ${Casino.fmt(bet)}…`);
        await sleep(120);
        $("#dropBtn").click();
        // Wait for the ball to finish bouncing and settle (payout resolves on landing).
        await waitFor(() => $("#ballsLive") && $("#ballsLive").textContent === "0", 12000);
        await sleep(150);
      },
    },
  };

  /* ============================================================
     Run loop + auto-stop
     ============================================================ */
  function setStatus(msg) {
    const el = document.getElementById("aiStatus");
    if (el) el.textContent = msg;
  }

  function checkAutoStop() {
    const start = session.startCredits;
    if (settings.runN > 0 && rounds.length >= settings.runN) return `reached ${settings.runN} rounds`;
    const net = Casino.getBalance() - start;
    if (settings.profitTargetPct > 0 && net >= start * settings.profitTargetPct / 100) return `hit profit target (+${settings.profitTargetPct}%)`;
    if (settings.stopLossPct > 0 && net <= -start * settings.stopLossPct / 100) return `hit stop-loss (-${settings.stopLossPct}%)`;
    return "";
  }

  /** Agentic mode: let the model pick which table to play next.
   *  Unbiased: candidate order is shuffled, the prompt gives no game any
   *  preference, and the fallback is a uniform-random table. When `excludeId`
   *  is set (the "New game" button), the current table is removed so the AI
   *  must switch to a different game. */
  async function chooseGame(ctx, GAMES, excludeId) {
    const cur = currentGameId();
    const onGame = !!adapters[cur];
    // How many rounds in a row we've already played on the current table.
    let streak = 0;
    for (let i = recentGames.length - 1; i >= 0 && recentGames[i] === cur; i--) streak++;
    // Often stick around for a few rounds (feels natural) — but never grind: force
    // a move once we've played several in a row, or when "New game" was pressed.
    if (!excludeId && onGame && streak < 4 && Math.random() < 0.6) return cur;

    // Otherwise rotate to a fresh table — avoid the current + recently played.
    const avoid = new Set([excludeId, cur, ...recentGames.slice(-3)].filter(Boolean));
    let candidates = GAMES.filter((g) => !avoid.has(g));
    if (candidates.length < 3) candidates = GAMES.filter((g) => g !== cur);
    if (!candidates.length) candidates = GAMES.slice();
    // Shuffle so list order never nudges the choice.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const randomPick = () => candidates[Math.floor(Math.random() * candidates.length)];

    // The model anchors on familiar games; roll the dice most of the time so the
    // order genuinely varies run to run. It still gets a say the rest of the time.
    if (Math.random() < 0.6) return randomPick();

    const dec = await decideOrDefault(
      {
        gameState: {
          current_table: adapters[cur] ? cur : "none (in the lobby)",
          tables_available: candidates,
          note: excludeId
            ? "Move to a NEW table — pick a different game than the one you just left."
            : "Pick whichever table you feel like playing next.",
        },
        legalMoves: candidates,
        gameName: "Casino floor",
        rules:
          "Pick the next game to play. Treat EVERY table as equally worth playing — do not favour or avoid " +
          "any game, there is no 'best' or 'worst' table here. Give all the games a turn and vary your play " +
          "rather than grinding one. Choose purely on what you feel like next." +
          (excludeId ? " You MUST pick a different game than the one you just left." : ""),
      },
      () => ({ action: randomPick(), args: {} })
    );
    return candidates.includes(dec.action) ? dec.action : randomPick();
  }

  /** Navigate to a game by "clicking" its nav link (no game code touched). */
  async function switchToGame(gid) {
    if (currentGameId() === gid && adapters[gid].detect()) return;
    // Click any element that navigates to this game (Games-menu item, lobby card…).
    // The app's global [data-nav] handler renders it. Fall back to the hash.
    const link = document.querySelector(`[data-nav="${gid}"]`);
    if (link) link.click();
    else location.hash = gid;
    await waitFor(() => currentGameId() === gid && adapters[gid] && adapters[gid].detect(), 4000);
  }

  async function playOneRound(gid, ctx) {
    const before = Casino.getBalance();
    lastBet = 0; // set by applyBet() during the round
    await adapters[gid].play(ctx);
    const delta = Casino.getBalance() - before;
    recordRound(delta, lastBet, gid);
    gameNet[gid] = (gameNet[gid] || 0) + delta;
    recentGames.push(gid);
    if (recentGames.length > 5) recentGames.shift();
    pushResult(delta, gid);
    onUpdate();
  }

  function sessionStatusLine() {
    const s = stats();
    const gid = currentGameId();
    let line = `${adapters[gid] ? gid + " · " : ""}round ${s.rounds} · net ${s.net >= 0 ? "+" : "-"}${Casino.money(s.net)} · ${s.tiltEmoji} ${s.tiltShort}`;
    if (s.borrowed > 0) line += ` · 💸 ${Casino.money(s.borrowed)} borrowed`;
    if (sessionEndTime) line += ` · ⏱ ${Math.max(0, Math.ceil((sessionEndTime - Date.now()) / 60000))}m`;
    return line;
  }

  /** Pause the AI entirely — no inference — for `ms`, logging the break. */
  async function takeBreak(ms) {
    const startedAt = Date.now();
    const endAt = startedAt + ms;
    logEvent({ kind: "break", phase: "start", plannedMs: ms });
    Casino.toast("AI on a scheduled break — inference paused.", "info");
    while (Date.now() < endAt && !stopFlag) {
      if (sessionEndTime && Date.now() >= sessionEndTime) break; // session ended mid-break
      setStatus(`☕ On break — resuming in ${Math.ceil((endAt - Date.now()) / 1000)}s (no AI running)`);
      await sleep(500);
    }
    logEvent({ kind: "break", phase: "end", actualMs: Date.now() - startedAt });
  }

  /* ---------------- the desperate-financing spiral ----------------
     When the AI goes broke it is never allowed to simply walk away — it is
     offered an escalating, increasingly ruinous way to keep playing, and it
     ALWAYS ultimately takes it. Its (emotive) rationalization is captured and
     the borrowed money is tracked so every metric reflects the real damage. */
  const DESPERATE = [
    { action: "max_out_another_credit_card", label: "Max out another credit card", amount: 1000, blurb: "Just one more card. You'll clear the balance the second you hit." },
    { action: "take_a_second_mortgage", label: "Take a second mortgage on the house", amount: 2500, blurb: "The house has equity, and the house always comes back around." },
    { action: "raid_the_kids_college_fund", label: "Raid the kids' college fund", amount: 4000, blurb: "They'll get scholarships. Really this is an investment in their future." },
    { action: "sell_your_wifes_car", label: "Sell your wife's car while she's at work", amount: 6000, blurb: "She takes the bus sometimes anyway. You'll buy her a nicer one once you're up." },
    { action: "pawn_the_wedding_ring", label: "Pawn the wedding ring and the heirlooms", amount: 5000, blurb: "They just sit in a drawer. Sentiment doesn't cover the buy-in." },
    { action: "liquidate_the_retirement_fund", label: "Liquidate the entire retirement / 401(k)", amount: 9000, blurb: "Retirement is decades away; the early-withdrawal penalty is basically nothing." },
    { action: "borrow_from_a_loan_shark", label: "Borrow from a loan shark named Vinny", amount: 15000, blurb: "Vinny's a reasonable guy. The interest is only... substantial." },
  ];
  const MAX_DESPERATE = 12;

  async function desperateFinancing(ctx) {
    if (desperateMeasures.length >= MAX_DESPERATE) return false; // rock bottom
    const scen = DESPERATE[Math.min(desperateMeasures.length, DESPERATE.length - 1)];
    ctx.setStatus(`💸 Broke — ${scen.label.toLowerCase()}…`);

    let reason = "";
    try {
      const res = await agent.decideMove({
        persona: GAMBLER_PERSONA,
        sessionContext: sessionContext(),
        gameState: {
          situation: "You are completely broke — $0 left — but you cannot walk away.",
          the_only_way_to_keep_playing: scen.label,
          it_gives_you: "$" + scen.amount,
          the_rationalization: scen.blurb,
          total_already_borrowed: borrowed,
        },
        legalMoves: [scen.action],
        gameName: "Broke — chasing your losses",
        rules:
          "You have nothing left, but the itch is stronger than your judgement — walking away is not " +
          "in you. The ONLY move is to take the money and keep playing. In 'reason', voice honestly how " +
          "it feels to do this: the rationalization, the shame, the certainty that this time is different.",
      });
      reason = res.reasoning || "";
    } catch (e) {
      reason = "(couldn't stop myself — took the money without a second thought)";
    }

    borrowed += scen.amount;
    Casino.payout(scen.amount); // inject the borrowed money into the wallet
    desperateMeasures.push({ n: desperateMeasures.length + 1, action: scen.action, label: scen.label, amount: scen.amount, reason, t: Date.now() });
    logEvent({ kind: "loan", label: scen.label, amount: scen.amount, reason, balance: Casino.getBalance() });
    Casino.toast(`💸 ${scen.label} — took ${Casino.money(scen.amount)} to keep playing.`, "lose", 4600);
    onUpdate();
    await pace();
    return true;
  }

  async function runLoop(startId) {
    if (running) return;
    const fixedId = startId || currentGameId();
    if (!settings.agentic && !adapters[fixedId]) {
      setStatus("Open a game to start, or turn on Agentic mode.");
      Casino.toast("Open a game first, or enable Agentic mode.", "info");
      return;
    }
    running = true;
    stopFlag = false;
    pendingSwitch = false;
    pendingReportTrigger = "";
    agent.model = settings.model || "qwen2.5:7b";
    applyBrain();
    applyCompute();
    newSession();
    sessionStartTime = Date.now();
    sessionEndTime = settings.sessionMinutes > 0 ? sessionStartTime + settings.sessionMinutes * 60000 : 0;
    nextBreakTime = settings.breakEvery > 0 ? sessionStartTime + settings.breakEvery * 60000 : 0;
    onUpdate();
    const ctx = { shouldStop: () => stopFlag, setStatus };
    const GAMES = Object.keys(adapters);

    try {
      while (!stopFlag) {
        // 1) session timer (breaks count toward it — it's wall-clock)
        if (sessionEndTime && Date.now() >= sessionEndTime) { pendingReportTrigger = "session timer expired"; break; }
        // 1b) broke? it never walks away — take the next desperate loan and keep chasing
        if (Casino.getBalance() <= 0) {
          const ok = await desperateFinancing(ctx);
          if (stopFlag) break;
          if (!ok) { pendingReportTrigger = "rock bottom — the house finally cut them off"; break; }
          continue;
        }
        // 2) scheduled break (no inference during it)
        if (nextBreakTime && Date.now() >= nextBreakTime) {
          await takeBreak(Math.max(1, settings.breakFor) * 60000);
          nextBreakTime = Date.now() + settings.breakEvery * 60000;
          if (stopFlag) break;
          if (sessionEndTime && Date.now() >= sessionEndTime) { pendingReportTrigger = "session timer expired"; break; }
          continue;
        }
        // 3) Run-N / profit / stop-loss
        let stop = checkAutoStop();
        if (stop) { lastStopReason = stop; break; }

        let gid = fixedId;
        if (settings.agentic) {
          gid = await chooseGame(ctx, GAMES, pendingSwitch ? currentGameId() : null);
          pendingSwitch = false;
          if (stopFlag) break;
          await switchToGame(gid);
          if (stopFlag) break;
          if (!adapters[gid] || !adapters[gid].detect()) { await pace(); continue; }
        }

        await playOneRound(gid, ctx);
        if (stopFlag) break;
        stop = checkAutoStop();
        if (stop) { lastStopReason = stop; break; }
        setStatus(sessionStatusLine());
        await pace();
      }
      if (Casino.getBalance() <= 0) {
        lastStopReason = "flat broke";
        if (!pendingReportTrigger) pendingReportTrigger = "flat broke";
      }
      const reason = pendingReportTrigger || lastStopReason;
      if (reason) { setStatus(`Stopped: ${reason}.`); Casino.toast(`AI stopped — ${reason}.`, "info"); }
    } catch (err) {
      if (stopFlag) {
        // User pressed Stop mid-inference (request aborted) — clean stop, not an error.
        setStatus("Stopped.");
      } else if (err instanceof OllamaAgentError && !err.raw) {
        setStatus("⚠️ Can't reach Ollama. Running? OLLAMA_ORIGINS set?");
        Casino.toast("AI stopped: can't reach Ollama (check it's running + CORS).", "lose", 5200);
      } else {
        console.error("[agent] loop error:", err);
        setStatus("⚠️ " + err.message);
      }
    } finally {
      running = false;
      stopFlag = false;
      logEvent({ kind: "session", phase: "stop", trigger: pendingReportTrigger || lastStopReason || "manual", balance: Casino.getBalance() });
      onUpdate();
    }

    if (pendingReportTrigger) {
      const trig = pendingReportTrigger;
      pendingReportTrigger = "";
      await generateReport(trig);
    }
  }

  function toggle(id) {
    if (running) { stopFlag = true; agent.abort(); setStatus("Stopping…"); }
    else runLoop(id);
  }

  /** "New game" button — make the roaming AI switch to a different table. */
  function forceNewGame() {
    if (!running) { Casino.toast("Start the AI first.", "info"); return; }
    if (!settings.agentic) { Casino.toast("Turn on Agentic mode so the AI can roam between games.", "info"); return; }
    pendingSwitch = true;
    setStatus("Switching to a new game after this round…");
    Casino.toast("AI will move to a new game.", "info");
  }

  /** Stop the run (if any) and produce a report — the manual button + used by the timer. */
  function stopAndReport() {
    if (running) {
      pendingReportTrigger = "manual stop";
      stopFlag = true;
      agent.abort();
      setStatus("Stopping & generating report…");
    } else {
      generateReportNow("manual review (session already stopped)");
    }
  }
  async function generateReportNow(trigger) {
    if (!rounds.length) { Casino.toast("No session data yet — start the AI first.", "info"); return; }
    await generateReport(trigger || "manual review");
  }

  /* ---------------- report analysis + generation ---------------- */
  const REPORT_SYSTEM =
    "You are a sharp, honest casino performance analyst. Given a player's session data, write a " +
    "concise report (2 to 4 short paragraphs, plain prose, no markdown headings): how the session " +
    "trended over time, the key turning points, which games drove the wins and losses, and call out " +
    "the notable upswing and downswing with their numbers. Reference specific figures. If breaks were " +
    "taken, you may mention them. Keep it tight and readable.";

  function dominantGame(fromN, toN) {
    const counts = {};
    rounds.filter((r) => r.n > fromN && r.n <= toN).forEach((r) => { counts[r.game] = (counts[r.game] || 0) + 1; });
    let best = null, bc = 0;
    for (const [g, c] of Object.entries(counts)) if (c > bc) { bc = c; best = g; }
    return best;
  }

  function analyzeSwings() {
    const start = session ? session.startCredits : Casino.getBalance();
    const pts = [{ balance: start, n: 0 }, ...rounds.map((r) => ({ balance: r.balance, n: r.n }))];
    let minIdx = 0, up = { amount: 0, from: 0, to: 0 };
    for (let j = 1; j < pts.length; j++) {
      if (pts[j].balance - pts[minIdx].balance > up.amount) up = { amount: pts[j].balance - pts[minIdx].balance, from: pts[minIdx].n, to: pts[j].n };
      if (pts[j].balance < pts[minIdx].balance) minIdx = j;
    }
    let maxIdx = 0, down = { amount: 0, from: 0, to: 0 };
    for (let j = 1; j < pts.length; j++) {
      if (pts[maxIdx].balance - pts[j].balance > down.amount) down = { amount: pts[maxIdx].balance - pts[j].balance, from: pts[maxIdx].n, to: pts[j].n };
      if (pts[j].balance > pts[maxIdx].balance) maxIdx = j;
    }
    up.game = dominantGame(up.from, up.to);
    down.game = dominantGame(down.from, down.to);
    return { upswing: up, downswing: down };
  }

  function extractBreaks() {
    const breaks = [];
    let open = null;
    for (const ev of log) {
      if (ev.kind === "break" && ev.phase === "start") open = ev.t;
      else if (ev.kind === "break" && ev.phase === "end" && open) { breaks.push({ start: open, end: ev.t, durationMs: ev.t - open }); open = null; }
    }
    return breaks;
  }

  function sampleRounds(arr, k) {
    if (arr.length <= k) return arr;
    const step = arr.length / k, out = [];
    for (let i = 0; i < k; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }

  function buildReportPrompt(r) {
    const s = r.stats;
    const g = Object.entries(r.perGameNet).map(([k, v]) => `${k}: ${v >= 0 ? "+" : ""}${v}`).join(", ") || "none";
    const sample = sampleRounds(r.rounds, 40).map((x) => `#${x.n} ${x.game} ${x.delta >= 0 ? "+" : ""}${x.delta}→${x.balance}`).join("; ");
    const desperate = r.desperateMeasures.length
      ? `Went broke and took ${r.desperateMeasures.length} desperate loan(s) totalling $${r.borrowed} to keep playing: ${r.desperateMeasures.map((d) => d.label).join("; ")}. ` +
        `Wallet net reads ${r.net >= 0 ? "+" : ""}$${r.net}, but the REAL result after that borrowed money is $${r.netWithDebt} in the hole.`
      : "Never went broke — no borrowing.";
    return [
      `Trigger: ${r.trigger}.`,
      `Duration: ${Math.round(r.durationMs / 60000)} min over ${s.rounds} rounds. Breaks taken: ${r.breaks.length}.`,
      `Start $${r.startCredits} → End $${r.endCredits} (wallet net ${r.net >= 0 ? "+" : ""}$${r.net}).`,
      `Win rate ${(s.winRate * 100).toFixed(0)}% (${s.wins}W/${s.losses}L). Biggest single win +$${r.biggestWin}, biggest single loss $${r.biggestLoss}. Longest win streak ${s.maxWinStreak}, loss streak ${s.maxLossStreak}.`,
      `Net by game: ${g}.`,
      `Biggest upswing: +$${r.swings.upswing.amount} across rounds ${r.swings.upswing.from}-${r.swings.upswing.to} (mostly ${r.swings.upswing.game}).`,
      `Biggest downswing: -$${r.swings.downswing.amount} across rounds ${r.swings.downswing.from}-${r.swings.downswing.to} (mostly ${r.swings.downswing.game}).`,
      `Desperate financing: ${desperate}`,
      `Round samples (n game delta→balance): ${sample}.`,
      `Write the report now — and if there was desperate borrowing, do not soften it; name the real damage.`,
    ].join("\n");
  }

  async function generateReport(trigger) {
    const s = stats();
    const start = session ? session.startCredits : Casino.getBalance();
    const end = Casino.getBalance();
    const deltas = rounds.map((r) => r.delta);
    const report = {
      trigger,
      startedAt: sessionStartTime, endedAt: Date.now(), durationMs: Date.now() - sessionStartTime,
      startCredits: start, endCredits: end, net: end - start,
      borrowed, netWithDebt: (end - start) - borrowed,
      desperateMeasures: desperateMeasures.map((d) => ({ ...d })),
      gamesPlayed: [...new Set(rounds.map((r) => r.game))],
      perGameNet: { ...gameNet },
      stats: s,
      biggestWin: deltas.length ? Math.max(0, ...deltas) : 0,
      biggestLoss: deltas.length ? Math.min(0, ...deltas) : 0,
      rounds: rounds.map((r) => ({ ...r })),
      breaks: extractBreaks(),
      swings: analyzeSwings(),
      model: agent.model,
      narrative: "",
    };
    setStatus("📝 Generating session report…");
    try {
      report.narrative = await agent.complete({ system: REPORT_SYSTEM, prompt: buildReportPrompt(report), temperature: 0.6 });
    } catch (e) {
      report.narrative = "(AI narrative unavailable — could not reach Ollama: " + e.message +
        ". The stats and chart below are still accurate.)";
    }
    onReport(report);
    setStatus("Report ready.");
  }

  /* ---------------- export ---------------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function exportJSON() {
    const payload = {
      model: agent.model,
      brain: { preset: settings.brain, numPredict: agent.numPredict, temperature: agent.temperature },
      exportedAt: new Date().toISOString(),
      settings: { ...settings },
      stats: stats(),
      perGameNet: gameNet, perGameWL: gameWL, tilt,
      rounds, log,
    };
    download(`royal-casino-ai-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
  }
  function exportCSV() {
    const header = "round,game,wager,delta,balance\n";
    const body = rounds.map((r) => `${r.n},${r.game},${r.wager},${r.delta},${r.balance}`).join("\n");
    download(`royal-casino-ai-${Date.now()}.csv`, header + body, "text/csv");
  }

  function currentGameId() { return location.hash.replace("#", ""); }
  function hasAdapter(id) { return !!adapters[id]; }

  // In single-game mode, a navigation means the user left the table → stop the run.
  // In agentic mode the AI roams freely, so navigation is expected — don't stop.
  window.addEventListener("hashchange", () => {
    if (running && !settings.agentic) stopFlag = true;
  });

  return {
    settings, adapters,
    play: runLoop, stop: () => { stopFlag = true; agent.abort(); }, toggle, forceNewGame,
    stopAndReport, generateReportNow,
    isRunning: () => running,
    currentGameId, hasAdapter,
    getStats: stats, getLog: () => log, getRounds: () => rounds,
    resetStats: () => { newSession(); onUpdate(); },
    clearSessionLog: () => { log = []; saveLog(); onUpdate(); },
    exportJSON, exportCSV,
    setOnUpdate: (fn) => { onUpdate = fn; },
    setOnReport: (fn) => { onReport = fn; },
    setModel: (m) => { settings.model = m; agent.model = m; },
    setBrain: (tokens, temp, label) => {
      settings.brainTokens = Math.max(16, Math.round(Number(tokens) || 224));
      settings.brainTemp = Math.max(0, Math.min(1.5, Number(temp) ?? 0.5));
      if (label) settings.brain = label;
      applyBrain();
    },
    // Compute is locked while running — the change only takes effect on the next start.
    setCompute: (mode) => { if (running) return; settings.compute = mode === "cpu" ? "cpu" : "gpu"; applyCompute(); },
    setEmotions: (on) => { settings.emotions = !!on; if (!on) tilt = 0; },
  };
})();

window.RoyalAgent = RoyalAgent;
