import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { fetchCachedGameLog } from '../../api/playerStatsCache'
import type { GameLogEntry } from '../../api/types'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import type { DataTableColumn, DataTableRow, SegmentedOption } from '../ui'
import { EmptyPanel, Segmented } from '../ui'
import { Panel, TablePanel } from './PvbPanels'
import { atBatsOf, monthDay, whole } from './PvbShared'

/**
 * Logs tab — the only home for full game logs after the tab pivot.
 *
 * Both sides are fetched through `fetchCachedGameLog` rather than
 * `usePlayerStats`, because the hook's batter bundle is shared with panels
 * that only need a recent slice. Fetching here keeps the untruncated season
 * available without widening the shared bundle for every consumer.
 */

const SEASON = new Date().getFullYear().toString()

const DEFAULT_ROWS = 7

const PERSPECTIVE_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { id: 'pitcher', label: 'Pitcher' },
  { id: 'batter', label: 'Batter' },
]

const PITCHER_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'date', label: 'Date' },
  { key: 'ip', label: 'IP', align: 'right' },
  { key: 'h', label: 'H', align: 'right' },
  { key: 'er', label: 'ER', align: 'right' },
  { key: 'bb', label: 'BB', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

const BATTER_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'date', label: 'Date' },
  { key: 'ab', label: 'AB', align: 'right' },
  { key: 'h', label: 'H', align: 'right' },
  { key: 'db', label: '2B', align: 'right' },
  { key: 'hr', label: 'HR', align: 'right' },
  { key: 'rbi', label: 'RBI', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

function dateCell(entry: GameLogEntry): string {
  return `${entry.isHome ? 'vs' : '@'} ${monthDay(entry.date)}`
}

function pitcherRow(entry: GameLogEntry): DataTableRow {
  return {
    date: dateCell(entry),
    ip: entry.stat.inningsPitched ?? '',
    h: String(entry.stat.hits),
    er: whole(entry.stat.earnedRuns ?? null),
    bb: whole(entry.stat.baseOnBalls ?? null),
    k: String(entry.stat.strikeOuts),
  }
}

function batterRow(entry: GameLogEntry): DataTableRow {
  return {
    date: dateCell(entry),
    ab: whole(atBatsOf(entry)),
    h: String(entry.stat.hits),
    db: String(entry.stat.doubles),
    hr: String(entry.stat.homeRuns),
    rbi: String(entry.stat.rbi),
    k: String(entry.stat.strikeOuts),
  }
}

function useSeasonLog(
  personId: number | null,
  group: 'pitching' | 'hitting',
): { entries: GameLogEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<GameLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect((): (() => void) | undefined => {
    if (personId === null) {
      setEntries([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    fetchCachedGameLog(personId, SEASON, group)
      .then((log) => {
        if (!cancelled) setEntries(log)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [personId, group])

  return { entries, loading }
}

export function LogsSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const matchupPerspective = useGameStore((s) => s.matchupPerspective)
  const setMatchupPerspective = useGameStore((s) => s.setMatchupPerspective)

  const matchup = currentPlay?.matchup ?? null
  const batter = matchup?.batter ?? null
  const batterId = batter?.id ?? null
  const pitcher = derivePitcher(currentPlay, liveFeed, selectedGame)
  const pitcherId = pitcher?.id ?? null

  const pitcherLog = useSeasonLog(pitcherId, 'pitching')
  const batterLog = useSeasonLog(batterId, 'hitting')

  const [expanded, setExpanded] = useState(false)

  const isPitcher = matchupPerspective === 'pitcher'
  const source = isPitcher ? pitcherLog : batterLog
  const person = isPitcher ? pitcher : batter

  const rows = useMemo<DataTableRow[]>(() => {
    const ordered = [...source.entries].reverse()
    const visible = expanded ? ordered : ordered.slice(0, DEFAULT_ROWS)
    return visible.map((entry) => (isPitcher ? pitcherRow(entry) : batterRow(entry)))
  }, [source.entries, expanded, isPitcher])

  const total = source.entries.length
  const canExpand = total > DEFAULT_ROWS

  const perspective = (
    <Segmented
      options={PERSPECTIVE_OPTIONS}
      activeId={matchupPerspective}
      onSelect={(id) => {
        setMatchupPerspective(id as 'pitcher' | 'batter')
        setExpanded(false)
      }}
    />
  )

  if (person === null) {
    return (
      <div>
        {perspective}
        <Panel title="Game Log">
          <EmptyPanel
            message={isPitcher ? 'No pitcher on the mound yet' : 'No batter at the plate yet'}
            hint="Logs appear once the matchup resolves."
          />
        </Panel>
      </div>
    )
  }

  return (
    <div>
      {perspective}

      <TablePanel
        title={`${person.fullName} \u00b7 Game Log`}
        meta={`${expanded || !canExpand ? String(total) : `${String(DEFAULT_ROWS)} of ${String(total)}`} G`}
        columns={isPitcher ? PITCHER_COLUMNS : BATTER_COLUMNS}
        rows={rows}
        loading={source.loading}
        emptyMessage={isPitcher ? 'No appearances logged this season' : 'No games logged this season'}
        skeletonRows={DEFAULT_ROWS}
      />

      {canExpand ? (
        <button
          type="button"
          className="log-more"
          onClick={() => {
            setExpanded(!expanded)
          }}
        >
          {expanded ? 'Show less' : `Show all ${String(total)}`}
        </button>
      ) : null}
    </div>
  )
}
