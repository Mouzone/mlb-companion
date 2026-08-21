import type { ReactElement } from 'react'
import { useState } from 'react'
import { BattingSubTab } from './BattingSubTab'
import { MatchupSubTab } from './MatchupSubTab'
import { PitchingSubTab } from './PitchingSubTab'
import { Segmented, SubTabNav } from '../ui'
import type { StatSplit } from '../../api/types'
import type { ActiveBenchmarkCohorts, PitcherRole } from '../../api/benchmarks'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useStatBenchmarks } from '../../hooks/useStatBenchmarks'
import { useCareerMatchupStats } from '../../hooks/useCareerMatchupStats'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import { PARK_FACTORS } from '../../utils/leagueConstants'
import type { Cell, PlatoonBlock } from './PvbCards'
import {
  batterCareerCells,
  batterSeasonCells,
  extraStat,
  pitcherCareerCells,
  pitcherSeasonCells,
  platoonCells,
} from './PvbCards'
import { PvbCard } from './PvbCard'
import { splitCode, whole } from './PvbShared'
import { parseStat } from '../../utils/sabermetrics'
import { benchmarkBatterCells, benchmarkPitcherCells } from './PvbBenchmarks'

type SubTab = 'matchup' | 'pitching' | 'batting'
type Scope = 'season' | 'career'

/**
 * Pitcher-first mirrors the card row above. `matchup` trails because its
 * head-to-head history is the least used panel and the most expensive to fetch.
 */
const SUB_TABS: readonly { readonly id: SubTab; readonly label: string }[] = [
  { id: 'pitching', label: 'Pitching' },
  { id: 'batting', label: 'Batting' },
  { id: 'matchup', label: 'Matchup' },
]

const SCOPES = [
  { id: 'season', label: 'Season' },
  { id: 'career', label: 'Career' },
]

/** SubTabNav and Segmented both report a plain `string`; these narrow it back. */
function isSubTab(value: string): value is SubTab {
  return SUB_TABS.some((tab) => tab.id === value)
}

function isScope(value: string): value is Scope {
  return value === 'season' || value === 'career'
}

function renderSubTab(tab: SubTab): ReactElement {
  switch (tab) {
    case 'matchup':
      return <MatchupSubTab />
    case 'pitching':
      return <PitchingSubTab />
    case 'batting':
      return <BattingSubTab />
  }
}

function findSplit(splits: readonly StatSplit[], code: string): StatSplit | null {
  return splits.find((split) => splitCode(split) === code) ?? null
}

/** A switch-hitter takes the side opposite the arm he is facing. */
function effectiveSide(batSide: 'L' | 'R' | 'S', pitchHand: 'L' | 'R'): 'L' | 'R' {
  if (batSide === 'S') return pitchHand === 'L' ? 'R' : 'L'
  return batSide
}

function strapOf(prefix: string, workload: string | null, games: number | null): string {
  return [prefix, workload, games === null ? null : `${whole(games)} G`]
    .filter((part) => part !== null && part !== '')
    .join(' \u00b7 ')
}

function roleOfPitcher(
  pitcherId: number | null,
  cohorts: ActiveBenchmarkCohorts | null,
): PitcherRole | null {
  if (pitcherId === null || cohorts === null) return null
  if (cohorts.starters.some(({ playerId }) => playerId === pitcherId)) return 'starter'
  if (cohorts.relievers.some(({ playerId }) => playerId === pitcherId)) return 'reliever'
  return null
}

export function PitcherVsBatter(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const activeSubTab = useGameStore((s) => s.activeSubTab)
  const setActiveSubTab = useGameStore((s) => s.setActiveSubTab)

  const [scope, setScope] = useState<Scope>('season')
  const { cohorts: benchmarkCohorts, loading: benchmarksLoading } = useStatBenchmarks(scope)

  const matchup = currentPlay?.matchup ?? null
  const batterId = matchup?.batter.id ?? null
  const pitcher = derivePitcher(currentPlay, liveFeed, selectedGame)
  const pitcherId = pitcher?.id ?? null
  const { pitcher: pitcherCareer, batter: batterCareer } = useCareerMatchupStats(
    pitcherId,
    batterId,
  )

  const { batterSeason, pitcherSeason, batterSplits, pitcherSplits, pitcherLoading, batterLoading } = usePlayerStats(
    batterId,
    pitcherId,
  )

  const parkFactor = PARK_FACTORS[selectedGame?.teams.home.team.abbreviation ?? ''] ?? 1.0
  const season = scope === 'season'
  const scopeLabel = season ? 'Season' : 'Career'

  const hand = matchup?.pitchHand.code ?? 'R'
  const side = effectiveSide(matchup?.batSide.code ?? 'R', hand)

  const rawPitcherCells: Cell[] = season
    ? pitcherSeason
      ? pitcherSeasonCells(pitcherSeason, parkFactor)
      : []
    : pitcherCareer
      ? pitcherCareerCells(pitcherCareer)
      : []
  const rawBatterCells: Cell[] = season
    ? batterSeason
      ? batterSeasonCells(batterSeason)
      : []
    : batterCareer
      ? batterCareerCells(batterCareer)
      : []

  const pitcherRole = roleOfPitcher(pitcherId, benchmarkCohorts)
  const pitcherCells: Cell[] =
    pitcherRole !== null && pitcherSeason !== null && benchmarkCohorts?.scope === 'season'
      ? benchmarkPitcherCells(rawPitcherCells, pitcherSeason, {
          scope: 'season',
          role: pitcherRole,
          cohort:
            pitcherRole === 'starter' ? benchmarkCohorts.starters : benchmarkCohorts.relievers,
        })
      : pitcherRole !== null && pitcherCareer !== null && benchmarkCohorts?.scope === 'career'
        ? benchmarkPitcherCells(rawPitcherCells, pitcherCareer, {
            scope: 'career',
            role: pitcherRole,
            cohort:
              pitcherRole === 'starter' ? benchmarkCohorts.starters : benchmarkCohorts.relievers,
          })
        : rawPitcherCells
  const batterCells: Cell[] =
    batterSeason !== null && benchmarkCohorts?.scope === 'season'
      ? benchmarkBatterCells(rawBatterCells, batterSeason, {
          scope: 'season',
          cohort: benchmarkCohorts.batters,
        })
      : batterCareer !== null && benchmarkCohorts?.scope === 'career'
        ? benchmarkBatterCells(rawBatterCells, batterCareer, {
            scope: 'career',
            cohort: benchmarkCohorts.batters,
          })
        : rawBatterCells

  // Both platoon blocks render or neither does, so the two cards stay exactly
  // the same height under `align-items: stretch` and neither grows a void.
  const pitcherSplit = season ? findSplit(pitcherSplits, side === 'L' ? 'vl' : 'vr') : null
  const batterSplit = season ? findSplit(batterSplits, hand === 'L' ? 'vl' : 'vr') : null
  const paired = pitcherSplit !== null && batterSplit !== null

  const pitcherPlatoon: PlatoonBlock | null =
    paired && pitcherSplit !== null && pitcherSeason !== null
      ? {
          title: `vs ${side}HB`,
          cells: platoonCells(
            pitcherSplit,
            parseStat(pitcherSeason.avg),
            extraStat(pitcherSeason, 'ops'),
            true,
            'BF',
          ),
        }
      : null
  const batterPlatoon: PlatoonBlock | null =
    paired && batterSplit !== null && batterSeason !== null
      ? {
          title: `vs ${hand}HP`,
          cells: platoonCells(
            batterSplit,
            parseStat(batterSeason.avg),
            parseStat(batterSeason.ops),
            false,
            'PA',
          ),
        }
      : null

  const pitcherStat = season ? pitcherSeason : pitcherCareer
  const batterStat = season ? batterSeason : batterCareer

  return (
    <div className="tab-content">
      <div className="pvb-cards-wrap">
        <div className="pvb-scope">
          <Segmented
            options={SCOPES}
            activeId={scope}
            onSelect={(id) => {
              if (isScope(id)) setScope(id)
            }}
          />
        </div>
        <div className="pvb-cards">
          <PvbCard
            personId={pitcherId ?? 0}
            name={pitcher?.fullName ?? 'Pitcher TBD'}
            strap={strapOf(
              `${hand}HP`,
              pitcherStat === null ? null : `${pitcherStat.inningsPitched} IP`,
              pitcherStat?.gamesPlayed ?? null,
            )}
            scopeLabel={scopeLabel}
            role="pitcher"
            cells={pitcherCells}
            platoon={pitcherPlatoon}
            loading={pitcherLoading || benchmarksLoading}
          />
          <PvbCard
            personId={batterId ?? 0}
            name={matchup?.batter.fullName ?? 'Batter TBD'}
            strap={strapOf(
              `${side}HB`,
              batterStat === null ? null : `${whole(extraStat(batterStat, 'plateAppearances'))} PA`,
              batterStat === null ? null : extraStat(batterStat, 'gamesPlayed'),
            )}
            scopeLabel={scopeLabel}
            role="batter"
            cells={batterCells}
            platoon={batterPlatoon}
            loading={batterLoading || benchmarksLoading}
          />
        </div>
      </div>

      <SubTabNav
        tabs={SUB_TABS}
        activeId={activeSubTab}
        onSelect={(id) => {
          if (isSubTab(id)) setActiveSubTab(id)
        }}
      />

      <div className="pvb-panel">{renderSubTab(activeSubTab)}</div>
    </div>
  )
}
