/* Hand-written types for the RoyalAgent public surface (handoff §2c).
   agent-ui.js is plain JS and stays that way until Phase 2; this is the
   contract React consumes it through. */

export type AgentSettings = {
  aggression: number
  delayMs: number
  model: string
  runN: number
  profitTargetPct: number
  stopLossPct: number
  agentic: boolean
  brain: string
  brainTokens: number
  brainTemp: number
  compute: 'gpu' | 'cpu'
  emotions: boolean
  sessionMinutes: number
  breakEvery: number
  breakFor: number
}

export type AgentStats = {
  running: boolean
  credits: number
  start: number
  net: number
  borrowed: number
  rounds: number
  wins: number
  losses: number
  pushes: number
  winRate: number
  roi: number
  totalWagered: number
  avgBet: number
  peak: number
  trough: number
  decisions: number
  fallbacks: number
  fallbackRate: number
  avgLatency: number
  stopReason: string
  tilt: number
  tiltEmoji: string
  tiltShort: string
  perGame: Record<string, { net: number; w: number; l: number }>
}

/**
 * One entry in `royalAgent.getLog()`. `agentUi.ts` pushes a freeform object
 * per call site (`logEvent({ kind: 'loan', label, amount, ... })`,
 * `logEvent({ kind: 'break', phase: 'start', plannedMs })`, etc.) — `kind`
 * isn't a closed set (this type originally listed only
 * 'move'|'result'|'session'|'break' and missed 'loan', plus per-kind fields
 * like `phase`/`plannedMs`/`actualMs`/`trigger`/`label`/`amount` that real
 * call sites use). Kept permissive rather than a closed union — same call
 * this file already makes for `PlayContext`'s game-state objects: the data
 * is genuinely heterogeneous per event kind, so a UI consuming this
 * (`LabLog.tsx`) narrows on `kind` at the read site instead of this type
 * enumerating every shape in advance.
 *
 * NOTE: this has been widened twice after two independent review passes
 * reached the same conclusion from reading the real call sites in
 * agentUi.ts — if a future pass is tempted to narrow it back to the
 * 4-variant union, read agentUi.ts's `LogEvent` (matches this type exactly,
 * on purpose) and its `logEvent(...)` call sites first.
 */
export type AgentLogEvent = {
  kind: string
  t?: number
} & Record<string, unknown>

export type AgentRound = {
  n: number
  wager: number
  delta: number
  balance: number
  game: string
}

/** What `runLoop` (agentUi.ts) hands every adapter's `play()`. */
export type PlayContext = {
  shouldStop: () => boolean
  setStatus: (msg: string) => void
}

export type GameAdapter = {
  detect: () => boolean
  play: (ctx: PlayContext) => Promise<void>
}

export type RoyalAgent = {
  settings: AgentSettings
  adapters: Record<string, GameAdapter>
  play: () => Promise<void>
  stop: () => void
  toggle: () => void
  forceNewGame: () => void
  stopAndReport: () => void
  generateReportNow: () => void
  isRunning: () => boolean
  currentGameId: () => string
  hasAdapter: (id: string) => boolean
  getStats: () => AgentStats
  getLog: () => AgentLogEvent[]
  getRounds: () => AgentRound[]
  resetStats: () => void
  clearSessionLog: () => void
  exportJSON: () => void
  exportCSV: () => void
  setOnUpdate: (fn: () => void) => void
  /**
   * `report` is the loose payload `agentUi.ts:generateReport` builds
   * (trigger/stats/rounds/swings/desperateMeasures/narrative/...) — kept as
   * `Record<string, unknown>` rather than a closed type here for the same
   * reason `AgentLogEvent` is loose (see its doc comment): it's data, not
   * one of this file's Phase-0/1 contract surfaces. `LabReportModal.tsx`
   * (the only consumer) narrows it at the read site. This signature was
   * `() => void` and didn't match agentUi.ts's actual `onReport` callback
   * (`(report: Record<string, unknown>) => void`, agentUi.ts:245) — fixed
   * to match, since the mismatch made it impossible to type-check a real
   * `setOnReport` call site.
   */
  setOnReport: (fn: (report: Record<string, unknown>) => void) => void
  setModel: (m: string) => void
  setBrain: (tokens: number, temp: number, label?: string) => void
  setCompute: (mode: 'gpu' | 'cpu') => void
  setEmotions: (on: boolean) => void
}
