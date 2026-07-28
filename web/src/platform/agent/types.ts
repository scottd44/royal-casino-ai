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

export type AgentLogEvent = {
  kind: 'move' | 'result' | 'session' | 'break'
  t: number
  round?: number
  game?: string
  action?: string
  detail?: Record<string, number>
  reason?: string
  latencyMs?: number
  fallback?: boolean
  balance?: number
  delta?: number
}

export type AgentRound = {
  n: number
  wager: number
  delta: number
  balance: number
  game: string
}

export type RoyalAgent = {
  settings: AgentSettings
  adapters: Record<string, { detect: () => boolean; play: (ctx: unknown) => Promise<void> }>
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
  setOnReport: (fn: () => void) => void
  setModel: (m: string) => void
  setBrain: (tokens: number, temp: number, label?: string) => void
  setCompute: (mode: 'gpu' | 'cpu') => void
  setEmotions: (on: boolean) => void
}
