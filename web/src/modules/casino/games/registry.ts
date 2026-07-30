import type { IconName } from '@/platform/icons'

/**
 * 11 games live as of Phase 4 (PHASE_3_GAMES_PLAN.md paused mid-Wave-4;
 * Phase 4 UI remake plan §1). Phase 3's remaining waves grow this to 25.
 *
 * `icon` is a registered `IconName` (platform/icons/registry.ts), ported
 * from the `icon:` field of the matching entry in js/app.js's `GAMES`
 * array (see platform/icons/gameIcons.ts for the full 25-game reference).
 * Sidebar, lobby card and page title all read `icon` from here — one
 * definition, so they can't drift apart the way the legacy `emoji` vs.
 * `icon` split invited (DEVELOPMENT_GUIDE.md §2).
 *
 * `tag` and `provider` are pulled verbatim from js/app.js:14-40's `GAMES`
 * array (PHASE_4_UI_REMAKE_PLAN.md §1) — a short payout/hook string and the
 * provider group ("Royal Live" / "Royal Originals" / "Royal Slots"), neither
 * invented here.
 */
export type GameMeta = {
  id: string
  name: string
  desc: string
  accent: string
  icon: IconName
  tag: string
  provider: string
  /** Phase-4 UI remake addition (not legacy-sourced) — drives the Lobby's spotlight strip. */
  featured?: boolean
}

export const GAMES: GameMeta[] = [
  { id: 'blackjack', name: 'Blackjack', desc: 'Hit 21 and beat the dealer.', accent: '#3ecf8e', icon: 'spade', tag: 'Pays 3:2', provider: 'Royal Live' },
  { id: 'dice', name: 'Dice', desc: 'Roll under or over your target.', accent: '#4d8cff', icon: 'dices', tag: 'Your odds', provider: 'Royal Originals' },
  { id: 'mines', name: 'Mines', desc: 'Uncover gems, dodge the mines.', accent: '#22e59a', icon: 'bomb', tag: 'Cash out anytime', provider: 'Royal Originals' },
  { id: 'holdem', name: "Texas Hold'em", desc: 'No-limit poker against bots.', accent: '#a97bff', icon: 'diamond', tag: 'vs. bots', provider: 'Royal Live' },
  { id: 'limbo', name: 'Limbo', desc: 'Beat your target multiplier in one shot.', accent: '#c77dff', icon: 'trending-up', tag: 'Up to 1M×', provider: 'Royal Originals' },
  { id: 'plinko', name: 'Plinko', desc: 'Drop the ball and bounce into a payout.', accent: '#f6d97a', icon: 'git-fork', tag: 'Up to 1000×', provider: 'Royal Originals' },
  { id: 'crash', name: 'Crash', desc: 'Cash out before the multiplier crashes.', accent: '#22d3ee', icon: 'rocket', tag: 'You call it', provider: 'Royal Originals', featured: true },
  { id: 'wheel', name: 'Wheel', desc: 'Compound each spin or cash out — 4 risk levels.', accent: '#a982ff', icon: 'target', tag: 'Keep spinning', provider: 'Royal Originals', featured: true },
  { id: 'chicken', name: 'Chicken Road', desc: 'Cross lane by lane — cash out before a car hits you.', accent: '#ffdc86', icon: 'bird', tag: 'Cash out anytime', provider: 'Royal Originals', featured: true },
  { id: 'rps', name: 'Rock Paper Scissors', desc: 'Beat the house to build a 1.96×-per-win streak.', accent: '#9d6bff', icon: 'rc:rock', tag: 'Streak', provider: 'Royal Originals' },
  { id: 'coinflip', name: 'Coinflip', desc: 'Call heads or tails and compound 1.96× per flip.', accent: '#4d8cff', icon: 'circle-dollar-sign', tag: 'Streak', provider: 'Royal Originals' },
  { id: 'tower', name: 'Tower', desc: 'Climb row by row, dodge the mines.', accent: '#a3e635', icon: 'layers', tag: 'Cash out anytime', provider: 'Royal Originals' },
  { id: 'snakes', name: 'Snakes', desc: 'Roll around a 12-tile loop; dodge snakes, compound safe tiles.', accent: '#3ecf8e', icon: 'rc:snake', tag: 'Up to 1720×', provider: 'Royal Originals' },
  { id: 'moles', name: 'Moles', desc: 'Whack holes to find the moles — each one grows your multiplier.', accent: '#e6c15a', icon: 'hammer', tag: 'Up to 122×', provider: 'Royal Originals' },
  { id: 'keno', name: 'Keno', desc: 'Pick numbers, draw 10 of 40, chase up to 10,000×.', accent: '#fb7185', icon: 'hash', tag: 'Up to 10000×', provider: 'Royal Originals' },
  { id: 'battleship', name: 'Battleship', desc: 'Buy shots at a hidden fleet — hit pieces, sink ships for big multipliers.', accent: '#4d8cff', icon: 'ship', tag: 'Up to 100×', provider: 'Royal Originals' },
  { id: 'hilo', name: 'Hilo', desc: 'Call higher or lower, chain the streak.', accent: '#5eead4', icon: 'arrow-up-down', tag: 'Cash out anytime', provider: 'Royal Live' },
  { id: 'videopoker', name: 'Video Poker', desc: 'Hold, draw, and hit Jacks or Better.', accent: '#f0883e', icon: 'club', tag: 'Up to 800×', provider: 'Royal Live' },
  { id: 'baccarat', name: 'Baccarat', desc: 'Back Player, Banker or Tie — closest to 9 wins.', accent: '#e6c15a', icon: 'heart', tag: 'Banker ~99%', provider: 'Royal Live' },
  { id: 'threecard', name: 'Three Card Poker', desc: 'Three cards vs. the dealer — play or fold.', accent: '#5eead4', icon: 'layers-2', tag: 'Ante + bonus', provider: 'Royal Live' },
  { id: 'casinowar', name: 'Casino War', desc: 'Highest card wins. Go to war on a tie.', accent: '#ef4d6a', icon: 'swords', tag: '1:1', provider: 'Royal Live' },
  { id: 'reddog', name: 'Red Dog', desc: 'Bet the third card lands between the first two.', accent: '#f0883e', icon: 'circle-dot', tag: 'Up to 11:1', provider: 'Royal Live' },
  { id: 'slots', name: 'Lucky Sevens', desc: 'Spin the reels for triple-symbol jackpots.', accent: '#e6c15a', icon: 'cherry', tag: 'Up to 60×', provider: 'Royal Slots' },
  { id: 'gems', name: 'Cosmic Gems', desc: 'A 3x3 gem grid with 5 paylines — match three on any line.', accent: '#c79bff', icon: 'gem', tag: 'Up to 240×', provider: 'Royal Slots' },
  { id: 'roulette', name: 'European Roulette', desc: 'Spread chips across the felt — straight up pays 35:1.', accent: '#c73349', icon: 'disc-3', tag: 'Single zero', provider: 'Royal Live', featured: true },
]

/**
 * Verbatim from js/app.js:42-46's `CATEGORIES`. `ids` deliberately lists the
 * FULL legacy roster per category, not just what's ported — most entries
 * don't exist in `GAMES` yet (Phase 3 Waves 4-6 are the rest). Lobby.tsx
 * filters this against `GAMES` at render time and skips a whole section if
 * nothing in it is built (plan §2); the raw list stays intact here so
 * nothing needs re-adding as later waves land.
 */
export type CategoryMeta = {
  key: string
  label: string
  icon: IconName
  ids: string[]
}

export const CATEGORIES: CategoryMeta[] = [
  {
    key: 'live',
    label: 'Live Table Action',
    icon: 'spade',
    ids: ['blackjack', 'holdem', 'baccarat', 'threecard', 'casinowar', 'reddog', 'videopoker', 'hilo', 'roulette'],
  },
  {
    key: 'originals',
    label: 'Stake-Style Originals',
    icon: 'zap',
    ids: ['dice', 'mines', 'crash', 'limbo', 'plinko', 'tower', 'wheel', 'chicken', 'battleship', 'moles', 'snakes', 'coinflip', 'rps', 'keno'],
  },
  {
    key: 'slots',
    label: 'Slots',
    icon: 'cherry',
    ids: ['slots', 'gems'],
  },
]
