/** The three Phase 0 spike games. Phase 3 grows this to 25. */
export type GameMeta = {
  id: string
  name: string
  desc: string
  accent: string
}

export const GAMES: GameMeta[] = [
  { id: 'dice', name: 'Dice', desc: 'Roll under or over your target.', accent: '#4d8cff' },
  { id: 'mines', name: 'Mines', desc: 'Uncover gems, dodge the mines.', accent: '#22e59a' },
  { id: 'holdem', name: "Texas Hold'em", desc: 'No-limit poker against bots.', accent: '#a97bff' },
]
