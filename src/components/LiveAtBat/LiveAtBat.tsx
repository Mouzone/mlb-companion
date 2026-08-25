import type { ReactElement } from 'react'
import type { CurrentPlay, LiveFeed } from '../../api/types'
import { useGameStore } from '../../store/gameStore'
import { Badge, EmptyPanel, Segmented, Skeleton, Stat, StatGrid } from '../ui'
import type { BadgeTone, DataTableColumn, DataTableRow, SegmentedOption } from '../ui'
import { ordinal, percent, pitchesOf, rateOf, splitPitches } from '../LiveGame/GameSubTabShared'
import { GamePanel, GameTablePanel } from '../LiveGame/GameSubTabPanels'
import { buildGameLine } from '../LiveGame/BatterGameModel'
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

const PERSPECTIVE_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { id: 'pitcher', label: 'Pitcher' },
  { id: 'batter', label: 'Batter' },
]

const AT_BAT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'inning', label: 'Inn' },
  { key: 'result', label: 'Result' },
  { key: 'pitches', label: 'P', align: 'right' },
  { key: 'count', label: 'Count', align: 'right' },
]

/**
 * Batter-side detail that used to live in the Game tab: plate discipline over
 * every pitch this batter has seen today, plus his completed at-bats.
 */
function BatterDetail({
  allPlays,
  batterId,
}: {
  readonly allPlays: readonly CurrentPlay[]
  readonly batterId: number
}): ReactElement {
  const batterPlays = allPlays.filter((play) => play.matchup.batter.id === batterId)
  const split = splitPitches(pitchesOf(batterPlays))
  const completedPlays = batterPlays.filter((play) => play.result.event !== '')
  const line = buildGameLine(completedPlays)

  const rows: ReadonlyArray<DataTableRow> = completedPlays.map((play) => ({
    inning: ordinal(play.about.inning),
    result: play.result.event,
    pitches: String(play.playEvents.filter((event) => event.isPitch).length),
    count: `${String(play.count.balls)}-${String(play.count.strikes)}`,
  }))

  return (
    <>
      <GamePanel
        title="Plate Discipline"
        meta={split.total === 0 ? undefined : `${String(split.swings)} swings`}
      >
        {split.total === 0 ? (
          <EmptyPanel
            message="No pitches seen yet"
            hint="Discipline rates appear from the first pitch of the at-bat."
          />
        ) : (
          <StatGrid minColumnWidth={64}>
            <Stat label="Swing %" value={percent(rateOf(split.swings, split.total))} />
            <Stat label="Whiff %" value={percent(rateOf(split.whiffs, split.swings))} />
            <Stat label="Chase %" value={percent(rateOf(split.chases, split.outOfZone))} />
            <Stat label="Zone %" value={percent(rateOf(split.inZone, split.zoned))} />
            <Stat label="Taken %" value={percent(rateOf(split.called, split.total - split.swings))} />
            <Stat label="Called" value={String(split.called)} />
            <Stat label="SwStr" value={String(split.whiffs)} />
            <Stat label="Foul" value={String(split.fouls)} />
            <Stat label="In Play" value={String(split.inPlay)} />
          </StatGrid>
        )}
      </GamePanel>

      <GameTablePanel
        title="At Bats"
        meta={`${String(line.hits)}-${String(line.atBats)}`}
        columns={AT_BAT_COLUMNS}
        rows={rows}
        emptyMessage="First plate appearance in progress"
        emptyHint="Completed at-bats are listed here as the game unfolds."
      />
    </>
  )
}

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
  const matchupPerspective = useGameStore((s) => s.matchupPerspective)
  const setMatchupPerspective = useGameStore((s) => s.setMatchupPerspective)
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

      <Segmented
        options={PERSPECTIVE_OPTIONS}
        activeId={matchupPerspective}
        onSelect={(id) => { setMatchupPerspective(id as 'pitcher' | 'batter') }}
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

      {matchupPerspective === 'batter' ? (
        <BatterDetail allPlays={plays.allPlays} batterId={matchup.batter.id} />
      ) : null}

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
