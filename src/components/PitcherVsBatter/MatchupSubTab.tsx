import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { fetchCachedCareerVsPlayer } from '../../api/playerStatsCache'
import type { StatSplit, VsPlayerStat } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import { parseStat } from '../../utils/sabermetrics'
import type { DataTableRow } from '../ui'
import { Segmented } from '../ui'
import type { MatchupSide } from './MatchupPanels'
import {
  ArsenalFacedPanel,
  H2HPanel,
  MatchupHeader,
  SPLIT_COLUMNS,
  ZoneEdgePanel,
  splitRow,
} from './MatchupPanels'
import type { SeriesResult } from './MatchupSeries'
import { NO_SERIES, SeriesPanels, aggregateSeries, loadSeries } from './MatchupSeries'
import { TablePanel } from './PvbPanels'
import { rateText, splitCode } from './PvbShared'

type Scope = 'career' | 'series'
type Status = 'idle' | 'loading' | 'ready' | 'error'

const SCOPES = [
  { id: 'career', label: 'Career' },
  { id: 'series', label: 'Series' },
]

const SEASON = new Date().getFullYear().toString()

function isScope(value: string): value is Scope {
  return value === 'career' || value === 'series'
}

function findSplit(splits: readonly StatSplit[], code: string): StatSplit | null {
  return splits.find((split) => splitCode(split) === code) ?? null
}

/** A switch-hitter takes the side opposite the arm he is facing. */
function effectiveSide(batSide: 'L' | 'R' | 'S', pitchHand: 'L' | 'R'): 'L' | 'R' {
  if (batSide === 'S') return pitchHand === 'L' ? 'R' : 'L'
  return batSide
}

export function MatchupSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)

  const [scope, setScope] = useState<Scope>('career')
  const [career, setCareer] = useState<VsPlayerStat | null>(null)
  const [careerStatus, setCareerStatus] = useState<Status>('idle')
  const [series, setSeries] = useState<SeriesResult>(NO_SERIES)
  const [seriesStatus, setSeriesStatus] = useState<Status>('idle')

  const matchup = currentPlay?.matchup ?? null
  const pitcher = derivePitcher(currentPlay, liveFeed, selectedGame)
  const batter = matchup?.batter ?? null
  const batterId = batter?.id ?? null
  const pitcherId = pitcher?.id ?? null
  const gameDate = selectedGame?.gameDate ?? null
  const teamId = selectedGame?.teams.home.team.id ?? null
  const opponentId = selectedGame?.teams.away.team.id ?? null

  const {
    batterSeason,
    pitcherSeason,
    batterSplits,
    pitcherSplits,
    batterHotCold,
    pitcherHotCold,
    pitchArsenal,
    vsPlayer,
    loading,
  } = usePlayerStats(batterId, pitcherId)

  useEffect(() => {
    if (batterId === null || pitcherId === null) {
      setCareer(null)
      setCareerStatus('idle')
      return
    }
    let cancelled = false
    setCareerStatus('loading')
    fetchCachedCareerVsPlayer(batterId, pitcherId)
      .then((stat) => {
        if (cancelled) return
        setCareer(stat)
        setCareerStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setCareer(null)
        setCareerStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [batterId, pitcherId])

  useEffect(() => {
    if (scope !== 'series') return
    if (
      batterId === null ||
      pitcherId === null ||
      gameDate === null ||
      teamId === null ||
      opponentId === null
    ) {
      setSeriesStatus('idle')
      return
    }
    let cancelled = false
    setSeriesStatus('loading')
    loadSeries({ gameDate, teamId, opponentId, batterId, pitcherId })
      .then((result) => {
        if (cancelled) return
        setSeries(result)
        setSeriesStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setSeries(NO_SERIES)
        setSeriesStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [scope, batterId, pitcherId, gameDate, teamId, opponentId])

  const hand = matchup?.pitchHand.code ?? 'R'
  const side = effectiveSide(matchup?.batSide.code ?? 'R', hand)

  const splitRows = useMemo<DataTableRow[]>(() => {
    const rows: DataTableRow[] = []
    const batterVs = findSplit(batterSplits, hand === 'L' ? 'vl' : 'vr')
    const batterRisp = findSplit(batterSplits, 'risp')
    const pitcherVs = findSplit(pitcherSplits, side === 'L' ? 'vl' : 'vr')
    const pitcherRisp = findSplit(pitcherSplits, 'risp')

    if (pitcherSeason !== null) rows.push(splitRow('Pitcher season', pitcherSeason))
    if (pitcherVs) rows.push(splitRow(`Pitcher vs ${side}HB`, pitcherVs.stat))
    if (pitcherRisp) rows.push(splitRow('Pitcher RISP', pitcherRisp.stat))
    if (batterSeason !== null) rows.push(splitRow('Batter season', batterSeason))
    if (batterVs) rows.push(splitRow(`Batter vs ${hand}HP`, batterVs.stat))
    if (batterRisp) rows.push(splitRow('Batter RISP', batterRisp.stat))
    return rows
  }, [batterSplits, pitcherSplits, batterSeason, pitcherSeason, hand, side])

  const seriesLine = useMemo(
    () => aggregateSeries(series.games, series.atBats),
    [series.games, series.atBats],
  )

  const pitcherSide: MatchupSide = {
    personId: pitcherId ?? 0,
    name: pitcher?.fullName ?? 'Pitcher TBD',
    role: `${hand}HP \u00b7 ${SEASON}`,
    line:
      pitcherSeason === null
        ? 'No season line published'
        : `${rateText(pitcherSeason.era)} ERA \u00b7 ${rateText(pitcherSeason.whip)} WHIP \u00b7 ${pitcherSeason.inningsPitched} IP`,
  }

  const batterSide: MatchupSide = {
    personId: batterId ?? 0,
    name: batter?.fullName ?? 'Batter TBD',
    role: `${side}HB \u00b7 ${SEASON}`,
    line:
      batterSeason === null
        ? 'No season line published'
        : `${rateText(batterSeason.avg)} AVG \u00b7 ${rateText(batterSeason.ops)} OPS \u00b7 ${String(batterSeason.homeRuns)} HR`,
  }

  const benchmarkAvg = parseStat(batterSeason?.avg ?? '')

  return (
    <div>
      <MatchupHeader pitcher={pitcherSide} batter={batterSide} />

      <Segmented
        options={SCOPES}
        activeId={scope}
        onSelect={(id) => {
          if (isScope(id)) setScope(id)
        }}
      />

      {scope === 'career' ? (
        <>
          <H2HPanel
            title="Career Head-to-Head"
            stat={career}
            benchmarkAvg={benchmarkAvg}
            loading={careerStatus === 'loading'}
            emptyMessage={
              careerStatus === 'error' ? 'Head-to-head data unavailable' : 'No matchup history'
            }
            emptyHint="These two have not shared a completed plate appearance."
          />
          <H2HPanel
            title="Season Head-to-Head"
            meta={SEASON}
            stat={vsPlayer}
            benchmarkAvg={benchmarkAvg}
            loading={loading}
            emptyMessage="No meetings this season"
            emptyHint="Career totals above still cover every prior meeting."
          />
        </>
      ) : (
        <SeriesPanels
          line={seriesLine}
          atBats={series.atBats}
          loading={seriesStatus === 'loading'}
          emptyMessage={
            seriesStatus === 'error' ? 'Series data unavailable' : 'No meetings in this series'
          }
        />
      )}

      <TablePanel
        title="Platoon Matchup"
        meta={SEASON}
        columns={SPLIT_COLUMNS}
        rows={splitRows}
        loading={loading}
        emptyMessage="No situational splits published yet"
        emptyHint="Splits appear once both players log enough plate appearances."
        skeletonRows={6}
      />

      <ArsenalFacedPanel arsenal={pitchArsenal} loading={loading} />

      <ZoneEdgePanel batterZones={batterHotCold} pitcherZones={pitcherHotCold} loading={loading} />
    </div>
  )
}
