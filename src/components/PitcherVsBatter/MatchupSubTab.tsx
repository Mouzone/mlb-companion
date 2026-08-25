import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { fetchCachedGameLog } from '../../api/playerStatsCache'
import type { GameLogEntry, StatSplit, VsPlayerStat } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import { parseStat } from '../../utils/sabermetrics'
import type { DataTableRow, SegmentedOption } from '../ui'
import { Segmented } from '../ui'
import {
  deriveBatterLine,
  derivePitcherLine,
  deriveThisGameH2H,
} from '../LiveAtBat/liveAtBatData'
import {
  buildGameArsenalRows,
  buildSeasonArsenalRows,
  type HandednessFilter,
} from './ArsenalColorCoding'
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

/** The order the face-card arrows step through; wraps at both ends. */
const SCOPE_CYCLE = ['thisGame', 'season'] as const

const SCOPE_LABELS: Record<(typeof SCOPE_CYCLE)[number], string> = {
  thisGame: 'This Game',
  season: 'Season',
}

const ZONE_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { id: 'pitcher', label: 'Pitcher' },
  { id: 'batter', label: 'Batter' },
]

const SPLIT_OPTIONS: ReadonlyArray<SegmentedOption> = [
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

/**
 * Rolls a set of game-log entries into the same shape a published split has, so
 * a home/away line can sit in the same table as `vs L` without a second column
 * set. Rate stats are recomputed from the totals rather than averaged, which
 * would weight a one-at-bat game the same as a five-at-bat game.
 */
function aggregateLog(entries: readonly GameLogEntry[]): {
  avg: string
  ops: string
  homeRuns: number
  strikeOuts: number
  plateAppearances: number
} {
  let hits = 0
  let plateAppearances = 0
  let homeRuns = 0
  let strikeOuts = 0
  let opsTotal = 0
  let opsCount = 0

  for (const entry of entries) {
    hits += entry.stat.hits
    plateAppearances += entry.stat.plateAppearances
    homeRuns += entry.stat.homeRuns
    strikeOuts += entry.stat.strikeOuts
    const ops = parseStat(entry.stat.ops)
    if (ops !== null) {
      opsTotal += ops
      opsCount += 1
    }
  }

  const avg = plateAppearances > 0 ? hits / plateAppearances : null
  return {
    avg: avg === null ? '---' : avg.toFixed(3).replace(/^0/, ''),
    ops: opsCount > 0 ? (opsTotal / opsCount).toFixed(3).replace(/^0/, '') : '---',
    homeRuns,
    strikeOuts,
    plateAppearances,
  }
}

export function MatchupSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const gameFeedPitches = useGameStore((s) => s.gameFeedPitches)
  const globalScope = useGameStore((s) => s.globalScope)
  const setGlobalScope = useGameStore((s) => s.setGlobalScope)
  const zonePerspective = useGameStore((s) => s.zonePerspective)
  const setZonePerspective = useGameStore((s) => s.setZonePerspective)
  const splitPerspective = useGameStore((s) => s.splitPerspective)
  const setSplitPerspective = useGameStore((s) => s.setSplitPerspective)

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

  const [handedness, setHandedness] = useState<HandednessFilter>('all')
  const [pitcherLog, setPitcherLog] = useState<GameLogEntry[]>([])
  const [batterLog, setBatterLog] = useState<GameLogEntry[]>([])

  // Home/away is not a published split — it is the game log grouped by venue,
  // so both logs are fetched here rather than inferred from the season line.
  useEffect((): (() => void) | undefined => {
    if (pitcherId === null) {
      setPitcherLog([])
      return undefined
    }
    let cancelled = false
    fetchCachedGameLog(pitcherId, SEASON, 'pitching')
      .then((entries) => {
        if (!cancelled) setPitcherLog(entries)
      })
      .catch(() => {
        if (!cancelled) setPitcherLog([])
      })
    return () => {
      cancelled = true
    }
  }, [pitcherId])

  useEffect((): (() => void) | undefined => {
    if (batterId === null) {
      setBatterLog([])
      return undefined
    }
    let cancelled = false
    fetchCachedGameLog(batterId, SEASON, 'hitting')
      .then((entries) => {
        if (!cancelled) setBatterLog(entries)
      })
      .catch(() => {
        if (!cancelled) setBatterLog([])
      })
    return () => {
      cancelled = true
    }
  }, [batterId])

  const hand = matchup?.pitchHand.code ?? 'R'
  const side = effectiveSide(matchup?.batSide.code ?? 'R', hand)

  const splitRows = useMemo<DataTableRow[]>(() => {
    const isPitcherView = splitPerspective === 'pitcher'
    const season = isPitcherView ? pitcherSeason : batterSeason
    const splits = isPitcherView ? pitcherSplits : batterSplits
    const log = isPitcherView ? pitcherLog : batterLog
    const vsLabel = isPitcherView ? 'HB' : 'HP'

    const rows: DataTableRow[] = []
    if (season !== null) rows.push(splitRow('Season', season))

    const vsLeft = findSplit(splits, 'vl')
    const vsRight = findSplit(splits, 'vr')
    if (vsLeft) rows.push(splitRow(`vs L${vsLabel}`, vsLeft.stat))
    if (vsRight) rows.push(splitRow(`vs R${vsLabel}`, vsRight.stat))

    const risp = findSplit(splits, 'risp')
    if (risp) rows.push(splitRow('RISP', risp.stat))

    const home = log.filter((entry) => entry.isHome)
    const away = log.filter((entry) => !entry.isHome)
    if (home.length > 0) rows.push(splitRow('Home', aggregateLog(home)))
    if (away.length > 0) rows.push(splitRow('Away', aggregateLog(away)))
    return rows
  }, [
    splitPerspective,
    pitcherSeason,
    batterSeason,
    pitcherSplits,
    batterSplits,
    pitcherLog,
    batterLog,
  ])

  const gameLines = useMemo(() => {
    if (liveFeed === null || currentPlay === null) return { pitcher: '', batter: '' }
    const plays = liveFeed.liveData.plays.allPlays
    const line =
      batterId === null ? '' : deriveBatterLine(plays, batterId, currentPlay.about.atBatIndex).summary
    return { pitcher: derivePitcherLine(plays, currentPlay).summary, batter: line }
  }, [liveFeed, currentPlay, batterId])

  const isGame = globalScope === 'thisGame'

  const arsenalRows = useMemo(() => {
    if (isGame) {
      if (liveFeed === null || pitcherId === null) {
        return [] as ReturnType<typeof buildGameArsenalRows>
      }
      return buildGameArsenalRows(
        gameFeedPitches,
        liveFeed.liveData.plays.allPlays,
        liveFeed,
        pitcherId,
        handedness,
      )
    }
    return buildSeasonArsenalRows(pitchArsenal)
  }, [isGame, gameFeedPitches, liveFeed, pitcherId, handedness, pitchArsenal])

  const arsenalTotalPitches = useMemo(() => {
    if (isGame) return arsenalRows.reduce((sum, row) => sum + row.count, 0)
    return pitchArsenal[0]?.totalPitches ?? 0
  }, [isGame, arsenalRows, pitchArsenal])

  const pitcherLine = isGame
    ? gameLines.pitcher === ''
      ? 'No pitches thrown yet'
      : gameLines.pitcher
    : pitcherSeason === null
      ? 'No season line published'
      : `${rateText(pitcherSeason.era)} ERA \u00b7 ${rateText(pitcherSeason.whip)} WHIP \u00b7 ${pitcherSeason.inningsPitched} IP`

  const batterLine = isGame
    ? gameLines.batter === ''
      ? 'No plate appearances yet'
      : gameLines.batter
    : batterSeason === null
      ? 'No season line published'
      : `${rateText(batterSeason.avg)} AVG \u00b7 ${rateText(batterSeason.ops)} OPS \u00b7 ${String(batterSeason.homeRuns)} HR`

  const pitcherSide: MatchupSide = {
    personId: pitcherId ?? 0,
    name: pitcher?.fullName ?? 'Pitcher TBD',
    role: isGame ? `${hand}HP \u00b7 This Game` : `${hand}HP \u00b7 ${SEASON}`,
    line: pitcherLine,
  }

  const batterSide: MatchupSide = {
    personId: batterId ?? 0,
    name: batter?.fullName ?? 'Batter TBD',
    role: isGame ? `${side}HB \u00b7 This Game` : `${side}HB \u00b7 ${SEASON}`,
    line: batterLine,
  }

  const cycleScope = (direction: -1 | 1): void => {
    const at = SCOPE_CYCLE.indexOf(globalScope)
    const next = (at + direction + SCOPE_CYCLE.length) % SCOPE_CYCLE.length
    setGlobalScope(SCOPE_CYCLE[next])
  }

  const benchmarkAvg = parseStat(batterSeason?.avg ?? '')

  const thisGameH2H = useMemo<VsPlayerStat | null>(() => {
    if (liveFeed === null || batterId === null || pitcherId === null) return null
    return deriveThisGameH2H(liveFeed.liveData.plays.allPlays, batterId, pitcherId)
  }, [liveFeed, batterId, pitcherId])

  const h2hStat = isGame ? thisGameH2H : vsPlayer
  const h2hTitle = isGame ? 'This Game H2H' : 'Season H2H'
  const h2hEmpty = isGame ? 'No meetings in this game yet' : 'No meetings this season'
  const h2hHint = isGame
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
      <MatchupHeader
        pitcher={pitcherSide}
        batter={batterSide}
        scopeLabel={SCOPE_LABELS[globalScope]}
        onCycleScope={cycleScope}
      />

      <Segmented
        options={ZONE_OPTIONS}
        activeId={zonePerspective}
        onSelect={(id) => { setZonePerspective(id as typeof zonePerspective) }}
      />
      <ZonePanel
        title={zoneTitle}
        caption={zoneCaption}
        zones={activeZones}
        loading={loading}
        emptyMessage="No zone data for this season"
        perspective="pitcher"
      />

      <H2HPanel
        title={h2hTitle}
        stat={h2hStat}
        benchmarkAvg={benchmarkAvg}
        loading={loading}
        emptyMessage={h2hEmpty}
        emptyHint={h2hHint}
      />

      <Segmented
        options={SPLIT_OPTIONS}
        activeId={splitPerspective}
        onSelect={(id) => { setSplitPerspective(id as typeof splitPerspective) }}
      />
      <TablePanel
        title="Splits"
        meta={SEASON}
        columns={SPLIT_COLUMNS}
        rows={splitRows}
        loading={loading}
        emptyMessage="No situational splits published yet"
        emptyHint="Splits appear once the player logs enough plate appearances."
        skeletonRows={6}
      />

      <ArsenalFacedPanel
        rows={arsenalRows}
        loading={loading}
        scopeLabel={SCOPE_LABELS[globalScope]}
        showHandednessToggle={isGame}
        handedness={handedness}
        onHandednessChange={setHandedness}
        totalPitches={arsenalTotalPitches}
      />
    </div>
  )
}
