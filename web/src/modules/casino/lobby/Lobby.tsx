import { GAMES } from '../games/registry'
import { navigate } from '@/app/hashRoute'

export default function Lobby() {
  return (
    <div>
      <div className="page-head mb-6">
        <h1 className="page-title text-2xl font-semibold text-text">Lobby</h1>
        <p className="page-sub text-sm text-muted mt-1">
          Phase 0 spike — three tables, one very opinionated robot.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            data-nav={g.id}
            onClick={() => navigate(g.id)}
            className="game-card text-left p-4 rounded-[14px] border transition-transform hover:-translate-y-1"
            style={{
              borderColor: 'var(--glass-line)',
              background: 'var(--glass)',
              boxShadow: 'var(--lift-1)',
            }}
          >
            <div className="text-base font-medium text-text" style={{ color: g.accent }}>
              {g.name}
            </div>
            <div className="text-sm text-muted mt-1">{g.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
