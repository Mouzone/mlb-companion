import { useMemo, type ReactElement } from 'react'
import type { SeasonStat, StatSplit } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useStatBenchmarks } from '../../hooks/useStatBenchmarks'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import type { DataTableColumn, DataTableRow } from '../ui'
import { EmptyPanel } from '../ui'
import { PvbCard } from './PvbCard'
import { batterSeasonCells, type Cell } from './PvbCards'
import { benchmarkBatterCells, type BatterBenchmarkContext } from './PvbBenchmarks'
import { Panel, TablePanel } from './PvbPanels'
import {
  monthDay,
  rateText,
  splitCode,
  sumOptional,
  whole,
} from './PvbShared'

const SEASON = new Date().getFullYear().toString()

const SITUATIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'vl', label: 'vs LHP' },
  { code: 'vr', label: 'vs RHP' },
  { code: 'risp', label: 'RISP' },
]

const SPLIT_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'split', label: 'Split' },
  { key: 'pa', label: 'PA', align: 'right' },
  { key: 'avg', label: 'AVG', align: 'right' },
  { key: 'ops', label: 'OPS', align: 'right' },
  { key: 'hr', label: 'HR', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

const LOG_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'date', label: 'Date' },
  { key: 'ab', label: 'AB', align: 'right' },
  { key: 'h', label: 'H', align: 'right' },
  { key: 'db', label: '2B', align: 'right' },
  { key: 'hr', label: 'HR', align: 'right' },
  { key: 'rbi', label: 'RBI', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

interface SplitSource {
  readonly avg: string
  readonly ops: string
  readonly homeRuns: number
  readonly strikeOuts: number
  readonly plateAppearances: number
}

function splitRow(label: string, stat: SplitSource | null): DataTableRow | null {
  if (stat === null) return null
  return {
    split: label,
    pa: String(stat.plateAppearances),
    avg: rateText(stat.avg),
    ops: rateText(stat.ops),
    hr: String(stat.homeRuns),
    k: String(stat.strikeOuts),
  }
}

const HANDEDNESS: Record<string, string> = { L: 'LH batter', R: 'RH batter', S: 'Switch hitter' }

export function BattingSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)

  const matchup = currentPlay?.matchup ?? null
  const batter = matchup?.batter ?? null
  const batterId = batter?.id ?? null
  const pitcherId = derivePitcher(currentPlay, liveFeed, selectedGame)?.id ?? null

  const { batterSeason, batterSplits, gameLog, vsPlayer, loading } = usePlayerStats(batterId, pitcherId)
  const { cohorts, loading: benchmarkLoading } = useStatBenchmarks('season')

  const statCard = useMemo(() => {
    if (batterSeason === null) return { cells: [] as Cell[], loading: true }
    const cells = batterSeasonCells(batterSeason)
    if (cohorts === null || cohorts.scope !== 'season') return { cells, loading: benchmarkLoading }
    const ctx: BatterBenchmarkContext<SeasonStat> = { scope: 'season', cohort: cohorts.batters }
    return { cells: benchmarkBatterCells(cells, batterSeason, ctx), loading: false }
  }, [batterSeason, cohorts, benchmarkLoading])

  const splitRows = useMemo<DataTableRow[]>(() => {
    const byCode = new Map<string, StatSplit>()
    for (const split of batterSplits) byCode.set(splitCode(split), split)
    const candidates = [
      ...SITUATIONS.map(({ code, label }) => splitRow(label, byCode.get(code)?.stat ?? null)),
      splitRow('Season', batterSeason),
      splitRow('vs Pitcher', vsPlayer),
    ]
    return candidates.filter((row): row is DataTableRow => row !== null)
  }, [batterSplits, batterSeason, vsPlayer])

  const logRows = useMemo<DataTableRow[]>(
    () =>
      [...gameLog].reverse().map((entry) => ({
        date: `${entry.isHome ? 'vs' : '@'} ${monthDay(entry.date)}`,
        ab: whole(sumOptional([entry], 'atBats')),
        h: String(entry.stat.hits),
        db: String(entry.stat.doubles),
        hr: String(entry.stat.homeRuns),
        rbi: String(entry.stat.rbi),
        k: String(entry.stat.strikeOuts),
      })),
    [gameLog],
  )

  if (batterId === null || batter === null) {
    return (
      <div>
        <Panel title="Batting">
          <EmptyPanel
            message="No batter at the plate yet"
            hint="Batting data appears once the first at-bat begins."
          />
        </Panel>
      </div>
    )
  }

  const side = matchup?.batSide.code
  const logSpan =
    gameLog.length > 0
      ? `${monthDay(gameLog[0]?.date ?? '')}\u2013${monthDay(gameLog[gameLog.length - 1]?.date ?? '')}`
      : undefined

  return (
    <div>
      <PvbCard
        personId={batter.id}
        name={batter.fullName}
        strap={`${(side === undefined ? undefined : HANDEDNESS[side]) ?? 'Batter'} \u00b7 ${SEASON}`}
        scopeLabel="Season"
        role="batter"
        cells={statCard.cells}
        platoon={null}
        loading={statCard.loading}
      />

      <TablePanel
        title="Splits"
        meta={SEASON}
        columns={SPLIT_COLUMNS}
        rows={splitRows}
        loading={loading}
        emptyMessage="No situational splits published yet"
        emptyHint="Splits appear once the batter records enough plate appearances."
        skeletonRows={5}
      />

      <TablePanel
        title="Game Log"
        meta={logSpan}
        columns={LOG_COLUMNS}
        rows={logRows}
        loading={loading}
        emptyMessage="No games logged this season"
        skeletonRows={5}
      />
    </div>
  )
}
