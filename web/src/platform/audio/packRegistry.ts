import type { SoundPack } from './types'
import { blackjackSounds } from '@/modules/casino/games/Blackjack/sounds'
import { diceSounds } from '@/modules/casino/games/Dice/sounds'
import { minesSounds } from '@/modules/casino/games/Mines/sounds'
import { holdemSounds } from '@/modules/casino/games/Holdem/sounds'
import { limboSounds } from '@/modules/casino/games/Limbo/sounds'
import { plinkoSounds } from '@/modules/casino/games/Plinko/sounds'
import { crashSounds } from '@/modules/casino/games/Crash/sounds'
import { wheelSounds } from '@/modules/casino/games/Wheel/sounds'
import { chickenSounds } from '@/modules/casino/games/Chicken/sounds'
import { rpsSounds } from '@/modules/casino/games/RPS/sounds'
import { coinflipSounds } from '@/modules/casino/games/Coinflip/sounds'
import { towerSounds } from '@/modules/casino/games/Tower/sounds'
import { snakesSounds } from '@/modules/casino/games/Snakes/sounds'
import { molesSounds } from '@/modules/casino/games/Moles/sounds'
import { kenoSounds } from '@/modules/casino/games/Keno/sounds'
import { battleshipSounds } from '@/modules/casino/games/Battleship/sounds'
import { hiloSounds } from '@/modules/casino/games/Hilo/sounds'
import { videoPokerSounds } from '@/modules/casino/games/VideoPoker/sounds'
import { baccaratSounds } from '@/modules/casino/games/Baccarat/sounds'
import { casinoWarSounds } from '@/modules/casino/games/CasinoWar/sounds'
import { threeCardSounds } from '@/modules/casino/games/ThreeCard/sounds'
import { redDogSounds } from '@/modules/casino/games/RedDog/sounds'
import { slotsSounds } from '@/modules/casino/games/Slots/sounds'
import { gemsSounds } from '@/modules/casino/games/Gems/sounds'
import { rouletteSounds } from '@/modules/casino/games/Roulette/sounds'

/* ============================================================
   Maps a game id (registry.ts / location.hash — the same id `data-nav`,
   routes.tsx, and agentUi.ts's currentGameId() all use) to that game's own
   themed sound pack, so the global click delegate (useGlobalClickSound.ts)
   plays a table-appropriate click instead of one generic blip everywhere.
   Every id here matches a `GAMES[].id` in
   src/modules/casino/games/registry.ts — kept in the same order as that
   file so the two are easy to diff against each other.
   ============================================================ */
export const PACK_REGISTRY: Record<string, SoundPack> = {
  blackjack: blackjackSounds,
  dice: diceSounds,
  mines: minesSounds,
  holdem: holdemSounds,
  limbo: limboSounds,
  plinko: plinkoSounds,
  crash: crashSounds,
  wheel: wheelSounds,
  chicken: chickenSounds,
  rps: rpsSounds,
  coinflip: coinflipSounds,
  tower: towerSounds,
  snakes: snakesSounds,
  moles: molesSounds,
  keno: kenoSounds,
  battleship: battleshipSounds,
  hilo: hiloSounds,
  videopoker: videoPokerSounds,
  baccarat: baccaratSounds,
  casinowar: casinoWarSounds,
  threecard: threeCardSounds,
  reddog: redDogSounds,
  slots: slotsSounds,
  gems: gemsSounds,
  roulette: rouletteSounds,
}

export function getPackForGame(gameId: string): SoundPack | undefined {
  return PACK_REGISTRY[gameId]
}
