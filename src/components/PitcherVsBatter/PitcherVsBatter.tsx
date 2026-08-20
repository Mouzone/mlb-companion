import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { fetchCareerStats } from '../../api/mlb'
import { BattingSubTab } from './BattingSubTab'
import { MatchupSubTab } from './MatchupSubTab'
import { PitchingSubTab } from './PitchingSubTab'
import { Segmented, SubTabNav } from '../ui'
import type { CareerBatterStat, CareerPitcherStat, StatSplit } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { PARK_FACTORS } from '../../utils/leagueConstants'
import type { Cell, PlatoonBlock } from './PvbCards'
import {
  PvbCard,
  batterCareerCells,
  batterSeasonCells,
  extraStat,
  pitcherCareerCells,
  pitcherSeasonCells,
  platoonCells,
} from './PvbCards'
import { splitCode, whole } from './PvbShared'
import { parseStat } from '../../utils/sabermetrics'

type SubTab = 'matchup' | 'pitching' | 'batting'
type Scope = 'season' | 'career'

const SUB_TABS: readonly { readonly id: SubTab; readonly label: string }[] = [
  { id: 'matchup', label: 'Matchup' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'batting', label: 'Batting' },
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

/** Career responses share no discriminant field, so narrow on a pitching-only key. */
function isCareerPitcher(stat: CareerBatterStat | CareerPitcherStat): stat is CareerPitcherStat {
  return 'era' in stat
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

export function PitcherVsBatter(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const activeSubTab = useGameStore((s) => s.activeSubTab)
  const setActiveSubTab = useGameStore((s) => s.setActiveSubTab)

  const [pitcherCareer, setPitcherCareer] = useState<CareerPitcherStat | null>(null)
  const [batterCareer, setBatterCareer] = useState<CareerBatterStat | null>(null)
  const [scope, setScope] = useState<Scope>('season')

  const matchup = currentPlay?.matchup ?? null
  const batterId = matchup?.batter.id ?? null
  const probable =
    selectedGame?.teams.home.probablePitcher ?? selectedGame?.teams.away.probablePitcher ?? null
  const pitcher = matchup?.pitcher ?? probable ?? null
  const pitcherId = pitcher?.id ?? null

  const { batterSeason, pitcherSeason, batterSplits, pitcherSplits, loading } = usePlayerStats(
    batterId,
    pitcherId,
  )

  useEffect(() => {
    let cancelled = false
    if (pitcherId === null) {
      setPitcherCareer(null)
      return
    }
    fetchCareerStats(pitcherId, 'pitching')
      .then((stat) => {
        if (cancelled) return
        setPitcherCareer(stat !== null && isCareerPitcher(stat) ? stat : null)
      })
      .catch(() => {
        if (!cancelled) setPitcherCareer(null)
      })
    return () => {
      cancelled = true
    }
  }, [pitcherId])

  useEffect(() => {
    let cancelled = false
    if (batterId === null) {
      setBatterCareer(null)
      return
    }
    fetchCareerStats(batterId, 'hitting')
      .then((stat) => {
        if (cancelled) return
        setBatterCareer(stat !== null && !isCareerPitcher(stat) ? stat : null)
      })
      .catch(() => {
        if (!cancelled) setBatterCareer(null)
      })
    return () => {
      cancelled = true
    }
  }, [batterId])

  const parkFactor = PARK_FACTORS[selectedGame?.teams.home.team.abbreviation ?? ''] ?? 1.0
  const season = scope === 'season'
  const scopeLabel = season ? 'Season' : 'Career'

  const hand = matchup?.pitchHand.code ?? 'R'
  const side = effectiveSide(matchup?.batSide.code ?? 'R', hand)

  const pitcherCells: Cell[] = season
    ? pitcherSeason
      ? pitcherSeasonCells(pitcherSeason, parkFactor)
      : []
    : pitcherCareer
      ? pitcherCareerCells(pitcherCareer)
      : []
  const batterCells: Cell[] = season
    ? batterSeason
      ? batterSeasonCells(batterSeason)
      : []
    : batterCareer
      ? batterCareerCells(batterCareer)
      : []

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
            loading={loading}
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
            loading={loading}
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
