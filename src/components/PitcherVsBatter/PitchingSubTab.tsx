import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { fetchCachedGameLog } from '../../api/playerStatsCache'
import type { CareerPitcherStat, GameLogEntry, PitcherSeasonStat, StatSplit } from '../../api/types'
import type { PitcherRole } from '../../api/benchmarks'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useStatBenchmarks } from '../../hooks/useStatBenchmarks'
import { useCareerMatchupStats } from '../../hooks/useCareerMatchupStats'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import { PARK_FACTORS } from '../../utils/leagueConstants'
import type { DataTableRow } from '../ui'
import { EmptyPanel, Segmented } from '../ui'
import {
  buildGameArsenalRows,
  buildSeasonArsenalRows,
  type HandednessFilter,
} from './ArsenalColorCoding'
import { ColorCodedArsenal } from './ColorCodedArsenal'
import { PvbCard } from './PvbCard'
import {
  pitcherCareerCells,
  pitcherSeasonCells,
  type Cell,
} from './PvbCards'
import { benchmarkPitcherCells, type PitcherBenchmarkContext } from './PvbBenchmarks'
import { Panel, TablePanel } from './PvbPanels'
import {
  LOG_COLUMNS,
  SPLIT_COLUMNS,
  aggregate,
  lineRow,
  situationRow,
} from './PitchingPanels'
import { monthDay, splitCode, whole } from './PvbShared'

const SEASON = new Date().getFullYear().toString()

const STAT_SCOPE_OPTIONS = [
  { id: 'season', label: 'Season' },
  { id: 'career', label: 'Career' },
]

const SITUATIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'vl', label: 'vs L' },
  { code: 'vr', label: 'vs R' },
  { code: 'risp', label: 'RISP' },
]

function resolvePitcherRole(stat: PitcherSeasonStat | null): PitcherRole {
  if (stat === null) return 'starter'
  const starts = stat.gamesStarted ?? 0
  const appearances = stat.gamesPitched ?? stat.gamesPlayed
  return starts > 0 && starts >= appearances / 2 ? 'starter' : 'reliever'
}

export function PitchingSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const gameFeedPitches = useGameStore((s) => s.gameFeedPitches)
  const globalScope = useGameStore((s) => s.globalScope)

  const matchup = currentPlay?.matchup ?? null
  const batterId = matchup?.batter.id ?? null
  const pitcher = derivePitcher(currentPlay, liveFeed, selectedGame)
  const pitcherId = pitcher?.id ?? null

  const { pitchArsenal, pitcherSplits, pitcherSeason, loading } = usePlayerStats(batterId, pitcherId)
  const { pitcher: careerPitcher } = useCareerMatchupStats(pitcherId, batterId)

  const [statScope, setStatScope] = useState<'season' | 'career'>('season')
  const [handedness, setHandedness] = useState<HandednessFilter>('all')
  const [log, setLog] = useState<GameLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  useEffect((): (() => void) | undefined => {
    if (pitcherId === null) {
      setLog([])
      return undefined
    }
    let cancelled = false
    setLogLoading(true)
    fetchCachedGameLog(pitcherId, SEASON, 'pitching')
      .then((entries) => {
        if (!cancelled) setLog(entries)
      })
      .catch(() => {
        if (!cancelled) setLog([])
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pitcherId])

  const { cohorts, loading: benchmarkLoading } = useStatBenchmarks(statScope)

  const statCard = useMemo(() => {
    if (statScope === 'career') {
      if (careerPitcher === null) return { cells: [] as Cell[], loading: true }
      const cells = pitcherCareerCells(careerPitcher)
      if (cohorts === null || cohorts.scope !== 'career') return { cells, loading: benchmarkLoading }
      const role = resolvePitcherRole(pitcherSeason)
      const cohort = role === 'starter' ? cohorts.starters : cohorts.relievers
      const ctx: PitcherBenchmarkContext<CareerPitcherStat> = { scope: 'career', role, cohort }
      return { cells: benchmarkPitcherCells(cells, careerPitcher, ctx), loading: false }
    }
    if (pitcherSeason === null) return { cells: [] as Cell[], loading: true }
    const parkFactor = PARK_FACTORS[selectedGame?.venue?.name ?? ''] ?? 1.0
    const cells = pitcherSeasonCells(pitcherSeason, parkFactor)
    if (cohorts === null || cohorts.scope !== 'season') return { cells, loading: benchmarkLoading }
    const role = resolvePitcherRole(pitcherSeason)
    const cohort = role === 'starter' ? cohorts.starters : cohorts.relievers
    const ctx: PitcherBenchmarkContext<PitcherSeasonStat> = { scope: 'season', role, cohort }
    return { cells: benchmarkPitcherCells(cells, pitcherSeason, ctx), loading: false }
  }, [statScope, careerPitcher, pitcherSeason, cohorts, benchmarkLoading, selectedGame])

  const arsenalRows = useMemo(() => {
    if (globalScope === 'thisGame') {
      if (liveFeed === null || pitcherId === null) return [] as ReturnType<typeof buildGameArsenalRows>
      return buildGameArsenalRows(
        gameFeedPitches,
        liveFeed.liveData.plays.allPlays,
        liveFeed,
        pitcherId,
        handedness,
      )
    }
    return buildSeasonArsenalRows(pitchArsenal)
  }, [globalScope, gameFeedPitches, liveFeed, pitcherId, handedness, pitchArsenal])

  const arsenalTotalPitches = useMemo(() => {
    if (globalScope === 'thisGame') return arsenalRows.reduce((sum, r) => sum + r.count, 0)
    return pitchArsenal[0]?.totalPitches ?? 0
  }, [globalScope, arsenalRows, pitchArsenal])

  const splitRows = useMemo<DataTableRow[]>(() => {
    const byCode = new Map<string, StatSplit>()
    for (const entry of pitcherSplits) byCode.set(splitCode(entry), entry)

    const rows: DataTableRow[] = []
    for (const { code, label } of SITUATIONS) {
      const entry = byCode.get(code)
      if (entry) rows.push(situationRow(label, entry.stat))
    }
    const spans: ReadonlyArray<readonly [string, GameLogEntry[]]> = [
      ['Home', log.filter((entry) => entry.isHome)],
      ['Away', log.filter((entry) => !entry.isHome)],
      ['Season', log],
    ]
    for (const [label, entries] of spans) {
      const line = aggregate(entries)
      if (line.games > 0) rows.push(lineRow(label, line))
    }
    return rows
  }, [pitcherSplits, log])

  const logRows = useMemo<DataTableRow[]>(
    () =>
      [...log].reverse().map((entry) => ({
        date: `${entry.isHome ? 'vs' : '@'} ${monthDay(entry.date)}`,
        ip: entry.stat.inningsPitched ?? '',
        h: String(entry.stat.hits),
        er: whole(entry.stat.earnedRuns ?? null),
        bb: whole(entry.stat.baseOnBalls ?? null),
        k: String(entry.stat.strikeOuts),
      })),
    [log],
  )

  if (pitcherId === null || pitcher === null) {
    return (
      <div>
        <Panel title="Pitching">
          <EmptyPanel
            message="No pitcher on the mound yet"
            hint="Pitching data appears once a starter is announced."
          />
        </Panel>
      </div>
    )
  }

  const hand = matchup?.pitchHand.code
  const scopeLabel =
    globalScope === 'thisGame' ? 'This Game' : globalScope === 'season' ? 'Season' : 'Career'

  return (
    <div>
      <Segmented
        options={STAT_SCOPE_OPTIONS}
        activeId={statScope}
        onSelect={(id) => setStatScope(id as 'season' | 'career')}
      />
      <PvbCard
        personId={pitcher.id}
        name={pitcher.fullName}
        strap={`${hand === undefined ? 'Pitcher' : `${hand}HP`} \u00b7 ${SEASON}`}
        scopeLabel={statScope === 'season' ? 'Season' : 'Career'}
        role="pitcher"
        cells={statCard.cells}
        platoon={null}
        loading={statCard.loading}
      />

      <ColorCodedArsenal
        rows={arsenalRows}
        loading={loading}
        scopeLabel={scopeLabel}
        showHandednessToggle={globalScope === 'thisGame'}
        handedness={handedness}
        onHandednessChange={setHandedness}
        totalPitches={arsenalTotalPitches}
      />

      <TablePanel
        title="Opponent Splits"
        meta={SEASON}
        columns={SPLIT_COLUMNS}
        rows={splitRows}
        loading={loading || logLoading}
        emptyMessage="No situational splits published yet"
        emptyHint="Splits appear after the pitcher faces enough batters."
        skeletonRows={6}
      />

      <TablePanel
        title="Game Log"
        meta={`${String(log.length)} G`}
        columns={LOG_COLUMNS}
        rows={logRows}
        loading={logLoading}
        emptyMessage="No appearances logged this season"
        skeletonRows={6}
      />
    </div>
  )
}
