import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ArsenalBars } from '../Canvas/ArsenalBars'
import { ZonePlot } from '../Canvas/ZonePlot'
import type { CurrentPlay, PitchArsenalItem, PlayEvent } from '../../api/types'

/** Rendered wherever the feed genuinely has no value — never a zero stand-in. */
const NO_VALUE = '—'

/** 230 + 8 gap + 140 = 378, the 390px device width minus the panel's 2 x 6px. */
const ARSENAL_WIDTH = 230
const ZONE_SIZE = 140

/** Velocity trend window: at most the last N pitches, against everything before. */
const RECENT_PITCHES = 10

interface StatCell {
  readonly label: string
  readonly value: string
  readonly tone?: 'good' | 'bad'
}

interface InningCount {
  readonly inning: number
  readonly pitches: number
}

interface PitcherGame {
  readonly pitches: PlayEvent[]
  readonly arsenal: PitchArsenalItem[]
  readonly strikes: number
  readonly balls: number
  readonly battersFaced: number
  readonly outs: number
  readonly byInning: readonly InningCount[]
  readonly firstPitchStrikes: number
  readonly startedPlateAppearances: number
}

/**
 * A ball in play carries NEITHER `isStrike` NOR `isBall`, so counting `isStrike`
 * alone reads ~46% on a pitcher whose real strike rate is ~63%. Folding
 * `isInPlay` in keeps strikes + balls === total pitches for every feed row.
 */
function countsAsStrike(event: PlayEvent): boolean {
  return event.details.isStrike || event.details.isInPlay
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function speedsOf(pitches: readonly PlayEvent[]): number[] {
  const speeds: number[] = []
  for (const pitch of pitches) {
    const speed = pitch.pitchData?.startSpeed
    if (speed !== undefined && Number.isFinite(speed)) speeds.push(speed)
  }
  return speeds
}

function fixed(value: number | null, digits: number, unit: string): string {
  return value === null ? NO_VALUE : `${value.toFixed(digits)}${unit}`
}

/** Outs are `X.Y` innings in every box score: 7 outs is 2.1 innings pitched. */
function inningsPitched(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

/** Groups this game's pitches on `details.type.code` into full arsenal rows. */
function buildArsenal(pitches: readonly PlayEvent[]): PitchArsenalItem[] {
  const groups = new Map<string, { description: string; speeds: number[]; count: number }>()

  for (const pitch of pitches) {
    const type = pitch.details.type
    if (type === undefined) continue
    const group = groups.get(type.code) ?? { description: type.description, speeds: [], count: 0 }
    group.count += 1
    const speed = pitch.pitchData?.startSpeed
    if (speed !== undefined && Number.isFinite(speed)) group.speeds.push(speed)
    groups.set(type.code, group)
  }

  const totalPitches = pitches.length
  return [...groups].map(([code, group]) => ({
    type: { code, description: group.description },
    // Already a percent (0-100) — ArsenalBars divides by 100 itself.
    percentage: totalPitches === 0 ? 0 : (group.count / totalPitches) * 100,
    count: group.count,
    totalPitches,
    averageSpeed: mean(group.speeds) ?? 0,
  }))
}

/**
 * `count.outs` on a completed play is the out total AFTER it, so the outs a
 * pitcher recorded are the increments across the half-innings he worked. The
 * in-progress play reports pre-play outs, which yields a zero increment.
 */
function countOuts(plays: readonly CurrentPlay[], pitcherId: number): number {
  const priorOuts = new Map<string, number>()
  let outs = 0

  for (const play of plays) {
    const half = `${play.about.inning}-${play.about.halfInning}`
    const before = priorOuts.get(half) ?? 0
    if (play.matchup.pitcher.id === pitcherId) outs += Math.max(0, play.count.outs - before)
    priorOuts.set(half, play.count.outs)
  }

  return outs
}

/**
 * Everything the tab shows, from `allPlays` alone — no network access. Plays are
 * bounded by the current at-bat index so this stays consistent with LiveAtBat's
 * P-Count, which derives its pitch total the same way.
 */
function derivePitcherGame(allPlays: readonly CurrentPlay[], current: CurrentPlay): PitcherGame {
  const pitcherId = current.matchup.pitcher.id
  const soFar = allPlays.filter((play) => play.about.atBatIndex <= current.about.atBatIndex)
  const mine = soFar.filter((play) => play.matchup.pitcher.id === pitcherId)

  const pitches = mine.flatMap((play) => play.playEvents.filter((event) => event.isPitch))
  const strikes = pitches.filter(countsAsStrike).length
  const balls = pitches.length - strikes

  const inningTotals = new Map<number, number>()
  let firstPitchStrikes = 0
  let startedPlateAppearances = 0

  for (const play of mine) {
    const thrown = play.playEvents.filter((event) => event.isPitch)
    if (thrown.length === 0) continue
    inningTotals.set(play.about.inning, (inningTotals.get(play.about.inning) ?? 0) + thrown.length)
    startedPlateAppearances += 1
    if (countsAsStrike(thrown[0])) firstPitchStrikes += 1
  }

  return {
    pitches,
    arsenal: buildArsenal(pitches),
    strikes,
    balls,
    battersFaced: new Set(mine.map((play) => play.matchup.batter.id)).size,
    outs: countOuts(soFar, pitcherId),
    byInning: [...inningTotals]
      .map(([inning, thrown]) => ({ inning, pitches: thrown }))
      .sort((a, b) => a.inning - b.inning),
    firstPitchStrikes,
    startedPlateAppearances,
  }
}

function StatCells({ cells }: { readonly cells: readonly StatCell[] }): ReactElement {
  return (
    <>
      {cells.map((cell) => (
        <div key={cell.label} className="stat-row">
          <span className="stat-label">{cell.label}</span>
          <span className={cell.tone === undefined ? 'stat-value' : `stat-value ${cell.tone}`}>
            {cell.value}
          </span>
        </div>
      ))}
    </>
  )
}

/**
 * "Pitcher Game" sub-tab body. Renders as a fragment: LiveGameTab owns the
 * surrounding `.sub-tab-panel`, which is the screen's scroll owner. Rows size
 * to their content — there is no vertical budget to spend (DESIGN.md §6.3).
 */
export function PitcherGameSubTab(): ReactElement {
  const liveFeed = useGameStore((s) => s.liveFeed)
  const currentPlay = useGameStore((s) => s.currentPlay)

  const matchup = currentPlay?.matchup
  if (liveFeed === null || currentPlay === null || matchup === undefined) {
    return <div className="no-pitch">No pitcher active</div>
  }

  const game = derivePitcherGame(liveFeed.liveData.plays.allPlays, currentPlay)
  const total = game.pitches.length
  const speeds = speedsOf(game.pitches)
  // Half the outing while short, capped at RECENT_PITCHES — a fixed window would
  // leave the trend blank until a reliever passed his tenth pitch.
  const trendWindow = Math.min(RECENT_PITCHES, Math.floor(speeds.length / 2))
  const recentVelo = trendWindow === 0 ? null : mean(speeds.slice(-trendWindow))
  const earlierVelo = trendWindow === 0 ? null : mean(speeds.slice(0, speeds.length - trendWindow))
  const veloDelta = recentVelo === null || earlierVelo === null ? null : recentVelo - earlierVelo

  const strikePct = total === 0 ? null : (game.strikes / total) * 100
  const firstPitchPct =
    game.startedPlateAppearances === 0
      ? null
      : (game.firstPitchStrikes / game.startedPlateAppearances) * 100
  const perBatter = game.battersFaced === 0 ? null : total / game.battersFaced

  const workloadCells: readonly StatCell[] = [
    { label: 'Pitches', value: String(total) },
    { label: 'Strikes', value: String(game.strikes) },
    { label: 'Balls', value: String(game.balls) },
    {
      label: 'Strike %',
      value: fixed(strikePct, 1, '%'),
      tone: strikePct !== null && strikePct >= 60 ? 'good' : 'bad',
    },
    { label: 'Batters', value: String(game.battersFaced) },
    { label: 'IP', value: inningsPitched(game.outs) },
  ]

  const efficiencyCells: readonly StatCell[] = [
    { label: 'P / Batter', value: fixed(perBatter, 1, '') },
    { label: 'Avg Velo', value: fixed(mean(speeds), 1, ' mph') },
    { label: 'Max Velo', value: fixed(speeds.length === 0 ? null : Math.max(...speeds), 1, ' mph') },
    { label: '1st-P Strike', value: fixed(firstPitchPct, 1, '%') },
    { label: `Last ${trendWindow}`, value: fixed(recentVelo, 1, ' mph') },
    {
      label: 'Velo Trend',
      value: veloDelta === null ? NO_VALUE : `${veloDelta >= 0 ? '+' : ''}${veloDelta.toFixed(1)}`,
      tone: veloDelta === null || veloDelta >= -0.5 ? 'good' : 'bad',
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
        <div className="arsenal-canvas">
          <ArsenalBars
            arsenal={[...game.arsenal].sort((a, b) => b.percentage - a.percentage).slice(0, 5)}
            width={ARSENAL_WIDTH}
          />
        </div>
        <div className="canvas-slot" style={{ flex: `0 0 ${ZONE_SIZE}px` }}>
          <ZonePlot pitches={game.pitches} size={ZONE_SIZE} />
        </div>
      </div>

      <div className="panel-row">
        <div className="section-title">
          <span>{matchup.pitcher.fullName}</span>
          <span>
            {matchup.pitchHand.code}HP · {total} P
          </span>
        </div>
        <div className="stat-grid">
          <StatCells cells={workloadCells} />
        </div>
        <div className="section-title">
          <span>By Inning</span>
          <span>{inningsPitched(game.outs)} IP</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          {game.byInning.map((entry) => (
            <span
              key={entry.inning}
              className="sequence-pitch"
              style={{ flex: '0 0 auto', flexDirection: 'row', gap: 'var(--sp-2)' }}
            >
              <span className="seq-type">{entry.inning}</span>
              <span className="seq-velo">{entry.pitches}P</span>
            </span>
          ))}
        </div>
      </div>

      <div className="panel-row">
        <div className="section-title">
          <span>Efficiency</span>
          <span>{game.pitches.length === 0 ? NO_VALUE : `${speeds.length} tracked`}</span>
        </div>
        <div className="stat-grid">
          <StatCells cells={efficiencyCells} />
        </div>
      </div>
    </>
  )
}
