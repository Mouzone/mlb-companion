import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { PitcherRole } from '../../api/benchmarks'
import { fetchCachedGameLog } from '../../api/playerStatsCache'
import type { GameLogEntry, PitcherSeasonStat, StatSplit, VsPlayerStat } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useStatBenchmarks } from '../../hooks/useStatBenchmarks'
import { useGameStore } from '../../store/gameStore'
import { PARK_FACTORS } from '../../utils/leagueConstants'
import { derivePitcher } from '../../utils/derivePitcher'
import { parseStat } from '../../utils/sabermetrics'
import type { DataTableRow, SegmentedOption, StatTone } from '../ui'
import { Segmented } from '../ui'
import {
  deriveBatterLine,
  derivePitcherLine,
  deriveThisGameH2H,
} from '../LiveAtBat/liveAtBatData'
import type { GameLine } from '../LiveGame/BatterGameModel'
import { buildGameLine } from '../LiveGame/BatterGameModel'
import type { PitchSplit } from '../LiveGame/GameSubTabShared'
import { fixed, inningsPitched, percent, pitchesOf, rateOf, splitPitches } from '../LiveGame/GameSubTabShared'
import type { PitcherGame } from '../LiveGame/PitcherGameModel'
import { derivePitcherGame } from '../LiveGame/PitcherGameModel'
import {
  buildGameArsenalRows,
  buildSeasonArsenalRows,
  buildSeasonBaselines,
  type HandednessFilter,
} from './ArsenalColorCoding'
import { benchmarkBatterCells, benchmarkPitcherCells } from './PvbBenchmarks'
import type { Cell } from './PvbCards'
import { batterSeasonCells, pitcherSeasonCells } from './PvbCards'
import type { MatchupSide } from './MatchupPanels'
import {
  ArsenalFacedPanel,
  H2HPanel,
  MatchupHeader,
  SPLIT_COLUMNS,
  emptySplitRow,
  splitRow,
} from './MatchupPanels'
import { TablePanel, ZonePanel } from './PvbPanels'
import { rateText, splitCode } from './PvbShared'

/** The order the face-card arrows step through; wraps at both ends. */
const SCOPE_CYCLE = ['thisGame', 'inGame', 'season'] as const

const SCOPE_LABELS: Record<(typeof SCOPE_CYCLE)[number], string> = {
  thisGame: 'This Game',
  inGame: '',
  season: 'Season',
}

const PERSPECTIVE_OPTIONS: ReadonlyArray<SegmentedOption> = [
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

function resolvePitcherRole(stat: PitcherSeasonStat): PitcherRole {
  const starts = stat.gamesStarted ?? 0
  const appearances = stat.gamesPitched ?? stat.gamesPlayed
  return starts > 0 && starts >= appearances / 2 ? 'starter' : 'reliever'
}

function buildPitcherGameCells(game: PitcherGame): Cell[] {
  const perBatter = game.battersFaced === 0 ? null : game.split.total / game.battersFaced
  return [
    { label: 'IP', value: inningsPitched(game.outs) },
    { label: 'P', value: fixed(game.split.total, 0) },
    { label: 'BF', value: fixed(game.battersFaced, 0) },
    { label: 'K', value: fixed(game.strikeouts, 0) },
    { label: 'BB', value: fixed(game.walks, 0) },
    { label: 'H', value: fixed(game.hits, 0) },
    { label: 'HR', value: fixed(game.homeRuns, 0) },
    { label: 'P/BF', value: fixed(perBatter, 1) },
  ]
}

function buildPitcherCommandCells(game: PitcherGame): Cell[] {
  const { split } = game
  const strikePct = rateOf(split.strikes, split.total)
  const strikeTone: StatTone = strikePct !== null && strikePct >= 60 ? 'positive' : 'default'
  return [
    { label: 'Strike%', value: percent(strikePct), tone: strikeTone },
    { label: 'CSW%', value: percent(rateOf(split.called + split.whiffs, split.total)) },
    { label: 'Whiff%', value: percent(rateOf(split.whiffs, split.swings)) },
    { label: '1st-P Str', value: percent(rateOf(game.firstPitchStrikes, game.startedPlateAppearances)) },
    { label: 'Zone%', value: percent(rateOf(split.inZone, split.zoned)) },
    { label: 'Chase%', value: percent(rateOf(split.chases, split.outOfZone)) },
    { label: 'Called', value: fixed(split.called, 0) },
    { label: 'SwStr', value: fixed(split.whiffs, 0) },
  ]
}

function buildBatterGameCells(line: GameLine, pitchCount: number): Cell[] {
  return [
    { label: 'PA', value: fixed(line.plateAppearances, 0) },
    { label: 'AB', value: fixed(line.atBats, 0) },
    { label: 'H', value: fixed(line.hits, 0) },
    { label: 'HR', value: fixed(line.homeRuns, 0) },
    { label: 'RBI', value: fixed(line.rbi, 0) },
    { label: 'BB', value: fixed(line.walks, 0) },
    { label: 'K', value: fixed(line.strikeouts, 0) },
    { label: 'Pitches', value: fixed(pitchCount, 0) },
  ]
}

function buildBatterDisciplineCells(split: PitchSplit): Cell[] {
  return [
    { label: 'Swing%', value: percent(rateOf(split.swings, split.total)) },
    { label: 'Whiff%', value: percent(rateOf(split.whiffs, split.swings)) },
    { label: 'Chase%', value: percent(rateOf(split.chases, split.outOfZone)) },
    { label: 'Zone%', value: percent(rateOf(split.inZone, split.zoned)) },
    { label: 'Taken%', value: percent(rateOf(split.called, split.total - split.swings)) },
    { label: 'Called', value: fixed(split.called, 0) },
    { label: 'SwStr', value: fixed(split.whiffs, 0) },
    { label: 'Foul', value: fixed(split.fouls, 0) },
  ]
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
  const matchupPerspective = useGameStore((s) => s.matchupPerspective)
  const setMatchupPerspective = useGameStore((s) => s.setMatchupPerspective)

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
    pitcherSavantPitches,
    vsPlayer,
    loading,
  } = usePlayerStats(batterId, pitcherId)

  const { cohorts } = useStatBenchmarks('season')

  const parkFactor = PARK_FACTORS[selectedGame?.teams.home.team.abbreviation ?? ''] ?? 1

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
    const isPitcherView = matchupPerspective === 'pitcher'
    const season = isPitcherView ? pitcherSeason : batterSeason
    const splits = isPitcherView ? pitcherSplits : batterSplits
    const log = isPitcherView ? pitcherLog : batterLog
    const vsLabel = isPitcherView ? 'HB' : 'HP'

    const vsLeft = findSplit(splits, 'vl')
    const vsRight = findSplit(splits, 'vr')
    const risp = findSplit(splits, 'risp')
    const home = log.filter((entry) => entry.isHome)
    const away = log.filter((entry) => !entry.isHome)

    // Fixed six rows in a fixed order. A split the side does not publish still
    // occupies its row as em dashes, so flipping perspective never changes the
    // table's height.
    return [
      season === null ? emptySplitRow('Season') : splitRow('Season', season),
      vsLeft ? splitRow(`vs L${vsLabel}`, vsLeft.stat) : emptySplitRow(`vs L${vsLabel}`),
      vsRight ? splitRow(`vs R${vsLabel}`, vsRight.stat) : emptySplitRow(`vs R${vsLabel}`),
      risp ? splitRow('RISP', risp.stat) : emptySplitRow('RISP'),
      home.length > 0 ? splitRow('Home', aggregateLog(home)) : emptySplitRow('Home'),
      away.length > 0 ? splitRow('Away', aggregateLog(away)) : emptySplitRow('Away'),
    ]
  }, [
    matchupPerspective,
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

  const isGameScope = globalScope === 'thisGame' || globalScope === 'inGame'

  const pitcherCells = useMemo<Cell[]>(() => {
    if (globalScope === 'season') {
      if (pitcherSeason === null) return []
      const cells = pitcherSeasonCells(pitcherSeason, parkFactor)
      if (cohorts === null) return cells
      const role = resolvePitcherRole(pitcherSeason)
      const cohort = role === 'starter' ? cohorts.starters : cohorts.relievers
      return benchmarkPitcherCells(cells, pitcherSeason, { scope: 'season', role, cohort })
    }
    if (liveFeed === null || currentPlay === null) return []
    const game = derivePitcherGame(liveFeed.liveData.plays.allPlays, currentPlay)
    return globalScope === 'thisGame'
      ? buildPitcherGameCells(game)
      : buildPitcherCommandCells(game)
  }, [globalScope, pitcherSeason, parkFactor, cohorts, liveFeed, currentPlay])

  const batterCells = useMemo<Cell[]>(() => {
    if (globalScope === 'season') {
      if (batterSeason === null) return []
      const cells = batterSeasonCells(batterSeason)
      if (cohorts === null) return cells
      return benchmarkBatterCells(cells, batterSeason, { scope: 'season', cohort: cohorts.batters })
    }
    if (liveFeed === null || currentPlay === null || batterId === null) return []
    const plays = liveFeed.liveData.plays.allPlays
    const batterPlays = plays.filter((play) => play.matchup.batter.id === batterId)
    if (globalScope === 'thisGame') {
      const completed = batterPlays.filter((play) => play.result.event !== '')
      const line = buildGameLine(completed)
      const pitchCount = splitPitches(pitchesOf(batterPlays)).total
      return buildBatterGameCells(line, pitchCount)
    }
    const split = splitPitches(pitchesOf(batterPlays))
    return buildBatterDisciplineCells(split)
  }, [globalScope, batterSeason, cohorts, liveFeed, currentPlay, batterId])

  const seasonBaselines = useMemo(
    () => buildSeasonBaselines(pitcherSavantPitches),
    [pitcherSavantPitches],
  )

  const arsenalRows = useMemo(() => {
    if (isGameScope) {
      if (liveFeed === null || pitcherId === null) {
        return [] as ReturnType<typeof buildGameArsenalRows>
      }
      return buildGameArsenalRows(
        gameFeedPitches,
        liveFeed.liveData.plays.allPlays,
        liveFeed,
        pitcherId,
        handedness,
        seasonBaselines,
      )
    }
    return buildSeasonArsenalRows(pitchArsenal, pitcherSavantPitches)
  }, [isGameScope, gameFeedPitches, liveFeed, pitcherId, handedness, pitchArsenal, pitcherSavantPitches, seasonBaselines])

  const arsenalTotalPitches = useMemo(() => {
    if (isGameScope) return arsenalRows.reduce((sum, row) => sum + row.count, 0)
    return pitchArsenal[0]?.totalPitches ?? 0
  }, [isGameScope, arsenalRows, pitchArsenal])

  const pitcherLine = isGameScope
    ? gameLines.pitcher === ''
      ? 'No pitches thrown yet'
      : gameLines.pitcher
    : pitcherSeason === null
      ? 'No season line published'
      : `${rateText(pitcherSeason.era)} ERA \u00b7 ${rateText(pitcherSeason.whip)} WHIP \u00b7 ${pitcherSeason.inningsPitched} IP`

  const batterLine = isGameScope
    ? gameLines.batter === ''
      ? 'No plate appearances yet'
      : gameLines.batter
    : batterSeason === null
      ? 'No season line published'
      : `${rateText(batterSeason.avg)} AVG \u00b7 ${rateText(batterSeason.ops)} OPS \u00b7 ${String(batterSeason.homeRuns)} HR`

  const pitcherSide: MatchupSide = {
    personId: pitcherId ?? 0,
    name: pitcher?.fullName ?? 'Pitcher TBD',
    role: isGameScope ? `${hand}HP \u00b7 This Game` : `${hand}HP \u00b7 ${SEASON}`,
    line: pitcherLine,
    cells: pitcherCells,
  }

  const batterSide: MatchupSide = {
    personId: batterId ?? 0,
    name: batter?.fullName ?? 'Batter TBD',
    role: isGameScope ? `${side}HB \u00b7 This Game` : `${side}HB \u00b7 ${SEASON}`,
    line: batterLine,
    cells: batterCells,
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

  const h2hStat = isGameScope ? thisGameH2H : vsPlayer
  const h2hTitle = isGameScope ? 'This Game H2H' : 'Season H2H'
  const h2hEmpty = isGameScope ? 'No meetings in this game yet' : 'No meetings this season'
  const h2hHint = isGameScope
    ? 'H2H updates as the batter faces this pitcher.'
    : 'Season totals cover every meeting this year.'

  const activeZones = matchupPerspective === 'pitcher' ? pitcherHotCold : batterHotCold
  const zoneTitle = matchupPerspective === 'pitcher' ? 'Pitcher Zones' : 'Batter Zones'
  const zoneCaption =
    matchupPerspective === 'pitcher'
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

      <H2HPanel
        title={h2hTitle}
        stat={h2hStat}
        benchmarkAvg={benchmarkAvg}
        loading={loading}
        emptyMessage={h2hEmpty}
        emptyHint={h2hHint}
      />

      <Segmented
        options={PERSPECTIVE_OPTIONS}
        activeId={matchupPerspective}
        onSelect={(id) => { setMatchupPerspective(id as typeof matchupPerspective) }}
      />
      <ZonePanel
        title={zoneTitle}
        caption={zoneCaption}
        zones={activeZones}
        loading={loading}
        emptyMessage="No zone data for this season"
        perspective="pitcher"
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
        showHandednessToggle={isGameScope}
        handedness={handedness}
        onHandednessChange={setHandedness}
        totalPitches={arsenalTotalPitches}
      />
    </div>
  )
}
