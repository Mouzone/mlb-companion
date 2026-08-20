import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZonePlot } from '../Canvas/ZonePlot'
import type { CurrentPlay, PlayEvent, SavantGamePitch } from '../../api/types'

// allow: SIZE_OK — 267 pure LOC, of which 24 are the two pure lookup tables below
// and ~120 are a single flat render tree whose sections are budgeted against one
// fixed 679px box. Splitting the tree would hide that budget across two files.

const PITCH_TYPE_NAMES: Record<string, string> = {
  FF: '4-Seam',
  SI: 'Sinker',
  FC: 'Cutter',
  SL: 'Slider',
  ST: 'Sweeper',
  CU: 'Curve',
  KC: 'Knuckle Curve',
  CH: 'Change',
  FS: 'Splitter',
  KN: 'Knuckle',
  FO: 'Forkball',
  SC: 'Screwball',
  EP: 'Eephus',
}

const CALL_NAMES: Record<string, string> = {
  B: 'Ball',
  C: 'Called Strike',
  S: 'Swinging Strike',
  F: 'Foul',
  X: 'In Play',
  E: 'In Play (Error)',
  H: 'Hit By Pitch',
}

/** ZonePlot draws its legend inside the square, and 172 is its legend threshold. */
const ZONE_PLOT_SIZE = 172

/** Rendered wherever the feed genuinely has no value — never a zero stand-in. */
const NO_VALUE = '—'

const ORDINALS: readonly string[] = ['1st', '2nd', '3rd', '4th', '5th', '6th']

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`
}

function fixed(value: number | undefined, digits: number, unit: string): string {
  return value === undefined ? NO_VALUE : `${value.toFixed(digits)}${unit}`
}

/**
 * The live feed ships a per-pitch UUID (`playId`) that the frozen PlayEvent type
 * does not declare. Read it defensively rather than widening the frozen type.
 */
function playIdOf(event: PlayEvent): string | null {
  const { playId } = event as PlayEvent & { playId?: unknown }
  return typeof playId === 'string' ? playId : null
}

type AvgSpeedEntry = NonNullable<SavantGamePitch['avg_pitch_speed']>[number]

/** `avg_bat_speed` exists on the Savant gf feed but not on the frozen row type. */
function avgBatSpeedOf(entry: AvgSpeedEntry): string | null {
  const { avg_bat_speed: raw } = entry as AvgSpeedEntry & { avg_bat_speed?: unknown }
  return typeof raw === 'string' ? raw : null
}

/** The gf feed uses '--' as its null sentinel, which bare Number() turns into NaN. */
function finiteOrNull(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

interface BatSpeedReading {
  mph: number | null
  isGameAverage: boolean
}

/**
 * Joins the Savant gf row to the live-feed pitch on `play_id` ALONE. A composite
 * game_pk + at-bat + pitch-number key cannot work: the live feed exposes a
 * 0-based `about.atBatIndex` while Savant numbers at-bats from 1, so every row
 * would silently mismatch by one at-bat.
 */
function readBatSpeed(event: PlayEvent | undefined, rows: SavantGamePitch[]): BatSpeedReading {
  const playId = event === undefined ? null : playIdOf(event)
  if (playId !== null) {
    const match = rows.find((row) => row.play_id === playId)
    if (match !== undefined && match.batSpeed !== null) {
      return { mph: match.batSpeed, isGameAverage: false }
    }
  }

  for (const row of rows) {
    const overall = row.avg_pitch_speed?.find((entry) => entry.pitch_type === 'ALL')
    if (overall === undefined) continue
    const parsed = finiteOrNull(avgBatSpeedOf(overall))
    if (parsed !== null) return { mph: parsed, isGameAverage: true }
  }

  return { mph: null, isGameAverage: false }
}

interface PitcherPace {
  pitchCount: number
  timeThroughOrder: number
}

/** Pitch count and times-through-order for the current pitcher, as of this at-bat. */
function derivePace(allPlays: CurrentPlay[], current: CurrentPlay): PitcherPace {
  const pitcherId = current.matchup.pitcher.id
  const batterId = current.matchup.batter.id
  const currentIndex = current.about.atBatIndex

  let pitchCount = 0
  let priorMeetings = 0

  for (const play of allPlays) {
    if (play.matchup.pitcher.id !== pitcherId) continue
    if (play.about.atBatIndex <= currentIndex) {
      pitchCount += play.playEvents.filter((event) => event.isPitch).length
    }
    if (play.matchup.batter.id === batterId && play.about.atBatIndex < currentIndex) {
      priorMeetings += 1
    }
  }

  return { pitchCount, timeThroughOrder: priorMeetings + 1 }
}

/** Same-handed favours the pitcher; opposite hands and switch hitters favour the batter. */
function batterHasPlatoonEdge(batSide: 'L' | 'R' | 'S', pitchHand: 'L' | 'R'): boolean {
  return batSide === 'S' || batSide !== pitchHand
}

interface StatCell {
  readonly label: string
  readonly value: string
}

function StatCells({ cells }: { readonly cells: readonly StatCell[] }): ReactElement {
  return (
    <>
      {cells.map((cell) => (
        <div key={cell.label} className="stat-row">
          <span className="stat-label">{cell.label}</span>
          <span className="stat-value">{cell.value}</span>
        </div>
      ))}
    </>
  )
}

/**
 * "At Bat" sub-tab body. Renders as a fragment: LiveGameTab owns the surrounding
 * `.sub-tab-panel`, which is the screen's scroll owner. Sections size to their
 * content — there is no vertical budget to spend (DESIGN.md §6.3).
 */
export function LiveAtBat(): ReactElement {
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const gameFeedPitches = useGameStore((s) => s.gameFeedPitches)
  const reset = useGameStore((s) => s.reset)

  if (liveFeed === null || currentPlay === null) {
    return (
      <div className="no-game">
        Game not in progress
        <button type="button" className="btn-back" onClick={reset}>
          ← Games
        </button>
      </div>
    )
  }

  const { count, matchup, result, about, playEvents } = currentPlay
  const { linescore, plays } = liveFeed.liveData
  const teams = liveFeed.gameData.teams

  const pitches = playEvents.filter((event) => event.isPitch)
  const lastPitch = pitches[pitches.length - 1]
  const pitchData = lastPitch?.pitchData
  const hitData = lastPitch?.hitData

  const offense = linescore.offense
  const baserunners: readonly { readonly label: string; readonly occupied: boolean }[] = [
    { label: '1B', occupied: offense?.first !== undefined },
    { label: '2B', occupied: offense?.second !== undefined },
    { label: '3B', occupied: offense?.third !== undefined },
  ]

  const lineScore = [
    { abbr: teams.away.abbreviation, ...linescore.teams.away },
    { abbr: teams.home.abbreviation, ...linescore.teams.home },
  ]

  const pace = derivePace(plays.allPlays, currentPlay)
  const batSpeed = readBatSpeed(lastPitch, gameFeedPitches)
  const batterEdge = batterHasPlatoonEdge(matchup.batSide.code, matchup.pitchHand.code)

  const typeCode = lastPitch?.details.type?.code
  const callCode = lastPitch?.details.call?.code
  const isTopInning = linescore.isTopInning ?? about.halfInning === 'top'
  const inningNumber = linescore.currentInning ?? about.inning
  const battingTeam = isTopInning ? teams.away : teams.home
  const fieldingTeam = isTopInning ? teams.home : teams.away

  const paceCells: readonly StatCell[] = [
    { label: 'Count', value: `${count.balls}-${count.strikes}, ${count.outs} out` },
    { label: 'P-Count', value: String(pace.pitchCount) },
    { label: 'Thru Order', value: ordinal(pace.timeThroughOrder) },
  ]

  const pitchCells: readonly StatCell[] = [
    {
      label: 'Type',
      value: typeCode === undefined ? NO_VALUE : PITCH_TYPE_NAMES[typeCode] ?? typeCode,
    },
    { label: 'Velo', value: fixed(pitchData?.startSpeed, 1, ' mph') },
    // The feed declares pitchData.spinRate but only ever populates breaks.spinRate.
    { label: 'Spin', value: fixed(pitchData?.spinRate ?? pitchData?.breaks.spinRate, 0, ' rpm') },
    { label: 'Brk Ang', value: fixed(pitchData?.breaks.breakAngle, 1, '°') },
    { label: 'Brk Len', value: fixed(pitchData?.breaks.breakLength, 1, ' in') },
    {
      label: 'Brk V / H',
      value: `${fixed(pitchData?.breaks.breakVertical, 1, '')} / ${fixed(pitchData?.breaks.breakHorizontal, 1, '')}`,
    },
    { label: 'Extension', value: fixed(pitchData?.extension, 1, ' ft') },
    { label: 'Plate Time', value: fixed(pitchData?.plateTime, 3, ' s') },
  ]

  const contactCells: readonly StatCell[] = [
    { label: 'Exit Velo', value: fixed(hitData?.launchSpeed, 1, ' mph') },
    { label: 'Launch °', value: fixed(hitData?.launchAngle, 0, '°') },
    { label: 'Distance', value: fixed(hitData?.totalDistance, 0, ' ft') },
    { label: 'Hardness', value: hitData?.hardness ?? NO_VALUE },
    {
      label: `Bat Speed${batSpeed.isGameAverage ? ' (g.avg)' : ''}`,
      value: batSpeed.mph === null ? NO_VALUE : `${batSpeed.mph.toFixed(1)} mph`,
    },
    // Swing-path tilt is CSV-only on Savant and lags a day; the gf feed omits it.
    { label: 'Swing Tilt', value: NO_VALUE },
  ]

  return (
    <>
      <div className="game-header">
        <button type="button" className="btn-back" onClick={reset}>
          ← Games
        </button>
        <span className="game-score">
          {teams.away.abbreviation} {linescore.teams.away.runs} – {linescore.teams.home.runs}{' '}
          {teams.home.abbreviation}
        </span>
        <div className="bases">
          {baserunners.map((base) => (
            <span
              key={base.label}
              className={base.occupied ? 'base occupied' : 'base'}
              title={base.label}
            />
          ))}
        </div>
        <span className="counter">
          {isTopInning ? '↑' : '↓'} {inningNumber}
        </span>
      </div>

      {lineScore.map((team) => (
        <div key={team.abbr} className="team-row">
          <span className="team-name">{team.abbr}</span>
          <span className="stat-label">R</span>
          <span className="stat-value">{team.runs}</span>
          <span className="stat-label">H</span>
          <span className="stat-value">{team.hits}</span>
          <span className="stat-label">E</span>
          <span className="stat-value">{team.errors}</span>
        </div>
      ))}

      <div className="matchup-info">
        <div className="matchup-player">
          <span className="player-name">{matchup.batter.fullName}</span>
          <span className="card-scope">
            {matchup.batSide.code}HB{batterEdge ? ` ${matchup.batSide.code}✓` : ''}
          </span>
          <span className="team-name">{battingTeam.abbreviation} · at bat</span>
        </div>
        <div className="matchup-vs">VS</div>
        <div className="matchup-player">
          <span className="player-name">{matchup.pitcher.fullName}</span>
          <span className="card-scope">
            {matchup.pitchHand.code}HP{batterEdge ? '' : ` ${matchup.pitchHand.code}✓`}
          </span>
          <span className="team-name">{fieldingTeam.abbreviation} · pitching</span>
        </div>
      </div>

      <div className="panel-row">
        <div className="stat-grid stat-grid-3">
          <StatCells cells={paceCells} />
        </div>
      </div>

      <div className="zone-canvas">
        <ZonePlot pitches={pitches} size={ZONE_PLOT_SIZE} />
      </div>

      <div className="panel-row">
        <div className="section-title">
          <span>Last Pitch · {pitches.length} in AB</span>
          <span>{callCode === undefined ? NO_VALUE : CALL_NAMES[callCode] ?? callCode}</span>
        </div>
        <div className="stat-grid">
          <StatCells cells={pitchCells} />
        </div>
      </div>

      <div className="panel-row">
        <div className="section-title">
          <span>Contact</span>
          <span>{hitData?.trajectory ?? NO_VALUE}</span>
        </div>
        <div className="stat-grid">
          <StatCells cells={contactCells} />
        </div>
      </div>

      <div className="play-result">
        <strong>{result.event === '' ? 'At bat in progress' : result.event}</strong>
        <span>{result.description}</span>
        {result.rbi > 0 ? <span className="rbi">{result.rbi} RBI</span> : null}
      </div>
    </>
  )
}
