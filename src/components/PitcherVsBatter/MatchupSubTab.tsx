import { useMemo, type ReactElement } from 'react'
import type { StatSplit, VsPlayerStat } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import { parseStat } from '../../utils/sabermetrics'
import type { DataTableRow, SegmentedOption } from '../ui'
import { Segmented } from '../ui'
import { deriveThisGameH2H } from '../LiveAtBat/liveAtBatData'
import type { MatchupSide } from './MatchupPanels'
import {
  ArsenalFacedPanel,
  H2HPanel,
  MatchupHeader,
  SPLIT_COLUMNS,
  splitRow,
} from './MatchupPanels'
import { TablePanel, ZonePanel } from './PvbPanels'
import { rateText, splitCode } from './PvbShared'

const SCOPES: ReadonlyArray<SegmentedOption> = [
  { id: 'thisGame', label: 'This Game' },
  { id: 'season', label: 'Season' },
]

const ZONE_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { id: 'pitcher', label: 'Pitcher' },
  { id: 'batter', label: 'Batter' },
]

const SEASON = new Date().getFullYear().toString()

function findSplit(splits: readonly StatSplit[], code: string): StatSplit | null {
  return splits.find((split) => splitCode(split) === code) ?? null
}

function effectiveSide(batSide: 'L' | 'R' | 'S', pitchHand: 'L' | 'R'): 'L' | 'R' {
  if (batSide === 'S') return pitchHand === 'L' ? 'R' : 'L'
  return batSide
}

export function MatchupSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const globalScope = useGameStore((s) => s.globalScope)
  const setGlobalScope = useGameStore((s) => s.setGlobalScope)
  const zonePerspective = useGameStore((s) => s.zonePerspective)
  const setZonePerspective = useGameStore((s) => s.setZonePerspective)

  const matchup = currentPlay?.matchup ?? null
  const pitcher = derivePitcher(currentPlay, liveFeed, selectedGame)
  const batter = matchup?.batter ?? null
  const batterId = batter?.id ?? null
  const pitcherId = pitcher?.id ?? null

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

  const thisGameH2H = useMemo<VsPlayerStat | null>(() => {
    if (liveFeed === null || batterId === null || pitcherId === null) return null
    return deriveThisGameH2H(liveFeed.liveData.plays.allPlays, batterId, pitcherId)
  }, [liveFeed, batterId, pitcherId])

  const h2hStat = globalScope === 'thisGame' ? thisGameH2H : vsPlayer
  const h2hLoading = loading
  const h2hTitle = globalScope === 'thisGame' ? 'This Game H2H' : 'Season H2H'
  const h2hEmpty =
    globalScope === 'thisGame' ? 'No meetings in this game yet' : 'No meetings this season'
  const h2hHint =
    globalScope === 'thisGame'
      ? 'H2H updates as the batter faces this pitcher.'
      : 'Season totals cover every meeting this year.'

  const activeZones = zonePerspective === 'pitcher' ? pitcherHotCold : batterHotCold
  const zoneTitle = zonePerspective === 'pitcher' ? 'Pitcher Zones' : 'Batter Zones'
  const zoneCaption =
    zonePerspective === 'pitcher'
      ? 'Average allowed by zone \u00b7 pitcher perspective'
      : 'Batting average by zone \u00b7 pitcher perspective'

  return (
    <div>
      <MatchupHeader pitcher={pitcherSide} batter={batterSide} />

      <Segmented
        options={SCOPES}
        activeId={globalScope}
        onSelect={(id) => setGlobalScope(id as typeof globalScope)}
      />

      <H2HPanel
        title={h2hTitle}
        stat={h2hStat}
        benchmarkAvg={benchmarkAvg}
        loading={h2hLoading}
        emptyMessage={h2hEmpty}
        emptyHint={h2hHint}
      />

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

      <Segmented
        options={ZONE_OPTIONS}
        activeId={zonePerspective}
        onSelect={(id) => setZonePerspective(id as typeof zonePerspective)}
      />
      <ZonePanel
        title={zoneTitle}
        caption={zoneCaption}
        zones={activeZones}
        loading={loading}
        emptyMessage="No zone data for this season"
        perspective="pitcher"
      />
    </div>
  )
}
