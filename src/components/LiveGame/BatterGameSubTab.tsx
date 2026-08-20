import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZonePlot } from '../Canvas/ZonePlot'
import { EmptyPanel, Stat, StatGrid } from '../ui'
import type { DataTableColumn, DataTableRow } from '../ui'
import type { CurrentPlay } from '../../api/types'
import {
  PitchCode,
  PitchShare,
  fixed,
  ordinal,
  percent,
  pitchesOf,
  rateOf,
  splitPitches,
  trajectoryLabel,
} from './GameSubTabShared'
import { ChartFrame, GameIdentity, GamePanel, GameTablePanel } from './GameSubTabPanels'
import { batSpeedFor, buildGameLine, buildMix } from './BatterGameModel'

/** ZonePlot draws its legend inside the square once it is at least this wide. */
const ZONE_SIZE = 172

const MIX_COLUMNS: readonly DataTableColumn[] = [
  { key: 'code', label: 'Pitch' },
  { key: 'share', label: 'Seen', align: 'right' },
  { key: 'count', label: '#', align: 'right' },
  { key: 'velo', label: 'Velo', align: 'right' },
  { key: 'whiff', label: 'Whiff', align: 'right' },
]

const AT_BAT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'inning', label: 'Inn' },
  { key: 'result', label: 'Result' },
  { key: 'pitches', label: 'P', align: 'right' },
  { key: 'count', label: 'Count', align: 'right' },
]

const CONTACT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'inning', label: 'Inn' },
  { key: 'type', label: 'Type' },
  { key: 'exit', label: 'EV', align: 'right' },
  { key: 'angle', label: 'LA', align: 'right' },
  { key: 'distance', label: 'Dist', align: 'right' },
  { key: 'bat', label: 'Bat', align: 'right' },
]

/**
 * "Batter Game" sub-tab body. Renders as a fragment: LiveGameTab owns the
 * surrounding `.sub-tab-panel`, the screen's only scroll owner. Every value is
 * derived from `liveFeed.liveData.plays.allPlays` plus the Savant rows already
 * in the store; this component issues no network requests.
 */
export function BatterGameSubTab(): ReactElement {
  const liveFeed = useGameStore((s) => s.liveFeed)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const gameFeedPitches = useGameStore((s) => s.gameFeedPitches)

  const matchup = currentPlay?.matchup
  if (liveFeed === null || matchup === undefined) {
    return (
      <EmptyPanel message="No at-bat in progress" hint="Waiting for the first plate appearance." />
    )
  }

  const rawPlays: unknown = liveFeed.liveData.plays.allPlays
  const allPlays: CurrentPlay[] = Array.isArray(rawPlays) ? rawPlays : []

  const batterId = matchup.batter.id
  const batterPlays = allPlays.filter((play) => play.matchup.batter.id === batterId)
  const batterPitches = pitchesOf(batterPlays)
  const completedPlays = batterPlays.filter((play) => play.result.event !== '')

  const split = splitPitches(batterPitches)
  const line = buildGameLine(completedPlays)
  const mix = buildMix(batterPitches)

  const swingPct = rateOf(split.swings, split.total)
  const whiffPct = rateOf(split.whiffs, split.swings)
  const chasePct = rateOf(split.chases, split.outOfZone)
  const zonePct = rateOf(split.inZone, split.zoned)
  const takenStrikePct = rateOf(split.called, split.total - split.swings)

  const mixRows: readonly DataTableRow[] = mix.map((entry) => ({
    code: <PitchCode code={entry.code} />,
    share: <PitchShare code={entry.code} share={entry.share} />,
    count: String(entry.count),
    velo: fixed(entry.avgVelo, 1),
    whiff: entry.swings === 0 ? null : percent(rateOf(entry.whiffs, entry.swings)),
  }))

  const atBatRows: readonly DataTableRow[] = completedPlays.map((play) => ({
    inning: ordinal(play.about.inning),
    result: play.result.event,
    pitches: String(play.playEvents.filter((event) => event.isPitch).length),
    count: `${String(play.count.balls)}-${String(play.count.strikes)}`,
  }))

  const contactRows: readonly DataTableRow[] = batterPlays.flatMap((play) => {
    const contact = play.playEvents.find((event) => event.isPitch && event.hitData !== undefined)
    const hit = contact?.hitData
    if (contact === undefined || hit === undefined) return []
    return [
      {
        inning: ordinal(play.about.inning),
        type: trajectoryLabel(hit.trajectory),
        exit: fixed(hit.launchSpeed, 1),
        angle: fixed(hit.launchAngle, 0, '\u00b0'),
        distance: fixed(hit.totalDistance, 0),
        bat: fixed(batSpeedFor(contact, gameFeedPitches), 1),
      },
    ]
  })

  const zoneCaption =
    `${String(split.called)} called · ${String(split.whiffs)} whiff · ` +
    `${String(split.fouls)} foul · ${String(split.inPlay)} in play · ${String(split.balls)} ball`

  const lineText =
    line.plateAppearances === 0
      ? 'first plate appearance'
      : `${String(line.hits)}-for-${String(line.atBats)}`

  return (
    <>
      <GameIdentity
        personId={matchup.batter.id}
        name={matchup.batter.fullName}
        role={`${matchup.batSide.code}HB vs ${matchup.pitchHand.code}HP · ${lineText}`}
      >
        <StatGrid minColumnWidth={56}>
          <Stat label="PA" value={String(line.plateAppearances)} />
          <Stat label="AB" value={String(line.atBats)} />
          <Stat label="H" value={String(line.hits)} />
          <Stat label="HR" value={String(line.homeRuns)} />
          <Stat label="RBI" value={String(line.rbi)} />
          <Stat label="BB" value={String(line.walks)} />
          <Stat label="K" value={String(line.strikeouts)} />
          <Stat label="Pitches" value={String(split.total)} />
        </StatGrid>
      </GameIdentity>

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
            <Stat label="Swing %" value={percent(swingPct)} />
            <Stat label="Whiff %" value={percent(whiffPct)} />
            <Stat label="Chase %" value={percent(chasePct)} />
            <Stat label="Zone %" value={percent(zonePct)} />
            <Stat label="Taken %" value={percent(takenStrikePct)} />
            <Stat label="Called" value={String(split.called)} />
            <Stat label="SwStr" value={String(split.whiffs)} />
            <Stat label="Foul" value={String(split.fouls)} />
            <Stat label="In Play" value={String(split.inPlay)} />
          </StatGrid>
        )}
      </GamePanel>

      <GameTablePanel
        title="Pitch Mix"
        meta={`${String(split.total)} seen`}
        columns={MIX_COLUMNS}
        rows={mixRows}
        emptyMessage="No pitch types classified yet"
        emptyHint="Gameday labels each pitch a moment after it is thrown."
      />

      <GameTablePanel
        title="At Bats"
        meta={`${String(line.hits)}-${String(line.atBats)}`}
        columns={AT_BAT_COLUMNS}
        rows={atBatRows}
        emptyMessage="First plate appearance in progress"
        emptyHint="Completed at-bats are listed here as the game unfolds."
      />

      <GameTablePanel
        title="Batted Balls"
        meta={`${String(contactRows.length)} in play`}
        columns={CONTACT_COLUMNS}
        rows={contactRows}
        emptyMessage="No balls in play yet"
        emptyHint="Exit velocity, launch angle and bat speed appear on contact."
      />

      <GamePanel
        title="Pitches Seen"
        meta={split.total === 0 ? undefined : `${String(split.total)} pitches`}
      >
        {split.total === 0 ? (
          <EmptyPanel
            message="No pitch locations yet"
            hint="The zone fills in from the first pitch."
          />
        ) : (
          <ChartFrame
            label={`Strike-zone plot of every pitch seen by ${matchup.batter.fullName}, catcher view`}
            caption={zoneCaption}
          >
            <ZonePlot pitches={batterPitches} size={ZONE_SIZE} />
          </ChartFrame>
        )}
      </GamePanel>
    </>
  )
}
