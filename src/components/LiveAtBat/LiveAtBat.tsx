import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { EmptyPanel, SectionTitle, Skeleton, Stat, StatGrid } from '../ui'
import { AtBatPanel } from './AtBatPanel'
import { MatchupCard } from './MatchupCard'
import { ScoreboardCard } from './ScoreboardCard'
import {
  batterHasPlatoonEdge,
  deriveBases,
  deriveBatterLine,
  derivePitchSequence,
  derivePitcherLine,
  readBatSpeed,
  readOffenseExtras,
  strikePercent,
} from './liveAtBatData'
import {
  NO_VALUE,
  PITCH_TYPE_NAMES,
  callName,
  fixed,
  humanizeEnum,
  humanizeSplit,
  ordinal,
} from './liveAtBatFormat'

interface Cell {
  readonly label: string
  readonly value: string
}

/** Stat renders `—` in --c-ink-subtle for an empty value, so absence stays quiet. */
function statCells(cells: readonly Cell[]): readonly ReactElement[] {
  return cells.map((cell) => (
    <Stat key={cell.label} label={cell.label} value={cell.value === NO_VALUE ? '' : cell.value} />
  ))
}

function LoadingState(): ReactElement {
  return (
    <>
      <section className="panel-row" aria-busy="true" aria-label="Loading scoreboard">
        <Skeleton height="var(--sp-6)" />
        <Skeleton height="var(--sp-8)" />
      </section>
      <section className="panel-row" aria-busy="true" aria-label="Loading matchup">
        <Skeleton height="var(--sp-8)" />
        <Skeleton height="var(--sp-6)" />
      </section>
      <section className="panel-row" aria-busy="true" aria-label="Loading at bat">
        <Skeleton height="calc(var(--sp-8) * 6)" />
      </section>
    </>
  )
}

function NoPlayState(): ReactElement {
  return (
    <section className="panel-row">
      <EmptyPanel
        message="No at-bat in progress"
        hint="Pick a game to follow pitch-by-pitch telemetry here."
      />
    </section>
  )
}

export function LiveAtBat(): ReactElement {
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const gameFeedPitches = useGameStore((s) => s.gameFeedPitches)

  if (liveFeed === null) return <LoadingState />
  if (currentPlay === null) return <NoPlayState />

  const { count, matchup, result, about, playEvents } = currentPlay
  const { linescore, plays } = liveFeed.liveData
  const teams = liveFeed.gameData.teams

  const pitches = playEvents.filter((event) => event.isPitch)
  const lastPitch = pitches[pitches.length - 1]
  const pitchData = lastPitch?.pitchData
  const hitData = lastPitch?.hitData
  const sequence = derivePitchSequence(pitches)

  const isTopInning = linescore.isTopInning ?? about.halfInning === 'top'
  const inningNumber = linescore.currentInning ?? about.inning
  const battingTeam = isTopInning ? teams.away : teams.home
  const fieldingTeam = isTopInning ? teams.home : teams.away

  const bases = deriveBases(linescore)
  const deck = readOffenseExtras(linescore)
  const pitcherLine = derivePitcherLine(plays.allPlays, currentPlay)
  const batterLine = deriveBatterLine(plays.allPlays, matchup.batter.id, about.atBatIndex)
  const batSpeed = readBatSpeed(lastPitch, gameFeedPitches)
  const batterEdge = batterHasPlatoonEdge(matchup.batSide.code, matchup.pitchHand.code)

  const typeCode = lastPitch?.details.type?.code
  const callCode = lastPitch?.details.call?.code

  const pitchCells: readonly Cell[] = [
    {
      label: 'Type',
      value: typeCode === undefined ? NO_VALUE : PITCH_TYPE_NAMES[typeCode] ?? typeCode,
    },
    { label: 'Velo', value: fixed(pitchData?.startSpeed, 1, ' mph') },
    // The feed declares pitchData.spinRate but only ever populates breaks.spinRate.
    { label: 'Spin', value: fixed(pitchData?.spinRate ?? pitchData?.breaks.spinRate, 0, ' rpm') },
    { label: 'End Velo', value: fixed(pitchData?.endSpeed, 1, ' mph') },
    { label: 'Brk Ang', value: fixed(pitchData?.breaks.breakAngle, 1, '°') },
    { label: 'Brk Len', value: fixed(pitchData?.breaks.breakLength, 1, ' in') },
    { label: 'Brk Vert', value: fixed(pitchData?.breaks.breakVertical, 1, '') },
    { label: 'Brk Horz', value: fixed(pitchData?.breaks.breakHorizontal, 1, '') },
    { label: 'Extension', value: fixed(pitchData?.extension, 1, ' ft') },
    { label: 'Plate Time', value: fixed(pitchData?.plateTime, 3, ' s') },
  ]

  const contactCells: readonly Cell[] = [
    { label: 'Exit Velo', value: fixed(hitData?.launchSpeed, 1, ' mph') },
    { label: 'Launch °', value: fixed(hitData?.launchAngle, 0, '°') },
    { label: 'Distance', value: fixed(hitData?.totalDistance, 0, ' ft') },
    { label: 'Hardness', value: humanizeEnum(hitData?.hardness) },
    {
      label: batSpeed.isGameAverage ? 'Bat Spd Avg' : 'Bat Speed',
      value: fixed(batSpeed.mph, 1, ' mph'),
    },
    // Swing-path tilt is CSV-only on Savant and lags a day; the gf feed omits it.
    { label: 'Swing Tilt', value: NO_VALUE },
  ]

  const batterCells: readonly Cell[] = [
    { label: 'AB', value: String(batterLine.atBats) },
    { label: 'Hits', value: String(batterLine.hits) },
    { label: 'HR', value: String(batterLine.homeRuns) },
    { label: 'RBI', value: String(batterLine.rbi) },
    { label: 'BB', value: String(batterLine.walks) },
    { label: 'SO', value: String(batterLine.strikeouts) },
  ]

  const pitcherCells: readonly Cell[] = [
    { label: 'Pitches', value: String(pitcherLine.pitchCount) },
    { label: 'Strikes', value: String(pitcherLine.strikes) },
    { label: 'Strike %', value: strikePercent(pitcherLine) },
    { label: 'Batters', value: String(pitcherLine.battersFaced) },
    { label: 'SO', value: String(pitcherLine.strikeouts) },
    { label: 'BB', value: String(pitcherLine.walks) },
    { label: 'Hits', value: String(pitcherLine.hits) },
    { label: 'Thru Ord', value: ordinal(pitcherLine.timeThroughOrder) },
  ]

  const eventLabel = result.event === '' ? 'At bat in progress' : result.event
  const hasDescription = result.description !== ''

  return (
    <>
      <ScoreboardCard
        feed={liveFeed}
        isTopInning={isTopInning}
        inningNumber={inningNumber}
        bases={bases}
      />

      <MatchupCard
        meta={`${isTopInning ? 'Top' : 'Bot'} ${inningNumber} · ${count.outs} out`}
        batter={{
          personId: matchup.batter.id,
          name: matchup.batter.fullName,
          teamId: battingTeam.id,
          teamAbbreviation: battingTeam.abbreviation,
          hand: `${matchup.batSide.code}HB`,
          line: batterLine.summary,
          hasPlatoonEdge: batterEdge,
        }}
        pitcher={{
          personId: matchup.pitcher.id,
          name: matchup.pitcher.fullName,
          teamId: fieldingTeam.id,
          teamAbbreviation: fieldingTeam.abbreviation,
          hand: `${matchup.pitchHand.code}HP`,
          line: pitcherLine.summary,
          hasPlatoonEdge: !batterEdge,
        }}
      />

      <AtBatPanel
        pitches={pitches}
        sequence={sequence}
        balls={count.balls}
        strikes={count.strikes}
        outs={count.outs}
        timeThroughOrder={pitcherLine.timeThroughOrder}
        situation={humanizeSplit(matchup.splits.menOnBase)}
        bases={bases}
        onDeck={deck.onDeck}
        inHole={deck.inHole}
      />

      <section className="panel-row" aria-label="Last pitch">
        <SectionTitle meta={callName(callCode)}>Last Pitch</SectionTitle>
        {lastPitch === undefined ? (
          <EmptyPanel
            message="No pitch thrown yet"
            hint="Velocity, spin and break appear the moment the pitcher delivers."
          />
        ) : (
          <StatGrid>{statCells(pitchCells)}</StatGrid>
        )}
      </section>

      <section className="panel-row" aria-label="Contact">
        <SectionTitle meta={humanizeEnum(hitData?.trajectory)}>Contact</SectionTitle>
        {hitData === undefined ? (
          <EmptyPanel
            message="No ball in play"
            hint="Exit velocity, launch angle and distance appear on contact."
          />
        ) : (
          <StatGrid>{statCells(contactCells)}</StatGrid>
        )}
      </section>

      <section className="panel-row" aria-label="Pitcher workload">
        <SectionTitle meta={matchup.pitcher.fullName}>Pitcher · Workload</SectionTitle>
        <StatGrid>{statCells(pitcherCells)}</StatGrid>
      </section>

      <section className="panel-row" aria-label="Batter game line">
        <SectionTitle meta={matchup.batter.fullName}>Batter · This Game</SectionTitle>
        <StatGrid>{statCells(batterCells)}</StatGrid>
      </section>

      <div className="play-result">
        <strong className="play-result__event">{eventLabel}</strong>
        {hasDescription ? (
          <span className="play-result__sep" aria-hidden="true"> · </span>
        ) : null}
        {hasDescription ? (
          <span className="play-result__detail">{result.description}</span>
        ) : null}
        {result.rbi > 0 ? <span className="rbi">{result.rbi} RBI</span> : null}
      </div>
    </>
  )
}
