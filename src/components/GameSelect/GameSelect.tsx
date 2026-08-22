import { useState, useEffect, useMemo } from 'react'
import type { ReactElement } from 'react'
import { fetchSchedule } from '../../api/mlb'
import { useGameStore } from '../../store/gameStore'
import useWatchability from '../../hooks/useWatchability'
import type { ScheduledGame } from '../../api/types'
import { gameDateStr } from '../../utils/gameDay'
import { EmptyPanel, Segmented, Skeleton } from '../ui'
import type { SegmentedOption } from '../ui'
import { GameCard } from './GameCard'

type GroupTone = 'live' | 'preview' | 'final'

type SortMode = 'time' | 'watchability'

const SORT_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { id: 'time', label: 'Time' },
  { id: 'watchability', label: 'Watchability' },
]

// Honours the `?sort=watchability` PWA manifest shortcut. Without this the
// installed-app shortcut would open the plain slate and look broken.
function initialSortMode(): SortMode {
  const requested = new URLSearchParams(window.location.search).get('sort')
  return requested === 'watchability' ? 'watchability' : 'time'
}

interface Group {
  readonly tone: GroupTone
  readonly title: string
  readonly games: ScheduledGame[]
}

/** Unscored games sink last rather than sorting as 0, which would rank them below genuinely unwatchable games. */
function sortGames(games: ScheduledGame[], mode: SortMode, scores: ReadonlyMap<number, number>): ScheduledGame[] {
  const sorted = [...games]
  if (mode === 'watchability') {
    sorted.sort((a, b) => {
      const sa = scores.get(a.gamePk)
      const sb = scores.get(b.gamePk)
      if (sa === undefined && sb === undefined) return a.gameDate.localeCompare(b.gameDate)
      if (sa === undefined) return 1
      if (sb === undefined) return -1
      return sb - sa
    })
    return sorted
  }
  sorted.sort((a, b) => a.gameDate.localeCompare(b.gameDate))
  return sorted
}

function groupsOf(games: ScheduledGame[], mode: SortMode, scores: ReadonlyMap<number, number>): Group[] {
  const all: Group[] = [
    { tone: 'live', title: 'Live', games: games.filter((g) => g.status.abstractGameState === 'Live') },
    { tone: 'preview', title: 'Upcoming', games: games.filter((g) => g.status.abstractGameState === 'Preview') },
    { tone: 'final', title: 'Final', games: games.filter((g) => g.status.abstractGameState === 'Final') },
  ]
  return all
    .filter((group) => group.games.length > 0)
    .map((group) => ({ ...group, games: sortGames(group.games, mode, scores) }))
}

/** Mirrors the real card box exactly (DESIGN.md §5.12) so load shifts nothing. */
function GameCardSkeleton(): ReactElement {
  return (
    <span className="gc-skeleton" aria-hidden="true">
      <span className="gc-head">
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
        <Skeleton width="96px" height="96px" radius="var(--radius-pill)" />
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
  const [sortMode, setSortMode] = useState<SortMode>(initialSortMode)
  const selectGame = useGameStore((s) => s.selectGame)
  const { scores } = useWatchability(games)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const scheduled = await fetchSchedule(gameDateStr())
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

  const scoreMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const [gamePk, result] of scores) map.set(gamePk, result.score)
    return map
  }, [scores])

  const groups = useMemo(() => groupsOf(games, sortMode, scoreMap), [games, sortMode, scoreMap])

  return (
    <div className="game-select">
      <header className="slate-header">
        <div className="slate-heading">
          <h1>MLB Companion</h1>
          <p className="date">{today}</p>
        </div>

        {!loading && error === null && games.length > 0 ? (
          <div className="slate-sort">
            <Segmented
              options={SORT_OPTIONS}
              activeId={sortMode}
              onSelect={(id) => setSortMode(id as SortMode)}
              size="sm"
            />
          </div>
        ) : null}
      </header>

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
            <GameCard
              key={game.gamePk}
              game={game}
              onSelect={selectGame}
              watchability={scoreMap.get(game.gamePk) ?? null}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
