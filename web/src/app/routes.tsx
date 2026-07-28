import { useHashRoute } from './hashRoute'
import AppShell from './AppShell'
import Lobby from '@/modules/casino/lobby/Lobby'
import ShimTestPage from '@/dev/ShimTestPage'

export default function App() {
  const route = useHashRoute()

  return (
    <AppShell>
      <Screen route={route} />
    </AppShell>
  )
}

function Screen({ route }: { route: string }) {
  switch (route) {
    case '__shim':
      return <ShimTestPage />
    case '':
      return <Lobby />
    default:
      return <Lobby />
  }
}
