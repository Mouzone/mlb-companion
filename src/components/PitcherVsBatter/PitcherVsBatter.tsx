import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { fetchCareerStats } from '../../api/mlb'
import { BattingSubTab } from './BattingSubTab'
import { MatchupSubTab } from './MatchupSubTab'
import { PitchingSubTab } from './PitchingSubTab'
import type {
  CareerBatterStat,
  CareerPitcherStat,
  PitcherSeasonStat,
  SavantBattedBall,
  SeasonStat,
} from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import {
  LEAGUE_ERA,
  LEAGUE_R_PER_PA,
  LEAGUE_WOBA,
  PARK_FACTORS,
  WOBA_SCALE,
} from '../../utils/leagueConstants'
import {
  computeBBpct,
  computeERAplus,
  computeFIP,
  computeGBpct,
  computeHR9,
  computeISO,
  computeKpct,
  computeWRCplus,
  ipToDecimal,
  parseStat,
} from '../../utils/sabermetrics'

type SubTab = 'matchup' | 'pitching' | 'batting'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'matchup', label: 'Matchup' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'batting', label: 'Batting' },
]

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

interface StatCell {
  label: string
  value: string
}

interface CardSlide {
  key: string
  role: 'pitcher' | 'batter'
  name: string
  scope: 'Season' | 'Career'
  stats: StatCell[]
}

/** Career responses share no discriminant field, so narrow on a pitching-only key. */
function isCareerPitcher(
  stat: CareerBatterStat | CareerPitcherStat,
): stat is CareerPitcherStat {
  return 'era' in stat
}

function fmt(value: number | null, digits: number): string {
  return value === null ? '—' : value.toFixed(digits)
}

function fmtRaw(value: string | undefined): string {
  const parsed = parseStat(value ?? '')
  return parsed === null ? '—' : (value ?? '—')
}

/** Per-nine rates are only needed here, so they stay local rather than widening sabermetrics.ts. */
function perNine(count: number | undefined, inningsPitched: string | undefined): number | null {
  if (count === undefined || inningsPitched === undefined) return null
  const innings = ipToDecimal(inningsPitched)
  if (!Number.isFinite(innings) || innings === 0) return null
  return Number(((count / innings) * 9).toFixed(2))
}

/** Savant reports wOBA per batted ball; the season rate is the ratio of the summed columns. */
function savantWoba(rows: SavantBattedBall[]): number | null {
  let numerator = 0
  let denominator = 0
  for (const row of rows) {
    const value = parseStat(row.woba_value ?? '')
    const denom = parseStat(row.woba_denom ?? '')
    if (value !== null) numerator += value
    if (denom !== null) denominator += denom
  }
  if (denominator === 0) return null
  return Number((numerator / denominator).toFixed(3))
}

function pitcherSeasonStats(stat: PitcherSeasonStat, parkFactor: number): StatCell[] {
  const innings = ipToDecimal(stat.inningsPitched)
  return [
    { label: 'ERA', value: fmtRaw(stat.era) },
    { label: 'WHIP', value: fmtRaw(stat.whip) },
    {
      label: 'FIP',
      value: fmt(
        computeFIP(stat.homeRuns, stat.baseOnBalls, stat.hitBatsmen ?? 0, stat.strikeOuts, innings),
        2,
      ),
    },
    { label: 'ERA+', value: fmt(computeERAplus(parseStat(stat.era), LEAGUE_ERA, parkFactor), 0) },
    { label: 'K/9', value: fmt(perNine(stat.strikeOuts, stat.inningsPitched), 2) },
    { label: 'BB/9', value: fmt(perNine(stat.baseOnBalls, stat.inningsPitched), 2) },
    { label: 'HR/9', value: fmt(computeHR9(stat.homeRuns, innings), 2) },
    { label: 'K%', value: fmt(computeKpct(stat.strikeOuts, stat.battersFaced ?? null), 1) },
    { label: 'BB%', value: fmt(computeBBpct(stat.baseOnBalls, stat.battersFaced ?? null), 1) },
    {
      label: 'GB%',
      value: fmt(computeGBpct(stat.groundBalls ?? null, stat.totalBattedBalls ?? null), 1),
    },
    { label: 'OPP AVG', value: fmtRaw(stat.avg) },
    { label: 'G', value: String(stat.gamesPlayed) },
  ]
}

/** Career ERA+ needs a park-adjusted career ERA the API does not expose, so it renders as em dash. */
function pitcherCareerStats(stat: CareerPitcherStat): StatCell[] {
  const innings = ipToDecimal(stat.inningsPitched)
  return [
    { label: 'ERA', value: fmtRaw(stat.era) },
    { label: 'WHIP', value: fmtRaw(stat.whip) },
    {
      label: 'FIP',
      value: fmt(
        computeFIP(stat.homeRuns, stat.baseOnBalls, stat.hitBatsmen, stat.strikeOuts, innings),
        2,
      ),
    },
    { label: 'K%', value: fmt(computeKpct(stat.strikeOuts, stat.battersFaced ?? null), 1) },
    { label: 'BB%', value: fmt(computeBBpct(stat.baseOnBalls, stat.battersFaced ?? null), 1) },
    { label: 'HR/9', value: fmt(computeHR9(stat.homeRuns, innings), 2) },
    { label: 'K/9', value: fmt(perNine(stat.strikeOuts, stat.inningsPitched), 2) },
    { label: 'BB/9', value: fmt(perNine(stat.baseOnBalls, stat.inningsPitched), 2) },
    { label: 'IP', value: fmtRaw(stat.inningsPitched) },
    { label: 'ERA+', value: '—' },
    { label: 'OPP AVG', value: fmtRaw(stat.avg) },
    { label: 'G', value: String(stat.gamesPlayed) },
  ]
}

function batterSeasonStats(
  stat: SeasonStat,
  savant: SavantBattedBall[],
  parkFactor: number,
): StatCell[] {
  const woba = savantWoba(savant)
  return [
    { label: 'AVG', value: fmtRaw(stat.avg) },
    { label: 'OBP', value: fmtRaw(stat.obp) },
    { label: 'SLG', value: fmtRaw(stat.slg) },
    { label: 'OPS', value: fmtRaw(stat.ops) },
    {
      label: 'wRC+',
      value: fmt(computeWRCplus(woba, LEAGUE_WOBA, WOBA_SCALE, LEAGUE_R_PER_PA, parkFactor), 0),
    },
    { label: 'ISO', value: fmt(computeISO(parseStat(stat.avg), parseStat(stat.slg)), 3) },
    { label: 'K%', value: fmt(computeKpct(stat.strikeOuts, stat.plateAppearances), 1) },
    { label: 'BB%', value: fmt(computeBBpct(stat.baseOnBalls, stat.plateAppearances), 1) },
    { label: 'wOBA', value: fmt(woba, 3) },
    { label: 'BABIP', value: fmt(parseStat(stat.babip ?? ''), 3) },
    { label: 'HR', value: String(stat.homeRuns) },
    { label: 'PA', value: String(stat.plateAppearances) },
  ]
}

/** Career wRC+ needs a career wOBA; the Savant CSV is single-season only, so it renders as em dash. */
function batterCareerStats(stat: CareerBatterStat): StatCell[] {
  return [
    { label: 'AVG', value: fmtRaw(stat.avg) },
    { label: 'OBP', value: fmtRaw(stat.obp) },
    { label: 'SLG', value: fmtRaw(stat.slg) },
    { label: 'OPS', value: fmtRaw(stat.ops) },
    { label: 'ISO', value: fmt(computeISO(parseStat(stat.avg), parseStat(stat.slg)), 3) },
    { label: 'K%', value: fmt(computeKpct(stat.strikeOuts, stat.plateAppearances), 1) },
    { label: 'BB%', value: fmt(computeBBpct(stat.baseOnBalls, stat.plateAppearances), 1) },
    { label: 'wRC+', value: '—' },
    { label: 'HR', value: String(stat.homeRuns) },
    { label: 'RBI', value: String(stat.rbi) },
    { label: 'H', value: String(stat.hits) },
    { label: 'PA', value: String(stat.plateAppearances) },
  ]
}

export function PitcherVsBatter() {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const activeSubTab = useGameStore((s) => s.activeSubTab)
  const setActiveSubTab = useGameStore((s) => s.setActiveSubTab)

  const [pitcherCareer, setPitcherCareer] = useState<CareerPitcherStat | null>(null)
  const [batterCareer, setBatterCareer] = useState<CareerBatterStat | null>(null)
  const [activeCard, setActiveCard] = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)

  const matchup = currentPlay?.matchup ?? null
  const batterId = matchup?.batter.id ?? null
  const pitcherId =
    matchup?.pitcher.id ??
    selectedGame?.teams.home.probablePitcher?.id ??
    selectedGame?.teams.away.probablePitcher?.id ??
    null

  const { batterSeason, pitcherSeason, savantData, loading } = usePlayerStats(batterId, pitcherId)

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

  const parkAbbr = selectedGame?.teams.home.team.abbreviation ?? ''
  const parkFactor = PARK_FACTORS[parkAbbr] ?? 1.0

  const pitcherName =
    matchup?.pitcher.fullName ??
    selectedGame?.teams.home.probablePitcher?.fullName ??
    selectedGame?.teams.away.probablePitcher?.fullName ??
    'Pitcher TBD'
  const batterName = matchup?.batter.fullName ?? 'Batter TBD'

  const slides: CardSlide[] = [
    {
      key: 'pitcher-season',
      role: 'pitcher',
      name: pitcherName,
      scope: 'Season',
      stats: pitcherSeason ? pitcherSeasonStats(pitcherSeason, parkFactor) : [],
    },
    {
      key: 'pitcher-career',
      role: 'pitcher',
      name: pitcherName,
      scope: 'Career',
      stats: pitcherCareer ? pitcherCareerStats(pitcherCareer) : [],
    },
    {
      key: 'batter-season',
      role: 'batter',
      name: batterName,
      scope: 'Season',
      stats: batterSeason ? batterSeasonStats(batterSeason, savantData, parkFactor) : [],
    },
    {
      key: 'batter-career',
      role: 'batter',
      name: batterName,
      scope: 'Career',
      stats: batterCareer ? batterCareerStats(batterCareer) : [],
    },
  ]

  function handleScroll(): void {
    const strip = stripRef.current
    if (strip === null) return
    const index = Math.round(strip.scrollLeft / Math.max(strip.clientWidth, 1))
    setActiveCard(Math.min(Math.max(index, 0), slides.length - 1))
  }

  return (
    <div className="tab-content">
      <div className="pvb-cards-wrap">
        <div className="pvb-cards" ref={stripRef} onScroll={handleScroll}>
          {slides.map((slide) => (
            <div key={slide.key} className={`pvb-card ${slide.role}-card`}>
              <div className="card-title">
                <span>{slide.name}</span>
                <span className="card-scope">{slide.scope}</span>
              </div>
              {slide.stats.length > 0 ? (
                <div className="stat-grid stat-grid-3">
                  {slide.stats.map((cell) => (
                    <div key={cell.label} className="stat-row">
                      <span className="stat-label">{cell.label}</span>
                      <span className="stat-value">{cell.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="stat-row">
                  <span className="stat-label">
                    {loading ? 'Loading…' : 'No stats available'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="pvb-dots">
          {slides.map((slide, index) => (
            <span key={slide.key} className={index === activeCard ? 'active' : ''} />
          ))}
        </div>
      </div>

      <div className="sub-tab-nav">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            className={activeSubTab === tab.id ? 'active' : ''}
            onClick={() => setActiveSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pvb-panel">{renderSubTab(activeSubTab)}</div>
    </div>
  )
}
