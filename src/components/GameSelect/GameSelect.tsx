import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { fetchSchedule } from '../../api/mlb'
import { useGameStore } from '../../store/gameStore'
import type { ScheduledGame } from '../../api/types'
import { EmptyPanel, Skeleton } from '../ui'
import { GameCard } from './GameCard'

type GroupTone = 'live' | 'preview' | 'final'

interface Group {
  readonly tone: GroupTone
  readonly title: string
  readonly games: ScheduledGame[]
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function groupsOf(games: ScheduledGame[]): Group[] {
  const all: Group[] = [
    { tone: 'live', title: 'Live', games: games.filter((g) => g.status.abstractGameState === 'Live') },
    { tone: 'preview', title: 'Upcoming', games: games.filter((g) => g.status.abstractGameState === 'Preview') },
    { tone: 'final', title: 'Final', games: games.filter((g) => g.status.abstractGameState === 'Final') },
  ]
  return all.filter((group) => group.games.length > 0)
}

/** Mirrors the real card box exactly (DESIGN.md §5.12) so load shifts nothing. */
function GameCardSkeleton(): ReactElement {
  return (
    <span className="gc-skeleton" aria-hidden="true">
      <span className="gc-teams">
        <span className="gc-team">
          <Skeleton width="44px" height="44px" radius="var(--radius-sm)" />
          <span className="gc-identity">
            <Skeleton width="70%" height="var(--sp-5)" />
            <Skeleton width="30%" height="var(--sp-4)" />
          </span>
        </span>
        <span className="gc-team">
          <Skeleton width="44px" height="44px" radius="var(--radius-sm)" />
          <span className="gc-identity">
            <Skeleton width="60%" height="var(--sp-5)" />
            <Skeleton width="30%" height="var(--sp-4)" />
          </span>
        </span>
      </span>
      <span className="gc-footer">
        <Skeleton width="30%" height="var(--sp-5)" radius="var(--radius-pill)" />
        <Skeleton width="40%" height="var(--sp-4)" />
      </span>
      <span className="gc-probables">
        <span className="gc-probable">
          <Skeleton width="32px" height="32px" radius="var(--radius-pill)" />
          <Skeleton width="60%" height="var(--sp-4)" />
        </span>
        <span className="gc-probable">
          <Skeleton width="32px" height="32px" radius="var(--radius-pill)" />
          <Skeleton width="60%" height="var(--sp-4)" />
        </span>
      </span>
    </span>
  )
}

export function GameSelect(): ReactElement {
  const [games, setGames] = useState<ScheduledGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const selectGame = useGameStore((s) => s.selectGame)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const scheduled = await fetchSchedule(todayStr())
        if (!cancelled) setGames(scheduled)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load schedule')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const groups = groupsOf(games)

  return (
    <div className="game-select">
      <h1>MLB Companion</h1>
      <p className="date">{today}</p>

      {loading ? (
        <div className="game-group" aria-busy="true">
          <h2 className="group-title preview">Loading today&rsquo;s games</h2>
          <GameCardSkeleton />
          <GameCardSkeleton />
          <GameCardSkeleton />
        </div>
      ) : null}

      {!loading && error !== null ? (
        <EmptyPanel message="Could not load today&rsquo;s schedule." hint={error} />
      ) : null}

      {!loading && error === null && groups.length === 0 ? (
        <EmptyPanel
          message="No games scheduled today."
          hint="Check back on the next game day, or open a game directly with ?gamePk=<id>."
        />
      ) : null}

      {groups.map((group) => (
        <div className="game-group" key={group.tone}>
          <h2 className={`group-title ${group.tone}`}>
            {group.title}
            <span className="group-count">{group.games.length}</span>
          </h2>
          {group.games.map((game) => (
            <GameCard key={game.gamePk} game={game} onSelect={selectGame} />
          ))}
        </div>
      ))}
    </div>
  )
}
