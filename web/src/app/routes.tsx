import { useHashRoute } from './hashRoute'
import AppShell from './AppShell'
import Lobby from '@/modules/casino/lobby/Lobby'
import BlackjackGame from '@/modules/casino/games/Blackjack/BlackjackGame'
import DiceGame from '@/modules/casino/games/Dice/DiceGame'
import MinesGame from '@/modules/casino/games/Mines/MinesGame'
import HoldemGame from '@/modules/casino/games/Holdem/HoldemGame'
import LimboGame from '@/modules/casino/games/Limbo/LimboGame'
import PlinkoGame from '@/modules/casino/games/Plinko/PlinkoGame'
import CrashGame from '@/modules/casino/games/Crash/CrashGame'
import WheelGame from '@/modules/casino/games/Wheel/WheelGame'
import ChickenGame from '@/modules/casino/games/Chicken/ChickenGame'
import RPSGame from '@/modules/casino/games/RPS/RPSGame'
import CoinflipGame from '@/modules/casino/games/Coinflip/CoinflipGame'
import TowerGame from '@/modules/casino/games/Tower/TowerGame'
import SnakesGame from '@/modules/casino/games/Snakes/SnakesGame'
import MolesGame from '@/modules/casino/games/Moles/MolesGame'
import KenoGame from '@/modules/casino/games/Keno/KenoGame'
import BattleshipGame from '@/modules/casino/games/Battleship/BattleshipGame'
import HiloGame from '@/modules/casino/games/Hilo/HiloGame'
import VideoPokerGame from '@/modules/casino/games/VideoPoker/VideoPokerGame'
import BaccaratGame from '@/modules/casino/games/Baccarat/BaccaratGame'
import CasinoWarGame from '@/modules/casino/games/CasinoWar/CasinoWarGame'
import ThreeCardGame from '@/modules/casino/games/ThreeCard/ThreeCardGame'
import RedDogGame from '@/modules/casino/games/RedDog/RedDogGame'
import SlotsGame from '@/modules/casino/games/Slots/SlotsGame'
import GemsGame from '@/modules/casino/games/Gems/GemsGame'
import RouletteGame from '@/modules/casino/games/Roulette/RouletteGame'
import ShimTestPage from '@/dev/ShimTestPage'

export default function App() {
  const route = useHashRoute()

  return (
    <AppShell>
      {/* Keyed so switching tables fully remounts the game — this is what
          guarantees window.HoldemAPI is torn down when you leave Hold'em. */}
      <Screen key={route} route={route} />
    </AppShell>
  )
}

function Screen({ route }: { route: string }) {
  switch (route) {
    case 'blackjack':
      return <BlackjackGame />
    case 'dice':
      return <DiceGame />
    case 'mines':
      return <MinesGame />
    case 'holdem':
      return <HoldemGame />
    case 'limbo':
      return <LimboGame />
    case 'plinko':
      return <PlinkoGame />
    case 'crash':
      return <CrashGame />
    case 'wheel':
      return <WheelGame />
    case 'chicken':
      return <ChickenGame />
    case 'rps':
      return <RPSGame />
    case 'coinflip':
      return <CoinflipGame />
    case 'tower':
      return <TowerGame />
    case 'snakes':
      return <SnakesGame />
    case 'moles':
      return <MolesGame />
    case 'keno':
      return <KenoGame />
    case 'battleship':
      return <BattleshipGame />
    case 'hilo':
      return <HiloGame />
    case 'videopoker':
      return <VideoPokerGame />
    case 'baccarat':
      return <BaccaratGame />
    case 'casinowar':
      return <CasinoWarGame />
    case 'threecard':
      return <ThreeCardGame />
    case 'reddog':
      return <RedDogGame />
    case 'slots':
      return <SlotsGame />
    case 'gems':
      return <GemsGame />
    case 'roulette':
      return <RouletteGame />
    case '__shim':
      return <ShimTestPage />
    default:
      return <Lobby />
  }
}
