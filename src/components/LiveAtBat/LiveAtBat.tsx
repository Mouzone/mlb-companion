import type { ReactElement } from 'react'
import type { LiveFeed } from '../../api/types'
import { useGameStore } from '../../store/gameStore'
import { Badge, EmptyPanel, Skeleton } from '../ui'
import type { BadgeTone } from '../ui'
import { AtBatPanel } from './AtBatPanel'
import { ContactStrip } from './ContactStrip'
import { LastPitchStrip } from './LastPitchStrip'
import { MatchupCard } from './MatchupCard'
import {
  batterHasPlatoonEdge,
  deriveBases,
  deriveBatterLine,
  derivePitchSequence,
  derivePitcherLine,
  isAdvisoryPlay,
  playIdOf,
  readOffenseExtras,
} from './liveAtBatData'
import type { BaseState } from './liveAtBatData'
import { derivePitchBaselines } from './lastPitchBaseline'
import { humanizeSplit } from './liveAtBatFormat'

type GameStatus = LiveFeed['gameData']['status']['abstractGameState']

const STATUS_TONE: Readonly<Record<GameStatus, BadgeTone>> = {
  Preview: 'preview',
  Live: 'live',
  Final: 'final',
}

function StatusStrip({
  feed,
  isTopInning,
  inningNumber,
  bases,
}: {
  readonly feed: LiveFeed
  readonly isTopInning: boolean
  readonly inningNumber: number
  readonly bases: readonly BaseState[]
}): ReactElement {
  const status = feed.gameData.status
  const occupied = bases.filter((base) => base.runner !== null)
  const basesLabel =
    occupied.length === 0
      ? 'Bases empty'
      : `Runners on ${occupied.map((base) => base.label).join(', ')}`

  return (
    <section className="status-strip" aria-label="Game status">
      <div className="bases" role="img" aria-label={basesLabel}>
        {bases.map((base) => (
          <span key={base.label} className={base.runner === null ? 'base' : 'base occupied'} />
        ))}
      </div>
      <Badge tone={STATUS_TONE[status.abstractGameState]}>{status.detailedState}</Badge>
      <span className="counter">
        {isTopInning ? 'Top' : 'Bot'} {inningNumber}
      </span>
    </section>
  )
}

/**
 * LiveAtBat — the top section of the game screen.
 *
 * A slim status strip, then who is facing whom, then the at-bat itself, then
 * the two live readings that change pitch to pitch.
 */

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
  const error = useGameStore((s) => s.error)

  // Without this the skeleton renders forever on a failed feed, which is
  // indistinguishable from a slow load and is the common case offline.
  if (liveFeed === null && error !== null) {
    return (
      <section className="live-atbat">
        <EmptyPanel
          message="Live feed unavailable"
          hint={`${error} — check your connection; polling resumes automatically.`}
        />
      </section>
    )
  }
  if (liveFeed === null) return <LoadingState />
  if (currentPlay === null || isAdvisoryPlay(currentPlay)) return <NoPlayState />

  const { count, matchup, result, about, playEvents } = currentPlay
  const { linescore, plays } = liveFeed.liveData
  const teams = liveFeed.gameData.teams

  const pitches = playEvents.filter((event) => event.isPitch)
  const lastPitch = pitches[pitches.length - 1]
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
  const batterEdge = batterHasPlatoonEdge(matchup.batSide.code, matchup.pitchHand.code)

  const baselines = derivePitchBaselines(
    gameFeedPitches,
    lastPitch?.details.type?.code,
    lastPitch === undefined ? null : playIdOf(lastPitch),
  )

  const eventLabel = result.event === '' ? 'At bat in progress' : result.event
  const hasDescription = result.description !== ''

  return (
    <>
      <StatusStrip
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

      <LastPitchStrip lastPitch={lastPitch} baselines={baselines} />

      <ContactStrip hitData={hitData} />

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
