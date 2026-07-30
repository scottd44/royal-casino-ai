import type { IconName } from './registry'

/* ============================================================
   Game id -> IconName, ported from the `icon:` field of every entry in the
   `GAMES` array, js/app.js:15-39 (all 25 games), plus the `icon:` field of
   the three `CATEGORIES` entries, js/app.js:43-45.

   DEVELOPMENT_GUIDE.md §2:

     "The GAMES array in js/app.js still carries its original `emoji`
      property. It is data, not presentation — nothing renders it. Each
      entry also has an `icon` property (a Lucide name) and that is what
      the sidebar and lobby cards draw."

   `modules/casino/games/registry.ts` (`GameMeta.icon`) is the actual
   single source of truth for the 3 games ported so far — it re-exports
   from this map so the value can't drift between the two files. This map
   stays the full 25-game reference for Phase 3, which still has 22 games
   to port and nothing left to look up when it gets there.
   ============================================================ */

/** Every legacy game id -> the IconName its sidebar row / lobby card / page title draws. */
export const GAME_ICONS: Record<string, IconName> = {
  slots: 'cherry',
  gems: 'gem',
  blackjack: 'spade',
  videopoker: 'club',
  roulette: 'disc-3',
  dice: 'dices',
  mines: 'bomb',
  crash: 'rocket',
  limbo: 'trending-up',
  plinko: 'git-fork',
  hilo: 'arrow-up-down',
  tower: 'layers',
  wheel: 'target',
  chicken: 'bird',
  holdem: 'diamond',
  baccarat: 'heart',
  threecard: 'layers-2',
  casinowar: 'swords',
  reddog: 'circle-dot',
  battleship: 'ship',
  moles: 'hammer',
  snakes: 'rc:snake',
  coinflip: 'circle-dollar-sign',
  rps: 'rc:rock',
  keno: 'hash',
}

/**
 * The three lobby category headers (`CATEGORIES` in js/app.js). Kept
 * separate from `GAME_ICONS` because the category key `slots` collides
 * with the game id `slots` — merging them into one map would silently pick
 * whichever entry was assigned last.
 */
export const SECTION_ICONS: Record<string, IconName> = {
  live: 'spade',
  originals: 'zap',
  slots: 'cherry',
}
