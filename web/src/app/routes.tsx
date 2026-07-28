import { useHashRoute } from './hashRoute'
import AppShell from './AppShell'
import Lobby from '@/modules/casino/lobby/Lobby'
import DiceGame from '@/modules/casino/games/Dice/DiceGame'
import MinesGame from '@/modules/casino/games/Mines/MinesGame'
import HoldemGame from '@/modules/casino/games/Holdem/HoldemGame'
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
    case 'dice':
      return <DiceGame />
    case 'mines':
      return <MinesGame />
    case 'holdem':
      return <HoldemGame />
    case '__shim':
      return <ShimTestPage />
    default:
      return <Lobby />
  }
}
