import { useState, useEffect } from 'react'
import { fetchSchedule } from '../../api/mlb'
import { useGameStore } from '../../store/gameStore'
import type { ScheduledGame } from '../../api/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function GameSelect() {
  const [games, setGames] = useState<ScheduledGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const selectGame = useGameStore((s) => s.selectGame)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const today = todayStr()
        const scheduled = await fetchSchedule(today)
        setGames(scheduled)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load schedule')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="loading">Loading today's games...</div>
  if (error) return <div className="error">{error}</div>
  if (games.length === 0) return <div className="empty">No games today.</div>

  const liveGames = games.filter((g) => g.status.abstractGameState === 'Live')
  const previewGames = games.filter((g) => g.status.abstractGameState === 'Preview')
  const finalGames = games.filter((g) => g.status.abstractGameState === 'Final')

  return (
    <div className="game-select">
      <h1>MLB Companion</h1>
      <p className="date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

      {liveGames.length > 0 && (
        <div className="game-group">
          <h2 className="group-title live">Live</h2>
          {liveGames.map((game) => (
            <GameCard key={game.gamePk} game={game} onSelect={selectGame} />
          ))}
        </div>
      )}

      {previewGames.length > 0 && (
        <div className="game-group">
          <h2 className="group-title preview">Upcoming</h2>
          {previewGames.map((game) => (
            <GameCard key={game.gamePk} game={game} onSelect={selectGame} />
          ))}
        </div>
      )}

      {finalGames.length > 0 && (
        <div className="game-group">
          <h2 className="group-title final">Final</h2>
          {finalGames.map((game) => (
            <GameCard key={game.gamePk} game={game} onSelect={selectGame} />
          ))}
        </div>
      )}
    </div>
  )
}

function GameCard({ game, onSelect }: { game: ScheduledGame; onSelect: (g: ScheduledGame) => void }) {
  const isLive = game.status.abstractGameState === 'Live'
  const awayScore = game.teams.away.score ?? 0
  const homeScore = game.teams.home.score ?? 0

  return (
    <button className="game-card" onClick={() => onSelect(game)}>
      <div className="game-card-teams">
        <div className="team-row">
          <span className="team-name">{game.teams.away.team.teamName}</span>
          {isLive || game.status.abstractGameState === 'Final' ? (
            <span className="team-score">{awayScore}</span>
          ) : null}
        </div>
        <div className="team-row">
          <span className="team-name">{game.teams.home.team.teamName}</span>
          {isLive || game.status.abstractGameState === 'Final' ? (
            <span className="team-score">{homeScore}</span>
          ) : null}
        </div>
      </div>
      <div className="game-card-meta">
        {isLive && <span className="status-badge live">LIVE</span>}
        {game.status.abstractGameState === 'Preview' && (
          <span className="status-badge preview">
            {new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
        {game.status.abstractGameState === 'Final' && <span className="status-badge final">FINAL</span>}
      </div>
    </button>
  )
}
