/* ============================================================
   Texas Hold'em — no-limit, you vs. betting bots
   ------------------------------------------------------------
   The tricky "math" is three things, all self-contained here:
   1) a 7-card evaluator (best 5 of 7) returning a comparable score,
   2) Monte-Carlo equity so bots bet by real win-odds vs pot odds,
   3) side-pot splitting for all-ins (chip count is always conserved).
   The engine (Table) is DOM-free so it can be tested headlessly;
   the UI just drives it and renders state.
   ============================================================ */
const HoldemGame = (() => {
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RED = { "♥": true, "♦": true };
  const RANKS = { 11: "J", 12: "Q", 13: "K", 14: "A" };
  const rankStr = (r) => RANKS[r] || String(r);

  function freshDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
    return d;
  }
  function shuffle(d) {
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  /* ---------- hand evaluation ---------- */
  // all 5-card subsets of 7 indices
  const COMBO7 = (() => {
    const out = [];
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let c = b + 1; c < 5; c++)
      for (let e = c + 1; e < 6; e++) for (let f = e + 1; f < 7; f++) out.push([a, b, c, e, f]);
    return out;
  })();

  function rank5(cs) {
    const rs = cs.map((c) => c.r).sort((a, b) => b - a);
    const flush = cs.every((c) => c.s === cs[0].s);
    const uniq = [...new Set(rs)];
    let straightHigh = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5; // wheel
    }
    const cnt = {};
    rs.forEach((r) => (cnt[r] = (cnt[r] || 0) + 1));
    const groups = Object.keys(cnt).map((r) => ({ r: +r, c: cnt[r] }))
      .sort((a, b) => b.c - a.c || b.r - a.r);
    const counts = groups.map((g) => g.c);
    const gr = groups.map((g) => g.r);

    if (straightHigh && flush) return [8, straightHigh];
    if (counts[0] === 4) return [7, gr[0], gr[1]];
    if (counts[0] === 3 && counts[1] === 2) return [6, gr[0], gr[1]];
    if (flush) return [5, ...rs];
    if (straightHigh) return [4, straightHigh];
    if (counts[0] === 3) return [3, gr[0], gr[1], gr[2]];
    if (counts[0] === 2 && counts[1] === 2) return [2, gr[0], gr[1], gr[2]];
    if (counts[0] === 2) return [1, gr[0], gr[1], gr[2], gr[3]];
    return [0, ...rs];
  }
  function cmp(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x - y; }
    return 0;
  }
  function best7(cards7) {
    let best = null;
    for (const idx of COMBO7) {
      const sc = rank5([cards7[idx[0]], cards7[idx[1]], cards7[idx[2]], cards7[idx[3]], cards7[idx[4]]]);
      if (!best || cmp(sc, best) > 0) best = sc;
    }
    return best;
  }
  const CAT = ["High card", "Pair", "Two pair", "Three of a kind", "Straight",
    "Flush", "Full house", "Four of a kind", "Straight flush"];
  function handName(score) {
    if (score[0] === 8 && score[1] === 14) return "Royal flush";
    return CAT[score[0]];
  }

  /* ---------- Monte-Carlo equity ---------- */
  function equity(hole, board, numOpp, samples) {
    const known = [...hole, ...board];
    const keyOf = (c) => c.r * 4 + c.s;
    const knownKeys = new Set(known.map(keyOf));
    let score = 0;
    for (let s = 0; s < samples; s++) {
      const deck = freshDeck().filter((c) => !knownKeys.has(keyOf(c)));
      shuffle(deck);
      let di = 0;
      const full = board.slice();
      while (full.length < 5) full.push(deck[di++]);
      const mine = best7([...hole, ...full]);
      let beat = false, tie = 0;
      for (let o = 0; o < numOpp; o++) {
        const opp = best7([deck[di++], deck[di++], ...full]);
        const c = cmp(opp, mine);
        if (c > 0) { beat = true; break; }
        if (c === 0) tie++;
      }
      if (!beat) score += tie > 0 ? 1 / (tie + 1) : 1;
    }
    return score / samples;
  }

  /* ---------- side pots (chip-conserving) ---------- */
  function buildPots(committed, folded) {
    const c = committed.slice();
    const pots = [];
    while (true) {
      const live = c.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
      if (!live.length) break;
      const min = Math.min(...live.map((x) => x.v));
      let amount = 0;
      const eligible = [];
      live.forEach((x) => { c[x.i] -= min; amount += min; if (!folded[x.i]) eligible.push(x.i); });
      if (pots.length && sameSet(pots[pots.length - 1].eligible, eligible)) pots[pots.length - 1].amount += amount;
      else pots.push({ amount, eligible });
    }
    return pots;
  }
  function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }

  /* ============================================================
     Table engine — synchronous, DOM-free
     ============================================================ */
  function makeTable(names, stacks, sb, bb, button) {
    const P = names.map((name, i) => ({
      name, stack: stacks[i], hole: [], folded: false, allIn: false,
      betRound: 0, committed: 0, hasActed: false, alive: stacks[i] > 0, lastAction: "",
    }));
    const T = {
      players: P, sb, bb, button, community: [], deck: [],
      street: 0, currentBet: 0, minRaise: bb, actionOn: -1,
      pots: [], handOver: false, result: null, log: [],
    };

    const activeSeats = () => P.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
    const nextAlive = (from) => {
      const seats = activeSeats();
      for (let k = 1; k <= P.length; k++) {
        const i = (from + k) % P.length;
        if (P[i].alive) return i;
      }
      return from;
    };
    const nextToAct = (from) => {
      for (let k = 1; k <= P.length; k++) {
        const i = (from + k) % P.length;
        if (P[i].alive && !P[i].folded && !P[i].allIn) return i;
      }
      return -1;
    };
    const contenders = () => P.filter((p) => p.alive && !p.folded);
    const potTotal = () => P.reduce((a, p) => a + p.committed, 0);

    function putChips(p, amt) {
      amt = Math.min(amt, p.stack);
      p.stack -= amt; p.betRound += amt; p.committed += amt;
      if (p.stack === 0) p.allIn = true;
      return amt;
    }

    function startHand() {
      const seats = activeSeats();
      T.deck = shuffle(freshDeck());
      T.community = []; T.street = 0; T.currentBet = 0; T.minRaise = bb;
      T.handOver = false; T.result = null; T.pots = [];
      P.forEach((p) => { p.hole = []; p.folded = !p.alive; p.allIn = false; p.betRound = 0; p.committed = 0; p.hasActed = false; p.lastAction = ""; });
      // deal 2 to each alive player
      for (let d = 0; d < 2; d++) for (const i of seats) P[i].hole.push(T.deck.pop());
      // blinds (heads-up handled loosely: SB = seat after button)
      const sbSeat = seats.length === 2 ? T.button : nextAlive(T.button);
      const bbSeat = nextAlive(sbSeat);
      putChips(P[sbSeat], sb); P[sbSeat].lastAction = "SB";
      putChips(P[bbSeat], bb); P[bbSeat].lastAction = "BB";
      T.currentBet = bb;
      T.actionOn = nextToAct(bbSeat);
      T.sbSeat = sbSeat; T.bbSeat = bbSeat;
    }

    function legal() {
      const p = P[T.actionOn];
      if (!p) return [];
      const toCall = T.currentBet - p.betRound;
      const acts = [];
      acts.push({ type: "fold" });
      if (toCall <= 0) acts.push({ type: "check" });
      else acts.push({ type: "call", amount: Math.min(toCall, p.stack) });
      // raise possible if the player has more than the call
      if (p.stack > toCall) {
        const minTo = T.currentBet + T.minRaise;
        acts.push({ type: "raise", min: Math.min(minTo, p.betRound + p.stack), max: p.betRound + p.stack });
      }
      return acts;
    }

    // action: {type, amount?} where for raise, amount = target total betRound
    function act(action) {
      const p = P[T.actionOn];
      if (!p) return;
      const toCall = T.currentBet - p.betRound;
      if (action.type === "fold") { p.folded = true; p.hasActed = true; p.lastAction = "Fold"; }
      else if (action.type === "check") { p.hasActed = true; p.lastAction = "Check"; }
      else if (action.type === "call") { putChips(p, toCall); p.hasActed = true; p.lastAction = p.allIn ? "All-in" : "Call"; }
      else if (action.type === "raise") {
        const target = Math.max(action.amount || 0, T.currentBet + T.minRaise);
        const add = Math.min(target - p.betRound, p.stack);
        const wasFullRaise = (p.betRound + add) - T.currentBet >= T.minRaise;
        putChips(p, add);
        if (p.betRound > T.currentBet) {
          if (wasFullRaise) T.minRaise = p.betRound - T.currentBet;
          T.currentBet = p.betRound;
          // reopen action for everyone else
          P.forEach((q) => { if (q !== p && q.alive && !q.folded && !q.allIn) q.hasActed = false; });
        }
        p.hasActed = true;
        p.lastAction = p.allIn ? "All-in" : "Raise";
      }
      afterAct();
    }

    function roundClosed() {
      if (contenders().length <= 1) return true;
      const act = P.filter((p) => p.alive && !p.folded && !p.allIn);
      if (!act.length) return true; // everyone remaining is all-in
      return act.every((p) => p.hasActed && p.betRound === T.currentBet);
    }

    function afterAct() {
      if (contenders().length <= 1) { endHand(); return; }
      if (roundClosed()) { nextStreet(); return; }
      T.actionOn = nextToAct(T.actionOn);
    }

    function nextStreet() {
      // if all but one are all-in, run out the board then showdown
      P.forEach((p) => { p.betRound = 0; p.hasActed = false; });
      T.currentBet = 0; T.minRaise = bb;
      if (T.street === 0) { T.deck.pop(); T.community.push(T.deck.pop(), T.deck.pop(), T.deck.pop()); } // burn + flop
      else if (T.street === 1 || T.street === 2) { T.deck.pop(); T.community.push(T.deck.pop()); }       // burn + turn/river
      T.street++;
      if (T.street >= 4) { endHand(); return; }
      const canAct = P.filter((p) => p.alive && !p.folded && !p.allIn).length;
      T.actionOn = nextToAct(T.button);
      if (canAct <= 1 || T.actionOn < 0) {
        // no more betting possible — auto-run remaining streets
        if (T.community.length < 5) { nextStreet(); return; }
        endHand();
      }
    }

    function endHand() {
      const con = contenders();               // alive & not folded
      const committed = P.map((p) => p.committed);
      const winnings = P.map(() => 0);

      // Uncontested — everyone else folded: the lone player takes the whole pot,
      // no showdown and no board evaluation needed.
      if (con.length <= 1) {
        const w = con.length === 1 ? P.indexOf(con[0]) : -1;
        const total = committed.reduce((a, b) => a + b, 0);
        if (w >= 0) winnings[w] += total;
        P.forEach((p, i) => { p.stack += winnings[i]; });
        T.handOver = true;
        T.result = { winnings, potResults: [], showdown: false, scores: P.map(() => null) };
        T.actionOn = -1;
        return;
      }

      // Showdown — make sure the board is complete, then rank contenders.
      while (T.community.length < 5 && T.deck.length) T.community.push(T.deck.pop());
      const folded = P.map((p) => p.folded || !p.alive);
      const pots = buildPots(committed, folded);
      const scores = P.map((p) => (p.folded || !p.alive || p.hole.length < 2) ? null : best7([...p.hole, ...T.community]));
      const potResults = [];
      for (const pot of pots) {
        const elig = pot.eligible.filter((i) => scores[i]);
        if (!elig.length) { if (pot.eligible[0] != null) winnings[pot.eligible[0]] += pot.amount; continue; }
        let best = null, winners = [];
        for (const i of elig) {
          const c = best === null ? 1 : cmp(scores[i], best);
          if (c > 0) { best = scores[i]; winners = [i]; }
          else if (c === 0) winners.push(i);
        }
        const share = Math.floor(pot.amount / winners.length);
        const rem = pot.amount - share * winners.length;
        winners.forEach((i, k) => { winnings[i] += share + (k < rem ? 1 : 0); });
        potResults.push({ amount: pot.amount, winners: winners.slice(), name: handName(best) });
      }
      P.forEach((p, i) => { p.stack += winnings[i]; });
      T.handOver = true;
      T.result = { winnings, potResults, showdown: true, scores };
      T.actionOn = -1;
    }

    return {
      T, startHand, legal, act, best7, potTotal, contenders,
      nextAlive, get button() { return T.button; }, set button(v) { T.button = v; },
    };
  }

  /* expose internals for headless testing */
  const _t = { rank5, best7, cmp, buildPots, equity, freshDeck, shuffle, makeTable, handName };

  /* ============================================================
     UI + driver
     ============================================================ */
  function cardMini(c, faceDown) {
    if (faceDown) return `<div class="hc-card back"></div>`;
    if (!c) return `<div class="hc-card empty"></div>`;
    const red = RED[SUITS[c.s]] ? " red" : "";
    return `<div class="hc-card${red}"><b>${rankStr(c.r)}</b><span>${SUITS[c.s]}</span></div>`;
  }

  // Blinds scale with the buy-in so the table always plays ~50 big blinds deep.
  function niceRound(x) {
    if (x <= 1) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / mag;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  }
  function blindsFor(b) {
    const bb = Math.max(2, niceRound(b / 50));
    return { sb: Math.max(1, Math.floor(bb / 2)), bb };
  }

  function renderUI(view) {
    const MIN_BUYIN = 100;
    const NAMES = ["You", "Ace", "Boss", "Trixie"];
    const AGGR = [0, 0.35, 0.65, 0.5];
    let buyIn = 1000, SB = 10, BB = 20;      // set for real when the player sits down
    let stacks = [0, buyIn, buyIn, buyIn];
    let button = 0, tbl = null, seated = false, awaitingHuman = false, gen = 0;

    view.innerHTML = `
      <div class="page-head">
        <h2 class="page-title">🃏 Texas Hold'em</h2>
        <p class="page-sub">No-limit Hold'em against three betting bots. Pick your buy-in — the bots match it and the blinds scale to suit. Bots read their real win-odds and bet accordingly — outplay them.</p>
      </div>
      <div class="game-layout">
        <div class="panel">
          <div class="holdem-felt">
            <div class="hc-seats-top" id="hcTop"></div>
            <div class="hc-center">
              <div class="hc-pot" id="hcPot"></div>
              <div class="hc-community" id="hcCommunity"></div>
              <div class="hc-msg" id="hcMsg"></div>
            </div>
            <div class="hc-seat-wrap" id="hcYou"></div>
          </div>
        </div>
        <div class="panel">
          <div class="hc-status" id="hcStatus"></div>
          <div class="hc-controls" id="hcControls"></div>
          <button class="btn btn-ghost btn-sm" id="hcInfoBtn" style="margin:12px 0;">ℹ️ How the odds work</button>
          <div class="history"><h4>Table log</h4><div class="history-list hc-log" id="hcLog"></div></div>
        </div>
      </div>
      <div class="report-overlay" id="hcInfoOverlay">
        <div class="report-card">
          <div class="report-head">
            <h2 class="report-title">🃏 How Texas Hold'em works here</h2>
            <button class="btn btn-ghost btn-sm" id="hcInfoClose">✕</button>
          </div>
          <div class="report-section">
            <h4>The game</h4>
            <div class="info-body">No-limit Hold'em, you vs. three bots. You choose your buy-in when you sit down; the
            three bots each start with the same stack and the small/big blinds scale to it (~50 big blinds deep), rotating with
            the dealer button. Two hole cards each, then five community cards over four betting rounds
            (pre-flop, flop, turn, river). Best five-card hand wins the pot; all-ins create side pots.</div>
          </div>
          <div class="report-section">
            <h4>1 · Ranking a hand (the evaluator)</h4>
            <div class="info-body">With 7 cards (2 hole + 5 board) there are <b>21</b> possible five-card hands.
            The engine scores all 21 and keeps the best, as a comparable tuple of <i>[category, kickers…]</i> —
            so ties break correctly (e.g. two flushes compared card-by-card). Categories run high-card → pair →
            two pair → trips → straight → flush → full house → quads → straight flush.</div>
          </div>
          <div class="report-section">
            <h4>2 · How the bots bet (Monte-Carlo equity)</h4>
            <div class="info-body">A bot can't just "feel" its odds, so each decision it runs a quick
            <b>simulation</b>: deal random hole cards to the opponents still in the hand, run out the remaining
            board hundreds of times, and count how often it wins. That fraction is its <b>equity</b> (true
            win-chance). It then compares equity to <b>pot odds</b> — the break-even call price,
            <code>call ÷ (pot + call)</code>. Call/raise when equity beats pot odds, fold when it's well below,
            plus a dash of aggression and the occasional bluff per bot's personality.</div>
          </div>
          <div class="report-section">
            <h4>3 · Side pots (all-ins)</h4>
            <div class="info-body">When players are all-in for different amounts, chips are split into a main pot
            and side pots by contribution level. A short all-in can only win the portion everyone matched;
            the rest forms a side pot only the deeper stacks can win. Folded players' chips still fund the pots
            but can't be won back. Total chips are always conserved.</div>
          </div>
          <div class="report-section">
            <h4>Edge</h4>
            <div class="info-body">There's no house rake — it's a pure skill game against the bots. Your edge is
            reading spots better than they do (they're solid but beatable). The 😈 Rig deals <i>you</i> stronger
            starting hands.</div>
          </div>
          <div class="report-actions"><button class="btn" id="hcInfoClose2">Got it</button></div>
        </div>
      </div>`;

    const $ = (id) => view.querySelector(id);
    const logLines = [];
    function log(s) { logLines.push(s); if (logLines.length > 60) logLines.shift(); const el = $("#hcLog"); if (el) el.innerHTML = logLines.slice().reverse().map((l) => `<div class="hc-log-row">${l}</div>`).join(""); }

    function seatHTML(i) {
      const p = tbl.T.players[i];
      const T = tbl.T;
      const reveal = i === 0 || (T.handOver && T.result && T.result.showdown && !p.folded && p.alive);
      const cards = p.alive
        ? (p.hole.length ? p.hole.map((c) => cardMini(c, !reveal)).join("") : cardMini(null, true) + cardMini(null, true))
        : `<div class="hc-sitout">sitting out</div>`;
      const dealer = i === T.button ? `<span class="hc-dealer">D</span>` : "";
      const win = T.handOver && T.result && T.result.winnings[i] > 0;
      const acting = T.actionOn === i && !T.handOver;
      return `<div class="hc-seat ${p.folded ? "folded" : ""} ${win ? "winner" : ""} ${acting ? "acting" : ""}">
          <div class="hc-name">${p.name} ${dealer}</div>
          <div class="hc-cards">${cards}</div>
          <div class="hc-stack">$${Casino.fmt(p.stack)}</div>
          ${p.betRound > 0 ? `<div class="hc-bet">$${Casino.fmt(p.betRound)}</div>` : ""}
          ${p.lastAction ? `<div class="hc-last">${p.lastAction}</div>` : ""}
        </div>`;
    }

    function renderTable() {
      if (!tbl) return;
      $("#hcTop").innerHTML = [1, 2, 3].map(seatHTML).join("");
      $("#hcYou").innerHTML = seatHTML(0);
      const T = tbl.T;
      $("#hcPot").innerHTML = `Pot <b>$${Casino.fmt(tbl.potTotal())}</b>`;
      $("#hcCommunity").innerHTML = [0, 1, 2, 3, 4].map((i) => cardMini(T.community[i], false).replace('class="hc-card empty"', 'class="hc-card slot"')).join("");
      $("#hcMsg").textContent = T.handOver && T.result ? handOverMsg() : "";
    }

    function handOverMsg() {
      const r = tbl.T.result;
      if (!r.showdown) {
        const w = r.winnings.findIndex((x) => x > 0);
        return `${NAMES[w]} win${w === 0 ? "" : "s"} the pot (everyone folded).`;
      }
      return r.potResults.map((pr) => `${pr.winners.map((i) => NAMES[i]).join(" & ")} — ${pr.name} — $${Casino.fmt(pr.amount)}`).join(" · ");
    }

    function controlsHTML() {
      if (!seated) {
        const bal = Casino.getBalance();
        if (bal < MIN_BUYIN) return `<div class="hc-status-msg">You need at least $${Casino.fmt(MIN_BUYIN)} to sit down. Add cash from the top bar.</div>`;
        const def = Math.min(buyIn, bal);
        const bl = blindsFor(def);
        return `
          <div class="hc-buyin">
            <label class="hc-buyin-label">Your buy-in <span class="hc-buyin-hint">— you and all three bots start with this</span></label>
            <input type="number" class="input" id="hcBuyInput" min="${MIN_BUYIN}" max="${bal}" step="10" value="${def}">
            <div class="hc-buyin-presets">
              <button class="btn btn-ghost btn-sm" data-buy="500">$500</button>
              <button class="btn btn-ghost btn-sm" data-buy="1000">$1K</button>
              <button class="btn btn-ghost btn-sm" data-buy="2500">$2.5K</button>
              <button class="btn btn-ghost btn-sm" data-buy="max">Max</button>
            </div>
            <div class="hc-buyin-blinds" id="hcBlindPreview">Blinds $${Casino.fmt(bl.sb)}/$${Casino.fmt(bl.bb)} · ~${Math.round(def / bl.bb)} big blinds deep</div>
            <button class="btn btn-block btn-green" id="hcSit" style="margin-top:12px;">Sit down &amp; deal</button>
          </div>`;
      }
      if (stacks[0] < BB && (!tbl || tbl.T.handOver)) {
        const canRebuy = Casino.getBalance() >= Math.min(BB, MIN_BUYIN);
        return `<div class="hc-status-msg">You're out of chips.</div>
          ${canRebuy ? `<button class="btn btn-block btn-green" id="hcRebuy">Rebuy to $${Casino.fmt(buyIn)}</button>` : `<div class="hc-status-msg">Not enough cash to rebuy.</div>`}
          <button class="btn btn-block btn-ghost" id="hcLeave" style="margin-top:10px;">Leave table</button>`;
      }
      if (tbl && tbl.T.handOver) {
        return `<button class="btn btn-block btn-green" id="hcNext">Deal next hand</button>
          <button class="btn btn-block btn-ghost" id="hcLeave" style="margin-top:10px;">Cash out ($${Casino.fmt(stacks[0])})</button>`;
      }
      if (awaitingHuman) {
        const acts = tbl.legal();
        const call = acts.find((a) => a.type === "call");
        const raise = acts.find((a) => a.type === "raise");
        const canCheck = acts.some((a) => a.type === "check");
        let s = `<div class="hc-actrow">
          <button class="btn btn-red" id="hcFold">Fold</button>
          ${canCheck ? `<button class="btn btn-blue" id="hcCheck">Check</button>`
                     : `<button class="btn btn-blue" id="hcCall">Call $${Casino.fmt(call.amount)}</button>`}
        </div>`;
        if (raise) {
          s += `<div class="hc-raise">
            <input type="range" id="hcSlider" min="${raise.min}" max="${raise.max}" value="${raise.min}" step="${BB}" class="lab-slider">
            <div class="hc-raise-row">
              <button class="btn btn-purple" id="hcRaise">Raise to $<span id="hcRaiseVal">${Casino.fmt(raise.min)}</span></button>
              <button class="btn btn-ghost" id="hcAllin">All-in</button>
            </div></div>`;
        } else {
          s += `<button class="btn btn-block btn-ghost" id="hcAllin" style="margin-top:10px;">All-in</button>`;
        }
        return s;
      }
      return `<div class="hc-status-msg">Waiting for other players…</div>`;
    }

    function renderControls() {
      $("#hcControls").innerHTML = controlsHTML();
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
      on("#hcSit", sit); on("#hcRebuy", () => { rebuy(); }); on("#hcLeave", cashOut);
      on("#hcNext", nextHand);
      const buyInput = $("#hcBuyInput");
      if (buyInput) {
        const upd = () => {
          const bal = Casino.getBalance();
          const v = Math.max(MIN_BUYIN, Math.min(bal, Math.floor(Number(buyInput.value) || 0)));
          const bl = blindsFor(v);
          const bp = $("#hcBlindPreview");
          if (bp) bp.textContent = `Blinds $${Casino.fmt(bl.sb)}/$${Casino.fmt(bl.bb)} · ~${Math.round(v / bl.bb)} big blinds deep`;
        };
        buyInput.addEventListener("input", upd);
        view.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => {
          buyInput.value = b.dataset.buy === "max" ? Math.floor(Casino.getBalance()) : b.dataset.buy;
          upd();
        }));
      }
      on("#hcFold", () => humanAct({ type: "fold" }));
      on("#hcCheck", () => humanAct({ type: "check" }));
      on("#hcCall", () => humanAct({ type: "call" }));
      const raise = tbl && awaitingHuman ? tbl.legal().find((a) => a.type === "raise") : null;
      const slider = $("#hcSlider");
      if (slider) slider.addEventListener("input", () => { const v = $("#hcRaiseVal"); if (v) v.textContent = Casino.fmt(Number(slider.value)); });
      on("#hcRaise", () => humanAct({ type: "raise", amount: Number($("#hcSlider").value) }));
      on("#hcAllin", () => humanAct(raise ? { type: "raise", amount: raise.max } : { type: "call" }));
    }

    function renderStatus() {
      $("#hcStatus").innerHTML = seated
        ? `<div class="hc-mystack">Your stack: <b>$${Casino.fmt(stacks[0])}</b> · Blinds $${Casino.fmt(SB)}/$${Casino.fmt(BB)} · Hand #${gen}</div>`
        : `<div class="hc-mystack">Choose your buy-in to take a seat — the bots match it and the blinds scale.</div>`;
    }

    function renderAll() { if (tbl) renderTable(); renderStatus(); renderControls(); }

    /* ---- flow ---- */
    function sit() {
      const bal = Casino.getBalance();
      const input = $("#hcBuyInput");
      let buy = input ? Math.floor(Number(input.value) || 0) : Math.min(buyIn, bal);
      buy = Math.max(MIN_BUYIN, Math.min(bal, buy));
      if (bal < MIN_BUYIN) { Casino.toast(`Need at least $${Casino.fmt(MIN_BUYIN)} to sit down.`, "info"); return; }
      if (!Casino.bet(buy)) return;
      buyIn = buy;
      ({ sb: SB, bb: BB } = blindsFor(buyIn));   // blinds scale with the buy-in
      stacks = [buyIn, buyIn, buyIn, buyIn]; seated = true;
      logLines.length = 0;
      log(`You sat down with $${Casino.fmt(buyIn)}. Each bot buys in for $${Casino.fmt(buyIn)}. Blinds $${Casino.fmt(SB)}/$${Casino.fmt(BB)}.`);
      nextHand();
    }
    function rebuy() {
      const need = Math.max(0, buyIn - stacks[0]);            // top back up to the table buy-in
      const buy = Math.min(need || buyIn, Casino.getBalance());
      if (buy < Math.min(BB, MIN_BUYIN)) { Casino.toast("Not enough cash to rebuy.", "lose"); return; }
      if (!Casino.bet(buy)) return;
      stacks[0] += buy; log(`You rebought for $${Casino.fmt(buy)} (stack $${Casino.fmt(stacks[0])}).`);
      renderAll();
    }
    function cashOut() {
      if (stacks[0] > 0) { Casino.payout(stacks[0]); Casino.toast(`Cashed out $${Casino.fmt(stacks[0])}.`, "win"); }
      stacks[0] = 0; seated = false; tbl = null;
      renderAll();
    }

    function applyRig() {
      if (!Casino.cheat.win()) return;
      const hu = tbl.T.players[0];
      if (hu.hole.length < 2) return;
      for (let m = 0; m < 3; m++) {
        const cand = [tbl.T.deck.pop(), tbl.T.deck.pop()];
        if (_t.equity(cand, [], 3, 40) > _t.equity(hu.hole, [], 3, 40)) { tbl.T.deck.push(...hu.hole); hu.hole = cand; }
        else tbl.T.deck.push(...cand);
      }
    }

    function nextHand() {
      for (let i = 1; i < 4; i++) if (stacks[i] < BB) stacks[i] = buyIn; // bots always rebuy to the table stake
      if (stacks[0] < BB) { renderAll(); return; }                     // human busted → rebuy screen
      tbl = _t.makeTable(NAMES, stacks, SB, BB, button);
      tbl.T.players.forEach((p, i) => (p._aggr = AGGR[i]));
      tbl.startHand();
      applyRig();
      button = tbl.nextAlive(button);
      gen++;
      log(`— Hand #${gen} —`);
      const T = tbl.T;
      log(`${NAMES[T.sbSeat]} posts SB $${SB}, ${NAMES[T.bbSeat]} posts BB $${BB}.`);
      awaitingHuman = false;
      renderAll();
      drive();
    }

    function botDecide(i) {
      const p = tbl.T.players[i], T = tbl.T;
      const numOpp = Math.max(1, tbl.contenders().length - 1);
      const eq = _t.equity(p.hole, T.community, numOpp, 140);
      const toCall = T.currentBet - p.betRound;
      const pot = tbl.potTotal();
      const aggr = p._aggr;
      const acts = tbl.legal();
      const raise = acts.find((a) => a.type === "raise");
      const raiseTo = () => {
        const size = Math.round((pot > 0 ? pot : BB) * (0.5 + Math.random() * 0.7));
        return Math.max(raise.min, Math.min(raise.max, T.currentBet + size));
      };
      if (toCall <= 0) {
        if (raise && (eq > 0.58 || Math.random() < 0.10 * aggr) && Math.random() < 0.55 + aggr * 0.3) return { type: "raise", amount: raiseTo() };
        return { type: "check" };
      }
      const potOdds = toCall / (pot + toCall);
      if (raise && eq > 0.78 && Math.random() < 0.5 + aggr) return { type: "raise", amount: raiseTo() };
      if (eq >= potOdds - 0.03) {
        if (raise && eq > 0.62 && Math.random() < aggr * 0.5) return { type: "raise", amount: raiseTo() };
        return { type: "call" };
      }
      if (raise && Math.random() < 0.05 * aggr) return { type: "raise", amount: raiseTo() };
      return { type: "fold" };
    }

    function drive() {
      const myGen = gen;
      const T = tbl.T;
      if (T.handOver || T.actionOn < 0) { onHandOver(); return; }
      if (T.actionOn === 0) { awaitingHuman = true; renderAll(); return; }
      awaitingHuman = false; renderAll();
      setTimeout(() => {
        if (!tbl || gen !== myGen || T.handOver) return;
        const i = T.actionOn;
        const a = botDecide(i);
        tbl.act(a);
        const amt = a.type === "raise" ? ` to $${Casino.fmt(tbl.T.players[i].betRound)}` : a.type === "call" ? ` $${Casino.fmt(tbl.T.players[i].betRound)}` : "";
        log(`${NAMES[i]}: ${tbl.T.players[i].lastAction}${amt}`);
        Casino.sound.play("click");
        renderAll();
        drive();
      }, 650);
    }

    function humanAct(a) {
      awaitingHuman = false;
      tbl.act(a);
      log(`You: ${tbl.T.players[0].lastAction}${a.type === "raise" ? ` to $${Casino.fmt(tbl.T.players[0].betRound)}` : ""}`);
      Casino.sound.play("click");
      renderAll();
      drive();
    }

    function onHandOver() {
      stacks = tbl.T.players.map((p) => p.stack);
      const r = tbl.T.result;
      const won = r.winnings[0] || 0;
      // net for the human this hand = winnings - what they put in
      if (won > 0) Casino.sound.play(won >= BB * 20 ? "bigwin" : "win");
      else if (!tbl.T.players[0].folded) Casino.sound.play("lose");
      log(handOverMsg());
      awaitingHuman = false;
      renderAll();
    }

    /* ---- API for the Lab AI: give it exactly what it needs to play poker ---- */
    const fmtCard = (c) => rankStr(c.r) + SUITS[c.s];
    window.HoldemAPI = {
      seated: () => seated,
      handOver: () => !tbl || tbl.T.handOver,
      humanTurn: () => awaitingHuman && !!tbl && !tbl.T.handOver && tbl.T.actionOn === 0,
      sit: () => { if (!seated) sit(); },
      nextHand: () => { if (seated && (!tbl || tbl.T.handOver) && stacks[0] >= BB) nextHand(); },
      cashOut: () => cashOut(),
      act: (a) => { if (awaitingHuman && tbl && tbl.T.actionOn === 0) humanAct(a); },
      state: () => {
        if (!tbl) return null;
        const p = tbl.T.players[0], T = tbl.T;
        const toCall = T.currentBet - p.betRound;
        const pot = tbl.potTotal();
        const numOpp = Math.max(1, tbl.contenders().length - 1);
        const eq = _t.equity(p.hole, T.community, numOpp, 160);   // the key info: real win-odds
        const legalActs = tbl.legal();
        const raise = legalActs.find((a) => a.type === "raise");
        return {
          hole: p.hole.map(fmtCard), board: T.community.map(fmtCard),
          pot, toCall, stack: p.stack, opponents: numOpp, bb: BB,
          equity: eq, potOdds: toCall > 0 ? toCall / (pot + toCall) : 0,
          legal: legalActs.map((a) => a.type),
          minRaiseTo: raise ? raise.min : 0, maxRaiseTo: raise ? raise.max : 0,
        };
      },
    };

    // How-it-works modal
    const infoOv = $("#hcInfoOverlay");
    const openInfo = () => infoOv.classList.add("show");
    const closeInfo = () => infoOv.classList.remove("show");
    $("#hcInfoBtn").addEventListener("click", openInfo);
    $("#hcInfoClose").addEventListener("click", closeInfo);
    $("#hcInfoClose2").addEventListener("click", closeInfo);
    infoOv.addEventListener("click", (e) => { if (e.target === infoOv) closeInfo(); });

    renderAll();
    log("Welcome to the table. Sit down to play.");
  }

  return { render: renderUI, _t };
})();
