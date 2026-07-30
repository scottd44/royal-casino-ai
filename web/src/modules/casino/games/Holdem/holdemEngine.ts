/* ============================================================
   Texas Hold'em — the table engine, ported from js/games/holdem.js
   lines 12–308.

   Synchronous and DOM-free, exactly as it was. This is deliberately a
   near-verbatim port rather than a redesign: it is tuned, working poker
   (side pots, Monte-Carlo equity, min-raise reopening) and the spike's job
   is to prove the React shell can host it, not to improve it.

   React renders this. It does not own it.
   ============================================================ */

export const SUITS = ['♠', '♥', '♦', '♣'] as const
const RED: Record<string, boolean> = { '♥': true, '♦': true }
const RANKS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }

export const rankStr = (r: number) => RANKS[r] || String(r)
export const isRed = (s: number) => !!RED[SUITS[s]]

export type Card = { r: number; s: number }
export type Score = number[]

export function freshDeck(): Card[] {
  const d: Card[] = []
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s })
  return d
}

export function shuffle<T>(d: T[]): T[] {
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

/* ---------- hand evaluation ---------- */

/** All 5-card subsets of 7 indices. */
const COMBO7: number[][] = (() => {
  const out: number[][] = []
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let e = c + 1; e < 6; e++) for (let f = e + 1; f < 7; f++) out.push([a, b, c, e, f])
  return out
})()

export function rank5(cs: Card[]): Score {
  const rs = cs.map((c) => c.r).sort((a, b) => b - a)
  const flush = cs.every((c) => c.s === cs[0].s)
  const uniq = [...new Set(rs)]
  let straightHigh = 0
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0]
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5 // wheel
  }
  const cnt: Record<number, number> = {}
  rs.forEach((r) => (cnt[r] = (cnt[r] || 0) + 1))
  const groups = Object.keys(cnt)
    .map((r) => ({ r: +r, c: cnt[+r] }))
    .sort((a, b) => b.c - a.c || b.r - a.r)
  const counts = groups.map((g) => g.c)
  const gr = groups.map((g) => g.r)

  if (straightHigh && flush) return [8, straightHigh]
  if (counts[0] === 4) return [7, gr[0], gr[1]]
  if (counts[0] === 3 && counts[1] === 2) return [6, gr[0], gr[1]]
  if (flush) return [5, ...rs]
  if (straightHigh) return [4, straightHigh]
  if (counts[0] === 3) return [3, gr[0], gr[1], gr[2]]
  if (counts[0] === 2 && counts[1] === 2) return [2, gr[0], gr[1], gr[2]]
  if (counts[0] === 2) return [1, gr[0], gr[1], gr[2], gr[3]]
  return [0, ...rs]
}

export function cmp(a: Score, b: Score): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x - y
  }
  return 0
}

export function best7(cards7: Card[]): Score {
  let best: Score | null = null
  for (const idx of COMBO7) {
    const sc = rank5([cards7[idx[0]], cards7[idx[1]], cards7[idx[2]], cards7[idx[3]], cards7[idx[4]]])
    if (!best || cmp(sc, best) > 0) best = sc
  }
  return best!
}

const CAT = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
  'Flush', 'Full house', 'Four of a kind', 'Straight flush',
]

export function handName(score: Score): string {
  if (score[0] === 8 && score[1] === 14) return 'Royal flush'
  return CAT[score[0]]
}

/* ---------- Monte-Carlo equity ---------- */
export function equity(hole: Card[], board: Card[], numOpp: number, samples: number): number {
  const known = [...hole, ...board]
  const keyOf = (c: Card) => c.r * 4 + c.s
  const knownKeys = new Set(known.map(keyOf))
  let score = 0
  for (let s = 0; s < samples; s++) {
    const deck = freshDeck().filter((c) => !knownKeys.has(keyOf(c)))
    shuffle(deck)
    let di = 0
    const full = board.slice()
    while (full.length < 5) full.push(deck[di++])
    const mine = best7([...hole, ...full])
    let beat = false
    let tie = 0
    for (let o = 0; o < numOpp; o++) {
      const opp = best7([deck[di++], deck[di++], ...full])
      const c = cmp(opp, mine)
      if (c > 0) { beat = true; break }
      if (c === 0) tie++
    }
    if (!beat) score += tie > 0 ? 1 / (tie + 1) : 1
  }
  return score / samples
}

/* ---------- side pots (chip-conserving) ---------- */
type Pot = { amount: number; eligible: number[] }

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

export function buildPots(committed: number[], folded: boolean[]): Pot[] {
  const c = committed.slice()
  const pots: Pot[] = []
  for (;;) {
    const live = c.map((v, i) => ({ v, i })).filter((x) => x.v > 0)
    if (!live.length) break
    const min = Math.min(...live.map((x) => x.v))
    let amount = 0
    const eligible: number[] = []
    live.forEach((x) => {
      c[x.i] -= min
      amount += min
      if (!folded[x.i]) eligible.push(x.i)
    })
    if (pots.length && sameSet(pots[pots.length - 1].eligible, eligible)) {
      pots[pots.length - 1].amount += amount
    } else {
      pots.push({ amount, eligible })
    }
  }
  return pots
}

/* ============================================================
   Table engine — synchronous, DOM-free
   ============================================================ */

export type Player = {
  name: string
  stack: number
  hole: Card[]
  folded: boolean
  allIn: boolean
  betRound: number
  committed: number
  hasActed: boolean
  alive: boolean
  lastAction: string
  _aggr?: number
}

export type Action = { type: string; amount?: number; min?: number; max?: number }

export type TableState = {
  players: Player[]
  sb: number
  bb: number
  button: number
  community: Card[]
  deck: Card[]
  street: number
  currentBet: number
  minRaise: number
  actionOn: number
  pots: Pot[]
  handOver: boolean
  result: {
    winnings: number[]
    potResults: { amount: number; winners: number[]; name: string }[]
    showdown: boolean
    scores: (Score | null)[]
  } | null
  log: string[]
  sbSeat?: number
  bbSeat?: number
}

export type Table = ReturnType<typeof makeTable>

export function makeTable(
  names: string[],
  stacks: number[],
  sb: number,
  bb: number,
  button: number,
) {
  const P: Player[] = names.map((name, i) => ({
    name, stack: stacks[i], hole: [], folded: false, allIn: false,
    betRound: 0, committed: 0, hasActed: false, alive: stacks[i] > 0, lastAction: '',
  }))
  const T: TableState = {
    players: P, sb, bb, button, community: [], deck: [],
    street: 0, currentBet: 0, minRaise: bb, actionOn: -1,
    pots: [], handOver: false, result: null, log: [],
  }

  const activeSeats = () => P.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0)

  const nextAlive = (from: number) => {
    for (let k = 1; k <= P.length; k++) {
      const i = (from + k) % P.length
      if (P[i].alive) return i
    }
    return from
  }

  const nextToAct = (from: number) => {
    for (let k = 1; k <= P.length; k++) {
      const i = (from + k) % P.length
      if (P[i].alive && !P[i].folded && !P[i].allIn) return i
    }
    return -1
  }

  const contenders = () => P.filter((p) => p.alive && !p.folded)
  const potTotal = () => P.reduce((a, p) => a + p.committed, 0)

  function putChips(p: Player, amt: number) {
    amt = Math.min(amt, p.stack)
    p.stack -= amt
    p.betRound += amt
    p.committed += amt
    if (p.stack === 0) p.allIn = true
    return amt
  }

  function startHand() {
    const seats = activeSeats()
    T.deck = shuffle(freshDeck())
    T.community = []; T.street = 0; T.currentBet = 0; T.minRaise = bb
    T.handOver = false; T.result = null; T.pots = []
    P.forEach((p) => {
      p.hole = []; p.folded = !p.alive; p.allIn = false
      p.betRound = 0; p.committed = 0; p.hasActed = false; p.lastAction = ''
    })
    for (let d = 0; d < 2; d++) for (const i of seats) P[i].hole.push(T.deck.pop()!)
    const sbSeat = seats.length === 2 ? T.button : nextAlive(T.button)
    const bbSeat = nextAlive(sbSeat)
    putChips(P[sbSeat], sb); P[sbSeat].lastAction = 'SB'
    putChips(P[bbSeat], bb); P[bbSeat].lastAction = 'BB'
    T.currentBet = bb
    T.actionOn = nextToAct(bbSeat)
    T.sbSeat = sbSeat; T.bbSeat = bbSeat
  }

  function legal(): Action[] {
    const p = P[T.actionOn]
    if (!p) return []
    const toCall = T.currentBet - p.betRound
    const acts: Action[] = [{ type: 'fold' }]
    if (toCall <= 0) acts.push({ type: 'check' })
    else acts.push({ type: 'call', amount: Math.min(toCall, p.stack) })
    if (p.stack > toCall) {
      const minTo = T.currentBet + T.minRaise
      acts.push({
        type: 'raise',
        min: Math.min(minTo, p.betRound + p.stack),
        max: p.betRound + p.stack,
      })
    }
    return acts
  }

  /** action: {type, amount?} where for raise, amount = target total betRound */
  function act(action: Action) {
    const p = P[T.actionOn]
    if (!p) return
    const toCall = T.currentBet - p.betRound
    if (action.type === 'fold') {
      p.folded = true; p.hasActed = true; p.lastAction = 'Fold'
    } else if (action.type === 'check') {
      p.hasActed = true; p.lastAction = 'Check'
    } else if (action.type === 'call') {
      putChips(p, toCall); p.hasActed = true
      p.lastAction = p.allIn ? 'All-in' : 'Call'
    } else if (action.type === 'raise') {
      const target = Math.max(action.amount || 0, T.currentBet + T.minRaise)
      const add = Math.min(target - p.betRound, p.stack)
      const wasFullRaise = p.betRound + add - T.currentBet >= T.minRaise
      putChips(p, add)
      if (p.betRound > T.currentBet) {
        if (wasFullRaise) T.minRaise = p.betRound - T.currentBet
        T.currentBet = p.betRound
        P.forEach((q) => {
          if (q !== p && q.alive && !q.folded && !q.allIn) q.hasActed = false
        })
      }
      p.hasActed = true
      p.lastAction = p.allIn ? 'All-in' : 'Raise'
    }
    afterAct()
  }

  function roundClosed() {
    if (contenders().length <= 1) return true
    const acting = P.filter((p) => p.alive && !p.folded && !p.allIn)
    if (!acting.length) return true
    return acting.every((p) => p.hasActed && p.betRound === T.currentBet)
  }

  function afterAct() {
    if (contenders().length <= 1) { endHand(); return }
    if (roundClosed()) { nextStreet(); return }
    T.actionOn = nextToAct(T.actionOn)
  }

  function nextStreet() {
    P.forEach((p) => { p.betRound = 0; p.hasActed = false })
    T.currentBet = 0; T.minRaise = bb
    if (T.street === 0) {
      T.deck.pop()
      T.community.push(T.deck.pop()!, T.deck.pop()!, T.deck.pop()!)
    } else if (T.street === 1 || T.street === 2) {
      T.deck.pop()
      T.community.push(T.deck.pop()!)
    }
    T.street++
    if (T.street >= 4) { endHand(); return }
    const canAct = P.filter((p) => p.alive && !p.folded && !p.allIn).length
    T.actionOn = nextToAct(T.button)
    if (canAct <= 1 || T.actionOn < 0) {
      if (T.community.length < 5) { nextStreet(); return }
      endHand()
    }
  }

  function endHand() {
    const con = contenders()
    const committed = P.map((p) => p.committed)
    const winnings = P.map(() => 0)

    // Uncontested — everyone else folded. No showdown, no board evaluation.
    if (con.length <= 1) {
      const w = con.length === 1 ? P.indexOf(con[0]) : -1
      const total = committed.reduce((a, b) => a + b, 0)
      if (w >= 0) winnings[w] += total
      P.forEach((p, i) => { p.stack += winnings[i] })
      T.handOver = true
      T.result = { winnings, potResults: [], showdown: false, scores: P.map(() => null) }
      T.actionOn = -1
      return
    }

    while (T.community.length < 5 && T.deck.length) T.community.push(T.deck.pop()!)
    const folded = P.map((p) => p.folded || !p.alive)
    const pots = buildPots(committed, folded)
    const scores: (Score | null)[] = P.map((p) =>
      p.folded || !p.alive || p.hole.length < 2 ? null : best7([...p.hole, ...T.community]),
    )
    const potResults: { amount: number; winners: number[]; name: string }[] = []
    for (const pot of pots) {
      const elig = pot.eligible.filter((i) => scores[i])
      if (!elig.length) {
        if (pot.eligible[0] != null) winnings[pot.eligible[0]] += pot.amount
        continue
      }
      let best: Score | null = null
      let winners: number[] = []
      for (const i of elig) {
        const c = best === null ? 1 : cmp(scores[i]!, best)
        if (c > 0) { best = scores[i]!; winners = [i] }
        else if (c === 0) winners.push(i)
      }
      const share = Math.floor(pot.amount / winners.length)
      const rem = pot.amount - share * winners.length
      winners.forEach((i, k) => { winnings[i] += share + (k < rem ? 1 : 0) })
      potResults.push({ amount: pot.amount, winners: winners.slice(), name: handName(best!) })
    }
    P.forEach((p, i) => { p.stack += winnings[i] })
    T.handOver = true
    T.result = { winnings, potResults, showdown: true, scores }
    T.actionOn = -1
  }

  return {
    T, startHand, legal, act, best7, potTotal, contenders, nextAlive,
    get button() { return T.button },
    set button(v: number) { T.button = v },
  }
}

/* ---------- blinds scale with the buy-in (~50bb deep) ---------- */
function niceRound(x: number): number {
  if (x <= 1) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(x)))
  const f = x / mag
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag
}

export function blindsFor(b: number): { sb: number; bb: number } {
  const bb = Math.max(2, niceRound(b / 50))
  return { sb: Math.max(1, Math.floor(bb / 2)), bb }
}

export const fmtCard = (c: Card) => rankStr(c.r) + SUITS[c.s]
